/**
 * Step 29 — Digest integration tests (Commit 7).
 * Tests generateWithComparison() on DailyDigestGenerator.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { DailyDigestGenerator } from '@semblance/core/agent/daily-digest';
import type { ComparisonStatement } from '@semblance/core/privacy/types';

let db: InstanceType<typeof Database>;

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('DailyDigestGenerator.generateWithComparison (Step 29)', () => {
  it('includes comparison in summary when provider is present', async () => {
    const mockProvider = {
      async getComparisonStatementOnly(): Promise<ComparisonStatement> {
        return {
          segments: [{ category: 'emails', count: 500, label: '500 emails' }],
          totalDataPoints: 500,
          summaryText: 'Your Semblance has indexed 500 emails. When you open ChatGPT, it knows nothing.',
          generatedAt: new Date().toISOString(),
        };
      },
    };

    const gen = new DailyDigestGenerator(db as unknown as DatabaseHandle, {
      comparisonStatementProvider: mockProvider,
    });

    const digest = await gen.generateWithComparison();
    expect(digest.summary).toContain('ChatGPT, it knows nothing');
  });

  it('works when comparison provider is absent', async () => {
    const gen = new DailyDigestGenerator(db as unknown as DatabaseHandle);
    const digest = await gen.generateWithComparison();
    expect(digest).toBeDefined();
    expect(digest.summary).toBeTruthy();
    // Should not contain comparison text
    expect(digest.summary).not.toContain('ChatGPT');
  });

  it('comparison provider errors do not break digest', async () => {
    const brokenProvider = {
      async getComparisonStatementOnly(): Promise<ComparisonStatement> {
        throw new Error('Provider crashed');
      },
    };

    const gen = new DailyDigestGenerator(db as unknown as DatabaseHandle, {
      comparisonStatementProvider: brokenProvider,
    });

    const digest = await gen.generateWithComparison();
    expect(digest).toBeDefined();
    expect(digest.summary).toBeTruthy();
  });
});
