import { describe, expect, it } from 'vitest';
import type { VaultChatGrounding } from '@semblance/core/agent/context/vault-chat-grounding.js';
import { extractVaultSourceCitations } from '@semblance/core/agent/context/citation-validator.js';

class FakeVaultChatGrounding implements VaultChatGrounding {
  constructor(private readonly allowedSourceId: string) {}

  async retrieve(): Promise<{ chunks: Array<{ sourceId: string; title: string; text: string }>; grantId: string }> {
    return {
      grantId: 'grant-test-001',
      chunks: [{ sourceId: this.allowedSourceId, title: 'Budget', text: 'Budget summary' }],
    };
  }

  validateCitations(
    grantId: string,
    citedSourceIds: string[],
  ): { ok: true } | { ok: false; rejected: string[] } {
    if (grantId !== 'grant-test-001') {
      return { ok: false, rejected: citedSourceIds };
    }
    const rejected = citedSourceIds.filter((id) => id !== this.allowedSourceId);
    return rejected.length > 0 ? { ok: false, rejected } : { ok: true };
  }
}

describe('Orchestrator vault citation enforcement path', () => {
  it('rejects fabricated citations from model output', async () => {
    const grounding = new FakeVaultChatGrounding('file:real-source');
    const { grantId } = await grounding.retrieve('budget', 5);

    const message = 'Summary [[source:file:real-source]] and [[source:file:fabricated]]';
    const citedSourceIds = extractVaultSourceCitations(message);
    const validation = grounding.validateCitations(grantId, citedSourceIds);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.rejected).toContain('file:fabricated');
    }
  });
});
