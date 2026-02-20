// Rate Limiter Tests — Proves per-action and global limits are enforced.

import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '@semblance/gateway/security/rate-limiter.js';

describe('Rate Limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      actionLimits: { 'email.send': 3 },
      defaultActionLimit: 5,
      globalLimit: 10,
      windowMs: 60_000, // 1 minute for fast tests
    });
  });

  it('requests within limit pass', () => {
    const result = limiter.check('email.send');
    expect(result.allowed).toBe(true);
  });

  it('request exceeding per-action limit is rate-limited', () => {
    // email.send limit is 3
    for (let i = 0; i < 3; i++) {
      expect(limiter.check('email.send').allowed).toBe(true);
      limiter.record('email.send');
    }
    const result = limiter.check('email.send');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('request exceeding global limit is rate-limited', () => {
    // Global limit is 10, default per-action is 5
    // Use different actions to avoid per-action limits
    const actions = ['email.fetch', 'calendar.fetch', 'health.fetch'] as const;
    let count = 0;
    for (const action of actions) {
      for (let i = 0; i < 4; i++) {
        if (count >= 10) break;
        expect(limiter.check(action).allowed).toBe(true);
        limiter.record(action);
        count++;
      }
    }
    // 10th request should fail on global limit
    // Try one more on an action that hasn't hit its limit
    const result = limiter.check('service.api_call');
    expect(result.allowed).toBe(false);
  });

  it('different actions have independent per-action limits', () => {
    // email.send limit is 3, email.fetch uses default (5)
    for (let i = 0; i < 3; i++) {
      limiter.record('email.send');
    }
    expect(limiter.check('email.send').allowed).toBe(false);
    expect(limiter.check('email.fetch').allowed).toBe(true);
  });

  it('getCounts reflects recorded requests', () => {
    limiter.record('email.send');
    limiter.record('email.send');
    limiter.record('email.fetch');

    const counts = limiter.getCounts();
    expect(counts.global).toBe(3);
    expect(counts.byAction['email.send']).toBe(2);
    expect(counts.byAction['email.fetch']).toBe(1);
  });

  it('reset clears all counters', () => {
    limiter.record('email.send');
    limiter.record('email.send');
    limiter.record('email.send');
    expect(limiter.check('email.send').allowed).toBe(false);

    limiter.reset();
    expect(limiter.check('email.send').allowed).toBe(true);
    expect(limiter.getCounts().global).toBe(0);
  });

  it('limits reset after window expires', async () => {
    const fastLimiter = new RateLimiter({
      actionLimits: { 'email.send': 2 },
      globalLimit: 100,
      windowMs: 50, // 50ms window
    });

    fastLimiter.record('email.send');
    fastLimiter.record('email.send');
    expect(fastLimiter.check('email.send').allowed).toBe(false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 60));

    expect(fastLimiter.check('email.send').allowed).toBe(true);
  });
});
