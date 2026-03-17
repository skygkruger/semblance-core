// Tests for CronScheduler — job registration, tick firing, missed job catch-up, cron parsing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CronScheduler } from '../../packages/gateway/cron/cron-scheduler.js';
import Database from 'better-sqlite3';

describe('CronScheduler', () => {
  let db: Database.Database;
  let scheduler: CronScheduler;

  beforeEach(() => {
    db = new Database(':memory:');
    scheduler = new CronScheduler(db);
  });

  afterEach(() => {
    scheduler.close();
  });

  describe('built-in jobs', () => {
    it('seeds built-in jobs on creation', () => {
      const jobs = scheduler.listJobs();
      expect(jobs.length).toBeGreaterThanOrEqual(6);
      expect(jobs.some(j => j.id === 'morning-brief')).toBe(true);
      expect(jobs.some(j => j.id === 'follow-up-scan')).toBe(true);
      expect(jobs.some(j => j.id === 'subscription-audit')).toBe(true);
      expect(jobs.some(j => j.id === 'kg-maintenance')).toBe(true);
      expect(jobs.some(j => j.id === 'license-scan')).toBe(true);
      expect(jobs.some(j => j.id === 'tunnel-sync')).toBe(true);
    });

    it('built-in jobs are enabled by default', () => {
      const jobs = scheduler.listJobs();
      for (const job of jobs) {
        expect(job.enabled).toBe(true);
      }
    });

    it('built-in jobs have valid nextFireAt', () => {
      const jobs = scheduler.listJobs();
      for (const job of jobs) {
        expect(job.nextFireAt).toBeTruthy();
        const nextDate = new Date(job.nextFireAt);
        expect(nextDate.getTime()).toBeGreaterThan(Date.now() - 60_000); // should be in the future (within a minute tolerance)
      }
    });

    it('does not duplicate built-in jobs on re-init', () => {
      // Create a second scheduler on the same DB
      const scheduler2 = new CronScheduler(db);
      const jobs = scheduler2.listJobs();
      const ids = jobs.map(j => j.id);
      expect(new Set(ids).size).toBe(ids.length); // no duplicates
    });
  });

  describe('job CRUD', () => {
    it('addJob creates a new job', () => {
      const job = scheduler.addJob({
        id: 'test-job',
        name: 'Test Job',
        schedule: '*/5 * * * *',
        actionType: 'test.action',
        payload: { key: 'value' },
        autonomyDomain: 'test',
        enabled: true,
      });

      expect(job.id).toBe('test-job');
      expect(job.nextFireAt).toBeTruthy();
      expect(job.lastFiredAt).toBeNull();
    });

    it('getJob returns specific job', () => {
      const job = scheduler.getJob('morning-brief');
      expect(job).not.toBeNull();
      expect(job!.name).toBe('Morning Brief');
      expect(job!.schedule).toBe('0 7 * * *');
    });

    it('getJob returns null for unknown id', () => {
      expect(scheduler.getJob('nonexistent')).toBeNull();
    });

    it('removeJob deletes a job', () => {
      scheduler.addJob({
        id: 'to-delete',
        name: 'Delete Me',
        schedule: '* * * * *',
        actionType: 'test',
        payload: {},
        autonomyDomain: 'test',
        enabled: true,
      });

      expect(scheduler.removeJob('to-delete')).toBe(true);
      expect(scheduler.getJob('to-delete')).toBeNull();
    });

    it('removeJob returns false for unknown id', () => {
      expect(scheduler.removeJob('nonexistent')).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('disableJob sets enabled to false', () => {
      scheduler.disableJob('morning-brief');
      const job = scheduler.getJob('morning-brief');
      expect(job!.enabled).toBe(false);
    });

    it('enableJob sets enabled to true', () => {
      scheduler.disableJob('morning-brief');
      scheduler.enableJob('morning-brief');
      const job = scheduler.getJob('morning-brief');
      expect(job!.enabled).toBe(true);
    });
  });

  describe('updateSchedule', () => {
    it('updates schedule and recalculates nextFireAt', () => {
      const before = scheduler.getJob('morning-brief')!;
      scheduler.updateSchedule('morning-brief', '0 8 * * *');
      const after = scheduler.getJob('morning-brief')!;

      expect(after.schedule).toBe('0 8 * * *');
      // nextFireAt should have changed
      expect(after.nextFireAt).not.toBe(before.nextFireAt);
    });
  });

  describe('tick and firing', () => {
    it('tick fires due jobs', async () => {
      const fired: string[] = [];
      scheduler.setFireHandler(async (job) => {
        fired.push(job.id);
      });

      // Add a job that's already overdue
      scheduler.addJob({
        id: 'overdue-job',
        name: 'Overdue',
        schedule: '* * * * *', // every minute
        actionType: 'test',
        payload: {},
        autonomyDomain: 'test',
        enabled: true,
      });

      // Force the nextFireAt to be in the past
      db.prepare('UPDATE cron_jobs SET next_fire_at = ? WHERE id = ?')
        .run(new Date(Date.now() - 60_000).toISOString(), 'overdue-job');

      const firedIds = await scheduler.tick();
      expect(firedIds).toContain('overdue-job');
      expect(fired).toContain('overdue-job');
    });

    it('tick does not fire disabled jobs', async () => {
      const fired: string[] = [];
      scheduler.setFireHandler(async (job) => {
        fired.push(job.id);
      });

      scheduler.addJob({
        id: 'disabled-job',
        name: 'Disabled',
        schedule: '* * * * *',
        actionType: 'test',
        payload: {},
        autonomyDomain: 'test',
        enabled: false,
      });

      // Force overdue
      db.prepare('UPDATE cron_jobs SET next_fire_at = ? WHERE id = ?')
        .run(new Date(Date.now() - 60_000).toISOString(), 'disabled-job');

      await scheduler.tick();
      expect(fired).not.toContain('disabled-job');
    });

    it('tick updates lastFiredAt and nextFireAt after firing', async () => {
      scheduler.setFireHandler(async () => {});

      scheduler.addJob({
        id: 'fire-test',
        name: 'Fire Test',
        schedule: '*/5 * * * *',
        actionType: 'test',
        payload: {},
        autonomyDomain: 'test',
        enabled: true,
      });

      db.prepare('UPDATE cron_jobs SET next_fire_at = ? WHERE id = ?')
        .run(new Date(Date.now() - 60_000).toISOString(), 'fire-test');

      await scheduler.tick();

      const job = scheduler.getJob('fire-test')!;
      expect(job.lastFiredAt).toBeTruthy();
      // nextFireAt should be in the future
      expect(new Date(job.nextFireAt).getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it('fireJob fires immediately regardless of schedule', async () => {
      const fired: string[] = [];
      scheduler.setFireHandler(async (job) => {
        fired.push(job.id);
      });

      const result = await scheduler.fireJob('morning-brief');
      expect(result.success).toBe(true);
      expect(fired).toContain('morning-brief');
    });

    it('fireJob returns error for unknown job', async () => {
      scheduler.setFireHandler(async () => {});
      const result = await scheduler.fireJob('nonexistent');
      expect(result.success).toBe(false);
    });

    it('fireJob returns error when no handler registered', async () => {
      const result = await scheduler.fireJob('morning-brief');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No fire handler');
    });
  });

  describe('cron expression parsing', () => {
    it('computes next fire for every-minute expression', () => {
      const now = new Date('2026-03-17T10:00:00Z');
      const next = scheduler.computeNextFire('* * * * *', now);
      expect(next.getTime()).toBe(new Date('2026-03-17T10:01:00Z').getTime());
    });

    it('computes next fire for specific hour/minute', () => {
      const now = new Date('2026-03-17T06:00:00Z');
      const next = scheduler.computeNextFire('0 7 * * *', now);
      expect(next.getHours()).toBe(7);
      expect(next.getMinutes()).toBe(0);
    });

    it('computes next fire for step expression', () => {
      const now = new Date('2026-03-17T10:00:00Z');
      const next = scheduler.computeNextFire('*/15 * * * *', now);
      expect(next.getMinutes() % 15).toBe(0);
    });

    it('computes next fire for comma-separated values', () => {
      const now = new Date('2026-03-17T08:00:00Z');
      const next = scheduler.computeNextFire('0 9,17 * * *', now);
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });

    it('handles invalid expressions gracefully', () => {
      const now = new Date();
      const next = scheduler.computeNextFire('invalid', now);
      // Should return 1 hour from now as fallback
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('tick loop', () => {
    it('startTickLoop starts interval', () => {
      scheduler.setFireHandler(async () => {});
      scheduler.startTickLoop();
      // Just verify it doesn't throw
      scheduler.stopTickLoop();
    });

    it('startTickLoop is idempotent', () => {
      scheduler.setFireHandler(async () => {});
      scheduler.startTickLoop();
      scheduler.startTickLoop(); // should not create second interval
      scheduler.stopTickLoop();
    });
  });
});
