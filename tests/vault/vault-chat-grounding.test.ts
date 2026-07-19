import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { describe, expect, it, afterEach } from 'vitest';
import {
  createEventLog,
  ingestScannedFilesToVault,
  scannedFileToIngestInput,
  VaultChatGroundingImpl,
} from '@semblance/vault/src/index.js';

const ROOT_KEY = randomBytes(32);
const NOW_MS = Date.parse('2026-07-18T14:00:00.000Z');
const DEVICE_ID = 'device-chat-grounding-test';
const PRINCIPAL_ID = 'principal-chat-grounding-test';

describe('VaultChatGroundingImpl', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function openVaultWithFiles(): {
    log: ReturnType<typeof createEventLog>;
  } {
    const root = mkdtempSync(join(tmpdir(), 'vault-chat-grounding-'));
    tempDirs.push(root);

    const allowedPath = join(root, 'budget-report.txt');
    const blockedPath = join(root, 'secret-salary.txt');
    writeFileSync(allowedPath, 'budget content', 'utf-8');
    writeFileSync(blockedPath, 'salary content', 'utf-8');

    const vaultDir = mkdtempSync(join(tmpdir(), 'vault-chat-grounding-db-'));
    tempDirs.push(vaultDir);
    const db = new Database(join(vaultDir, 'vault-events.db'));
    const log = createEventLog({
      db,
      rootKey: ROOT_KEY,
      writerId: randomBytes(8).toString('hex'),
    });

    ingestScannedFilesToVault({
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 1,
      files: [
        scannedFileToIngestInput({
          absolutePath: allowedPath,
          documentId: 'doc-budget',
          mimeType: 'text/plain',
        }),
        scannedFileToIngestInput({
          absolutePath: blockedPath,
          documentId: 'doc-salary',
          mimeType: 'text/plain',
        }),
      ],
    });

    return { log };
  }

  it('retrieve returns only query-matching authorized sources', async () => {
    const { log } = openVaultWithFiles();
    const grounding = new VaultChatGroundingImpl({
      eventLog: log,
      principalId: PRINCIPAL_ID,
      deviceId: DEVICE_ID,
      clock: () => NOW_MS,
    });

    const result = await grounding.retrieve('budget', 5);

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.some((chunk) => chunk.title.toLowerCase().includes('budget'))).toBe(true);
    expect(result.chunks.some((chunk) => chunk.title.toLowerCase().includes('salary'))).toBe(false);

    const authorizedId = result.chunks[0]!.sourceId;
    expect(grounding.validateCitations(result.grantId, [authorizedId])).toEqual({ ok: true });
    expect(grounding.validateCitations(result.grantId, ['file:totally-fabricated'])).toEqual({
      ok: false,
      rejected: ['file:totally-fabricated'],
    });
  });
});
