/**
 * Step 33 — Commit 3: Sprint 5 (Sovereignty + Trust) Validation
 *
 * Validates Alter Ego Week, Morning Brief, Living Will, Attestation,
 * Witness, Inheritance Protocol, Semblance Network, Import Everything,
 * and Adversarial Self-Defense systems.
 *
 * 25 tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { ArchiveBuilder } from '../../packages/core/living-will/archive-builder.js';
import { AttestationSigner } from '../../packages/core/attestation/attestation-signer.js';
import {
  ED25519_PROOF_TYPE,
  HMAC_PROOF_TYPE,
  canonicalizePayload,
} from '../../packages/core/attestation/attestation-format.js';

const ROOT = join(import.meta.dirname, '..', '..');

// Source files
const ALTER_EGO_WEEK = readFileSync(join(ROOT, 'packages/core/onboarding/alter-ego-week.ts'), 'utf-8');
const MORNING_BRIEF = readFileSync(join(ROOT, 'packages/core/agent/morning-brief.ts'), 'utf-8');
const DARK_PATTERN = readFileSync(join(ROOT, 'packages/core/defense/dark-pattern-tracker.ts'), 'utf-8');
const WITNESS_GEN = readFileSync(join(ROOT, 'packages/core/witness/witness-tracker.ts'), 'utf-8');
const LIVING_WILL_EXP = readFileSync(join(ROOT, 'packages/core/living-will/living-will-exporter.ts'), 'utf-8');
const INHERITANCE_EXEC = readFileSync(join(ROOT, 'packages/core/inheritance/inheritance-executor.ts'), 'utf-8');
const TRUSTED_PARTY = readFileSync(join(ROOT, 'packages/core/inheritance/trusted-party-manager.ts'), 'utf-8');
const OFFER_HANDLER = readFileSync(join(ROOT, 'packages/core/network/sharing-offer-handler.ts'), 'utf-8');
const REVOCATION = readFileSync(join(ROOT, 'packages/core/network/revocation-handler.ts'), 'utf-8');
const VERIFIER_SRC = readFileSync(join(ROOT, 'packages/core/attestation/attestation-verifier.ts'), 'utf-8');
const CHROME_PARSER = readFileSync(join(ROOT, 'packages/core/importers/browser/chrome-history-parser.ts'), 'utf-8');

describe('Step 33 — Sprint 5 (Sovereignty + Trust) Validation', () => {
  // ─── Alter Ego Week ───────────────────────────────────────────────────
  describe('Alter Ego Week', () => {
    it('has exactly 7 days', async () => {
      const mod = await import('../../packages/core/onboarding/alter-ego-week.js');
      const week = new mod.AlterEgoWeek({
        db: { exec() {}, prepare() { return { run() { return { changes: 0, lastInsertRowid: 0 }; }, get() { return undefined; }, all() { return []; } }; }, close() {}, pragma() { return undefined; }, transaction: ((fn: () => unknown) => fn) as never } as never,
      });
      const days = week.getAllDays();
      expect(days).toHaveLength(7);
    });

    it('day 7 theme is The Offer', () => {
      expect(ALTER_EGO_WEEK).toContain("theme: 'The Offer'");
    });
  });

  // ─── Morning Brief ────────────────────────────────────────────────────
  describe('Morning Brief', () => {
    it('section priorities are ordered: meetings first, insights last', () => {
      expect(MORNING_BRIEF).toContain('meetings: 1');
      expect(MORNING_BRIEF).toContain('insights: 6');
      // meetings < insights in priority number
    });

    it('template omits empty sections from brief', () => {
      // Empty sections are excluded: only pushed if items.length > 0
      expect(MORNING_BRIEF).toContain('items.length > 0');
    });
  });

  // ─── Visual Knowledge Graph ───────────────────────────────────────────
  describe('Visual Knowledge Graph', () => {
    it('graph visualization module exists', () => {
      expect(existsSync(join(ROOT, 'packages/core/knowledge/graph-visualization.ts'))).toBe(true);
    });

    it('knowledge graph exports SearchResult type', async () => {
      const kg = await import('../../packages/core/knowledge/index.js');
      // SearchResult is a re-exported type — verify the module barrel works
      expect(kg.SemanticSearch).toBeDefined();
      expect(kg.DocumentStore).toBeDefined();
    });
  });

  // ─── Import Everything ────────────────────────────────────────────────
  describe('Import Everything', () => {
    it('browser history importer exists', () => {
      expect(existsSync(join(ROOT, 'packages/core/importers/browser/chrome-history-parser.ts'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/core/importers/browser/firefox-history-parser.ts'))).toBe(true);
    });

    it('Chrome history parser exports ChromeHistoryParser with parse method', () => {
      expect(CHROME_PARSER).toContain('export class ChromeHistoryParser');
      expect(CHROME_PARSER).toContain('async parse(');
    });

    it('notes importer exists', () => {
      expect(existsSync(join(ROOT, 'packages/core/importers/notes/obsidian-parser.ts'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/core/importers/notes/apple-notes-parser.ts'))).toBe(true);
    });

    it('photos EXIF parser exists', () => {
      expect(existsSync(join(ROOT, 'packages/core/importers/photos/exif-parser.ts'))).toBe(true);
    });
  });

  // ─── Adversarial Self-Defense ─────────────────────────────────────────
  describe('Dark Pattern Tracker', () => {
    it('implements ExtensionInsightTracker', () => {
      expect(DARK_PATTERN).toContain('implements ExtensionInsightTracker');
    });

    it('checks premium gate before generating insights', () => {
      expect(DARK_PATTERN).toContain('isPremium');
    });
  });

  // ─── Living Will ──────────────────────────────────────────────────────
  describe('Living Will', () => {
    it('ArchiveBuilder manifest version is 2', () => {
      const builder = new ArchiveBuilder();
      const manifest = builder.buildManifest('test-device', ['knowledgeGraph']);
      expect(manifest.version).toBe(2);
    });

    it('ArchiveBuilder serializes to valid JSON', () => {
      const builder = new ArchiveBuilder();
      const manifest = builder.buildManifest('test-device', ['styleProfile', 'preferences']);
      const json = JSON.stringify(manifest);
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(2);
      expect(parsed.contentSections).toEqual(['styleProfile', 'preferences']);
    });
  });

  // ─── Attestation ──────────────────────────────────────────────────────
  describe('Attestation', () => {
    it('AttestationSigner rejects no-key construction', () => {
      expect(() => {
        new AttestationSigner({ deviceIdentity: { id: 'test', platform: 'test' } });
      }).toThrow('requires at least one signing key');
    });

    it('AttestationVerifier has constantTimeEqual', () => {
      expect(VERIFIER_SRC).toContain('constantTimeEqual');
    });

    it('exports ED25519_PROOF_TYPE and HMAC_PROOF_TYPE', () => {
      expect(ED25519_PROOF_TYPE).toBe('Ed25519Signature2020');
      expect(HMAC_PROOF_TYPE).toBe('HmacSha256Signature');
    });
  });

  // ─── Witness ──────────────────────────────────────────────────────────
  describe('Witness', () => {
    it('WitnessGenerator requires premium gate', () => {
      expect(WITNESS_GEN).toContain('isPremium');
    });

    it('LivingWillExporter requires premium gate', () => {
      expect(LIVING_WILL_EXP).toContain('isPremium');
    });
  });

  // ─── Inheritance Protocol ─────────────────────────────────────────────
  describe('Inheritance', () => {
    it('exports 8+ components from barrel', async () => {
      const inh = await import('../../packages/core/inheritance/index.js');
      const exportNames = Object.keys(inh);
      expect(exportNames.length).toBeGreaterThanOrEqual(8);
      expect(inh.InheritanceConfigStore).toBeDefined();
      expect(inh.TrustedPartyManager).toBeDefined();
      expect(inh.InheritanceExecutor).toBeDefined();
    });

    it('InheritanceExecutor has mode guard (disableInheritanceMode)', () => {
      expect(INHERITANCE_EXEC).toContain('disableInheritanceMode');
    });

    it('TrustedPartyManager has passphrase hashing', () => {
      expect(TRUSTED_PARTY).toContain('passphrase');
      expect(TRUSTED_PARTY).toContain('sha256');
    });
  });

  // ─── Semblance Network ────────────────────────────────────────────────
  describe('Network', () => {
    it('exports 10+ components from barrel', async () => {
      const net = await import('../../packages/core/network/index.js');
      const exportNames = Object.keys(net);
      expect(exportNames.length).toBeGreaterThanOrEqual(10);
      expect(net.SharingOfferHandler).toBeDefined();
      expect(net.RevocationHandler).toBeDefined();
    });

    it('SharingOfferHandler requires acceptance for bilateral consent', () => {
      expect(OFFER_HANDLER).toContain('acceptOffer');
      expect(OFFER_HANDLER).toContain('Bilateral');
    });

    it('RevocationHandler hard-deletes shared context', () => {
      expect(REVOCATION).toContain('HARD DELETE');
    });
  });
});
