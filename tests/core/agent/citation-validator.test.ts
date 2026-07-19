import { describe, expect, it } from 'vitest';
import {
  extractVaultSourceCitations,
  validateVaultCitations,
} from '@semblance/core/agent/context/citation-validator.js';

describe('validateVaultCitations', () => {
  it('accepts citations that match authorized sourceIds', () => {
    const authorized = new Set(['file:abc', 'file:def']);
    const result = validateVaultCitations(authorized, ['file:abc']);
    expect(result).toEqual({ ok: true });
  });

  it('rejects unknown or fabricated sourceIds', () => {
    const authorized = new Set(['file:abc']);
    const result = validateVaultCitations(authorized, ['file:abc', 'file:fabricated']);
    expect(result).toEqual({ ok: false, rejected: ['file:fabricated'] });
  });
});

describe('extractVaultSourceCitations', () => {
  it('extracts [[source:...]] markers from model output', () => {
    const text = 'Per [[source:file:abc]] the budget is on track. Also see [[source:file:def]].';
    expect(extractVaultSourceCitations(text)).toEqual(['file:abc', 'file:def']);
  });
});
