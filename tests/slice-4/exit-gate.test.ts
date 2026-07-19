import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapLocalVault,
  ingestScannedFilesToVault,
  scannedFileToIngestInput,
  VaultChatGroundingImpl,
} from '@semblance/vault/src/index.js';
import { extractVaultSourceCitations } from '@semblance/core/agent/context/citation-validator.js';
import {
  MemoryProposalStore,
  confirmProposal,
  correctProposal,
  createMemoryProposal,
} from '@semblance/core/agent/memory/memory-proposal.js';
import {
  promoteConfirmedMemory,
  type MemoryPromotionWriter,
} from '@semblance/core/agent/memory/memory-promotion.js';
import {
  confirmAssertion,
  createProvenanceRecord,
  createRetentionPolicy,
  createSourceRef,
  proposeAssertion,
} from '@semblance/vault/src/provenance/index.js';
import {
  EgressDeniedError,
  installEgressGuard,
  isGatewayNetworkEntitled,
} from '@semblance/core/security/egress-guard.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

const ROOT_KEY = randomBytes(32);
const NOW_MS = Date.parse('2026-07-18T20:00:00.000Z');
const DEVICE_ID = 'device-slice4-exit-gate';
const PRINCIPAL_ID = 'principal-slice4-exit-gate';

describe('Slice 4 exit gate', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  it('indexes known fixture files into vault with matching source count', () => {
    const fixtureRoot = makeTempDir('slice4-fixtures-');
    const files = ['alpha-notes.txt', 'beta-report.txt', 'gamma-plan.txt'];
    for (const name of files) {
      writeFileSync(join(fixtureRoot, name), `${name} content`, 'utf-8');
    }

    const dataDir = makeTempDir('slice4-vault-data-');
    const vault = bootstrapLocalVault({ dataDir, deviceId: DEVICE_ID });

    ingestScannedFilesToVault({
      eventLog: vault.eventLog,
      deviceId: DEVICE_ID,
      membershipEpoch: 1,
      files: files.map((name, index) => scannedFileToIngestInput({
        absolutePath: join(fixtureRoot, name),
        documentId: `doc-slice4-${index + 1}`,
        mimeType: 'text/plain',
      })),
    });

    const sources = vault.surface.listSources().filter((source) => !source.deleted);
    expect(sources).toHaveLength(files.length);
    expect(sources.map((source) => source.title).sort()).toEqual(files.sort());

    vault.close();
  });

  it('returns grounded citations and rejects fabricated citations', async () => {
    const fixtureRoot = makeTempDir('slice4-chat-fixtures-');
    const budgetPath = join(fixtureRoot, 'budget-summary.txt');
    writeFileSync(budgetPath, 'Quarterly budget summary content', 'utf-8');

    const dataDir = makeTempDir('slice4-chat-vault-');
    const vault = bootstrapLocalVault({ dataDir, deviceId: DEVICE_ID });

    const ingestResult = ingestScannedFilesToVault({
      eventLog: vault.eventLog,
      deviceId: DEVICE_ID,
      membershipEpoch: 1,
      files: [
        scannedFileToIngestInput({
          absolutePath: budgetPath,
          documentId: 'doc-budget-slice4',
          mimeType: 'text/plain',
        }),
      ],
    });

    const allowedSourceId = ingestResult.results[0]!.sourceId;
    const grounding = new VaultChatGroundingImpl({
      eventLog: vault.eventLog,
      principalId: PRINCIPAL_ID,
      deviceId: DEVICE_ID,
      clock: () => NOW_MS,
    });

    const retrieval = await grounding.retrieve('budget', 5);
    expect(retrieval.chunks.length).toBeGreaterThan(0);
    expect(retrieval.chunks.some((chunk) => chunk.sourceId === allowedSourceId)).toBe(true);

    const assistantMessage = `Summary [[source:${allowedSourceId}]] with context.`;
    const cited = extractVaultSourceCitations(assistantMessage);
    expect(grounding.validateCitations(retrieval.grantId, cited)).toEqual({ ok: true });

    const fabricatedMessage = `Summary [[source:${allowedSourceId}]] and [[source:file:fabricated-slice4]]`;
    const fabricatedCited = extractVaultSourceCitations(fabricatedMessage);
    const rejected = grounding.validateCitations(retrieval.grantId, fabricatedCited);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.rejected).toContain('file:fabricated-slice4');
    }

    vault.close();
  });

  it('persists corrected memory across store reload', async () => {
    const dbPath = join(makeTempDir('slice4-memory-db-'), 'memory.db');
    const openStore = () => new MemoryProposalStore(new Database(dbPath) as unknown as DatabaseHandle);

    const original = createMemoryProposal({
      text: 'email: responds within 1 hour',
      derivationMethod: 'direct_extraction',
      confidence: 0.9,
      evidenceSourceIds: ['message:slice4-001'],
    });
    const confirmed = confirmProposal(original);
    openStore().save(confirmed);

    const corrected = correctProposal(confirmed, {
      text: 'email: responds within 2 hours',
    });
    openStore().save(corrected);

    const reloaded = openStore().getById(corrected.id);
    expect(reloaded?.status).toBe('corrected');
    expect(reloaded?.text).toBe('email: responds within 2 hours');
    expect(reloaded?.priorProposalId).toBe(confirmed.id);

    const dataDir = makeTempDir('slice4-memory-vault-');
    const vault = bootstrapLocalVault({ dataDir, deviceId: DEVICE_ID });
    const promotedIds: string[] = [];

    const writer: MemoryPromotionWriter = {
      promoteAssertion(assertion) {
        const provenance = createProvenanceRecord({
          sourceRefs: assertion.evidenceSourceIds.map((sourceId) => createSourceRef({
            sourceId,
            sourceType: 'memory',
            uri: `memory://${sourceId}`,
            ingestedAt: assertion.createdAt,
          })),
          derivationMethod: assertion.derivationMethod === 'corrected' ? 'corrected' : 'direct_extraction',
          confidence: assertion.confidence,
          sensitivity: 'personal',
          retention: createRetentionPolicy({
            policyId: 'retention-slice4-memory',
            retainUntil: new Date(NOW_MS + 365 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });

        const proposed = proposeAssertion({
          assertionId: assertion.assertionId,
          subject: assertion.subject,
          predicate: assertion.predicate,
          object: assertion.object,
          provenance,
          createdAt: assertion.createdAt,
        });
        const confirmedAssertion = confirmAssertion(proposed, {
          confirmedAt: new Date(NOW_MS).toISOString(),
        });

        vault.eventLog.writer.append({
          eventId: `event-${assertion.assertionId}`,
          dataDomain: 'personal',
          deviceId: DEVICE_ID,
          membershipEpoch: 1,
          eventType: 'assertion_confirmed',
          sourceRefs: provenance.sourceRefs,
          sensitivity: 'personal',
          occurredAt: new Date(NOW_MS).toISOString(),
          payloadPlaintext: JSON.stringify({ assertion: confirmedAssertion }),
        });

        promotedIds.push(confirmedAssertion.assertionId);
        return { assertionId: confirmedAssertion.assertionId };
      },
    };

    await promoteConfirmedMemory(corrected, writer);
    const assertions = vault.surface.listAssertions();
    expect(assertions.some((assertion) => assertion.object === 'responds within 2 hours')).toBe(true);
    expect(promotedIds).toHaveLength(1);

    vault.close();
  });

  it('denies fetch egress on chat/file grounding modules', async () => {
    delete process.env.SEMBLANCE_NETWORK_ROLE;
    installEgressGuard();
    expect(isGatewayNetworkEntitled()).toBe(false);

    const chatGroundingSource = await import('@semblance/vault/src/chat/vault-chat-grounding.js');
    const citationSource = await import('@semblance/core/agent/context/citation-validator.js');
    const fileIngestSource = await import('@semblance/vault/src/ingest/file-ingest.js');

    expect(chatGroundingSource.VaultChatGroundingImpl).toBeDefined();
    expect(citationSource.extractVaultSourceCitations).toBeDefined();
    expect(fileIngestSource.ingestScannedFilesToVault).toBeDefined();

    let denied = 0;
    for (let i = 0; i < 20; i += 1) {
      try {
        await fetch(`https://example.com/slice4-chat-${i}`);
      } catch (error) {
        if (error instanceof EgressDeniedError) {
          denied += 1;
        }
      }
    }

    expect(denied).toBe(20);
    vi.restoreAllMocks();
  });
});
