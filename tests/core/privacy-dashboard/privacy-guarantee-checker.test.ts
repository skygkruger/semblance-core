/**
 * Step 29 — PrivacyGuaranteeChecker tests (Commit 3).
 * Tests the 7 architectural privacy guarantees.
 */

import { describe, it, expect } from 'vitest';
import { PrivacyGuaranteeChecker } from '@semblance/core/privacy/privacy-guarantee-checker';

const checker = new PrivacyGuaranteeChecker();

describe('PrivacyGuaranteeChecker (Step 29)', () => {
  it('returns all 7 guarantees', () => {
    const guarantees = checker.check();
    expect(guarantees).toHaveLength(7);
  });

  it('each guarantee has verified status', () => {
    const guarantees = checker.check();
    for (const g of guarantees) {
      expect(g.status).toBe('verified');
    }
  });

  it('each guarantee has name and description', () => {
    const guarantees = checker.check();
    for (const g of guarantees) {
      expect(g.name).toBeTruthy();
      expect(g.description).toBeTruthy();
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.description.length).toBeGreaterThan(10);
    }
  });

  it('each guarantee has verifiedAt timestamp', () => {
    const guarantees = checker.check();
    for (const g of guarantees) {
      expect(g.verifiedAt).toBeTruthy();
      // Must be a valid ISO timestamp
      expect(new Date(g.verifiedAt).getTime()).not.toBeNaN();
    }
  });

  it('guarantee ids are unique', () => {
    const guarantees = checker.check();
    const ids = guarantees.map(g => g.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
