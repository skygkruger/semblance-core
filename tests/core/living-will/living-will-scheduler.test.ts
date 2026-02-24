/**
 * Step 26 — LivingWillScheduler tests (Commit 5).
 * Tests cadence logic, passphrase handling, and scheduled exports.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { LivingWillScheduler } from '@semblance/core/living-will/living-will-scheduler';
import type { LivingWillExportResult } from '@semblance/core/living-will/types';

let db: InstanceType<typeof Database>;

function makeMockExporter(result?: Partial<LivingWillExportResult>) {
  return {
    initSchema: vi.fn(),
    export: vi.fn(async () => ({
      success: true,
      archivePath: '/tmp/scheduled.semblance',
      sectionCounts: { knowledgeGraph: 5 },
      ...result,
    })),
    getExportHistory: vi.fn(() => []),
  };
}

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('LivingWillScheduler (Step 26)', () => {
  it('weekly cadence marks as due after 7 days', () => {
    const scheduler = new LivingWillScheduler({
      db: db as unknown as DatabaseHandle,
      exporter: makeMockExporter() as never,
      getPassphrase: async () => 'pass',
      outputPath: '/tmp/out.semblance',
    });
    scheduler.configure('weekly');

    // Manually set last_run_at to 8 days ago
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    db.prepare('UPDATE living_will_schedule SET last_run_at = ? WHERE id = 1').run(eightDaysAgo);

    expect(scheduler.isDue()).toBe(true);
  });

  it('monthly cadence marks as due after 30 days', () => {
    const scheduler = new LivingWillScheduler({
      db: db as unknown as DatabaseHandle,
      exporter: makeMockExporter() as never,
      getPassphrase: async () => 'pass',
      outputPath: '/tmp/out.semblance',
    });
    scheduler.configure('monthly');

    // Set last_run_at to 31 days ago
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86_400_000).toISOString();
    db.prepare('UPDATE living_will_schedule SET last_run_at = ? WHERE id = 1').run(thirtyOneDaysAgo);

    expect(scheduler.isDue()).toBe(true);
  });

  it('skips export when passphrase is unavailable', async () => {
    const scheduler = new LivingWillScheduler({
      db: db as unknown as DatabaseHandle,
      exporter: makeMockExporter() as never,
      getPassphrase: async () => null,
      outputPath: '/tmp/out.semblance',
    });
    scheduler.configure('weekly');
    // No last_run_at means it's immediately due

    const result = await scheduler.checkAndRun();

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('passphrase_unavailable');
    expect(result.ran).toBe(false);
  });

  it('runs export when due and passphrase available', async () => {
    const mockExporter = makeMockExporter();
    const scheduler = new LivingWillScheduler({
      db: db as unknown as DatabaseHandle,
      exporter: mockExporter as never,
      getPassphrase: async () => 'my-pass',
      outputPath: '/tmp/sched.semblance',
    });
    scheduler.configure('weekly');
    // No last_run_at = immediately due

    const result = await scheduler.checkAndRun();

    expect(result.ran).toBe(true);
    expect(result.skipped).toBe(false);
    expect(mockExporter.export).toHaveBeenCalled();
  });

  it('disabled cadence never marks as due', () => {
    const scheduler = new LivingWillScheduler({
      db: db as unknown as DatabaseHandle,
      exporter: makeMockExporter() as never,
      getPassphrase: async () => 'pass',
      outputPath: '/tmp/out.semblance',
    });
    scheduler.configure('disabled');

    expect(scheduler.isDue()).toBe(false);
  });
});
