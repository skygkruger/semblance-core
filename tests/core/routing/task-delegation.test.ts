// Tests for Commit 12: Task Routing — intelligent routing between desktop and mobile.
// Task classification, routing decisions, offloading, failover, transparency events.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TaskDelegationEngine,
  classifyTask,
  getTaskTimeout,
} from '@semblance/core/routing/task-delegation.js';
import type {
  TaskComplexity,
  TaskOffloadTransport,
  TaskResponse,
  RoutingEvent,
} from '@semblance/core/routing/task-delegation.js';

// ─── Mock Transport ─────────────────────────────────────────────────────────

function createMockTransport(options?: {
  reachable?: boolean;
  response?: TaskResponse | null;
}): TaskOffloadTransport {
  const reachable = options?.reachable ?? true;
  const response = options?.response ?? null;

  return {
    sendTask: vi.fn(async () => response),
    isDeviceReachable: vi.fn(() => reachable),
  };
}

// ─── Task Classification ────────────────────────────────────────────────────

describe('Task Routing — Classification', () => {
  it('classifies email categorization as lightweight', () => {
    expect(classifyTask('email.categorize')).toBe('lightweight');
  });

  it('classifies reminder management as lightweight', () => {
    expect(classifyTask('reminder.create')).toBe('lightweight');
    expect(classifyTask('reminder.snooze')).toBe('lightweight');
  });

  it('classifies short email drafts as medium', () => {
    expect(classifyTask('email.draft_short')).toBe('medium');
    expect(classifyTask('email.reply')).toBe('medium');
  });

  it('classifies chat responses as medium', () => {
    expect(classifyTask('chat.respond')).toBe('medium');
  });

  it('classifies meeting prep as heavy', () => {
    expect(classifyTask('meeting_prep')).toBe('heavy');
  });

  it('classifies weekly digest as heavy', () => {
    expect(classifyTask('weekly_digest')).toBe('heavy');
  });

  it('classifies document analysis as heavy', () => {
    expect(classifyTask('document.analyze')).toBe('heavy');
  });

  it('classifies unknown tasks as heavy (safe default)', () => {
    expect(classifyTask('totally_new_task')).toBe('heavy');
  });

  it('returns correct timeouts by type', () => {
    expect(getTaskTimeout('inference')).toBe(30_000);
    expect(getTaskTimeout('embedding')).toBe(10_000);
    expect(getTaskTimeout('analysis')).toBe(60_000);
  });
});

// ─── Routing Decisions — Desktop ────────────────────────────────────────────

describe('Task Routing — Desktop Routing', () => {
  let engine: TaskDelegationEngine;

  beforeEach(() => {
    engine = new TaskDelegationEngine({
      localDeviceId: 'desktop-1',
      localDeviceType: 'desktop',
      localModelTier: '7B',
    });
  });

  it('desktop always routes locally', () => {
    const decision = engine.decideRouting('meeting_prep');
    expect(decision.target).toBe('local');
    expect(decision.degraded).toBe(false);
  });

  it('desktop handles all complexity levels locally', () => {
    expect(engine.decideRouting('email.categorize').target).toBe('local');
    expect(engine.decideRouting('email.reply').target).toBe('local');
    expect(engine.decideRouting('document.analyze').target).toBe('local');
  });
});

// ─── Routing Decisions — Mobile ─────────────────────────────────────────────

describe('Task Routing — Mobile Routing', () => {
  let engine: TaskDelegationEngine;
  let transport: TaskOffloadTransport;

  beforeEach(() => {
    transport = createMockTransport({ reachable: true });
    engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport,
    });
    engine.setPairedDesktop('desktop-1', "Sky's MacBook Pro");
  });

  it('lightweight tasks run locally on mobile', () => {
    const decision = engine.decideRouting('email.categorize');
    expect(decision.target).toBe('local');
    expect(decision.complexity).toBe('lightweight');
    expect(decision.degraded).toBe(false);
  });

  it('medium tasks run locally with 3B model', () => {
    const decision = engine.decideRouting('email.reply');
    expect(decision.target).toBe('local');
    expect(decision.complexity).toBe('medium');
    expect(decision.degraded).toBe(false);
  });

  it('heavy tasks route to desktop when available', () => {
    const decision = engine.decideRouting('meeting_prep');
    expect(decision.target).toBe('remote');
    expect(decision.complexity).toBe('heavy');
    expect(decision.degraded).toBe(false);
  });

  it('heavy tasks fall back to local when desktop unavailable', () => {
    const unreachableTransport = createMockTransport({ reachable: false });
    const mobileEngine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport: unreachableTransport,
    });
    mobileEngine.setPairedDesktop('desktop-1', 'MacBook');

    const decision = mobileEngine.decideRouting('meeting_prep');
    expect(decision.target).toBe('local');
    expect(decision.degraded).toBe(true);
  });

  it('medium tasks with 1.5B model route to desktop', () => {
    const smallEngine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '1.5B',
      transport,
    });
    smallEngine.setPairedDesktop('desktop-1', 'MacBook');

    const decision = smallEngine.decideRouting('email.reply');
    expect(decision.target).toBe('remote');
  });

  it('medium tasks with 1.5B model degrade locally when desktop unavailable', () => {
    const smallEngine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '1.5B',
      transport: createMockTransport({ reachable: false }),
    });
    smallEngine.setPairedDesktop('desktop-1', 'MacBook');

    const decision = smallEngine.decideRouting('email.reply');
    expect(decision.target).toBe('local');
    expect(decision.degraded).toBe(true);
  });

  it('no model tier reports degraded for all inference tasks', () => {
    const noModelEngine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: 'none',
      transport: createMockTransport({ reachable: false }),
    });
    noModelEngine.setPairedDesktop('desktop-1', 'MacBook');

    const decision = noModelEngine.decideRouting('meeting_prep');
    expect(decision.degraded).toBe(true);
  });
});

// ─── Task Execution ─────────────────────────────────────────────────────────

describe('Task Routing — Execution', () => {
  it('executes lightweight task locally', async () => {
    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
    });

    const result = await engine.executeTask(
      'email.categorize',
      { email: 'test' },
      async () => ({ category: 'work' }),
    );

    expect(result.status).toBe('success');
    expect(result.executedOn).toBe('mobile-1');
    expect(result.result).toEqual({ category: 'work' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('routes heavy task to desktop and returns result', async () => {
    const remoteResponse: TaskResponse = {
      requestId: 'task-1',
      status: 'success',
      result: { prep: 'Meeting notes prepared' },
      executedOn: 'desktop-1',
      durationMs: 5000,
    };

    const transport = createMockTransport({
      reachable: true,
      response: remoteResponse,
    });

    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport,
    });
    engine.setPairedDesktop('desktop-1', 'MacBook');

    const result = await engine.executeTask(
      'meeting_prep',
      { meetingId: '123' },
      async () => ({ prep: 'local fallback' }),
    );

    expect(result.status).toBe('success');
    expect(result.executedOn).toBe('desktop-1');
    expect(transport.sendTask).toHaveBeenCalled();
  });

  it('falls back to local when remote fails', async () => {
    const transport = createMockTransport({
      reachable: true,
      response: null, // Remote returns null (failed)
    });

    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport,
    });
    engine.setPairedDesktop('desktop-1', 'MacBook');

    const result = await engine.executeTask(
      'meeting_prep',
      {},
      async () => ({ prep: 'local result' }),
    );

    expect(result.status).toBe('success');
    expect(result.executedOn).toBe('mobile-1');
    expect(result.result).toEqual({ prep: 'local result' });
  });

  it('handles local execution error gracefully', async () => {
    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
    });

    const result = await engine.executeTask(
      'email.categorize',
      {},
      async () => { throw new Error('Model not loaded'); },
    );

    expect(result.status).toBe('error');
    expect(result.error).toBe('Model not loaded');
  });
});

// ─── Transparency Events ────────────────────────────────────────────────────

describe('Task Routing — Transparency Events', () => {
  it('emits executing_local for local tasks', async () => {
    const events: RoutingEvent[] = [];
    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      onRoutingEvent: (e) => events.push(e),
    });

    await engine.executeTask('email.categorize', {}, async () => 'done');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('executing_local');
  });

  it('emits routed_remote when offloading to desktop', async () => {
    const events: RoutingEvent[] = [];
    const transport = createMockTransport({
      reachable: true,
      response: { requestId: 'x', status: 'success', executedOn: 'desktop-1', durationMs: 100 },
    });

    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport,
      onRoutingEvent: (e) => events.push(e),
    });
    engine.setPairedDesktop('desktop-1', "Sky's MacBook Pro");

    await engine.executeTask('meeting_prep', {}, async () => 'fallback');
    expect(events.some(e => e.type === 'routed_remote')).toBe(true);
    expect(events.find(e => e.type === 'routed_remote')!.targetDeviceName).toBe("Sky's MacBook Pro");
  });

  it('emits fallback_local when remote fails', async () => {
    const events: RoutingEvent[] = [];
    const transport = createMockTransport({
      reachable: true,
      response: null,
    });

    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport,
      onRoutingEvent: (e) => events.push(e),
    });
    engine.setPairedDesktop('desktop-1', 'MacBook');

    await engine.executeTask('meeting_prep', {}, async () => 'local');
    expect(events.some(e => e.type === 'fallback_local')).toBe(true);
  });
});

// ─── Paired Desktop Management ──────────────────────────────────────────────

describe('Task Routing — Paired Desktop', () => {
  it('routes to desktop when paired', () => {
    const transport = createMockTransport({ reachable: true });
    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport,
    });

    engine.setPairedDesktop('desktop-1', 'MacBook');
    expect(engine.decideRouting('meeting_prep').target).toBe('remote');
  });

  it('runs locally after clearing paired desktop', () => {
    const transport = createMockTransport({ reachable: true });
    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport,
    });

    engine.setPairedDesktop('desktop-1', 'MacBook');
    engine.clearPairedDesktop();
    expect(engine.decideRouting('meeting_prep').target).toBe('local');
    expect(engine.decideRouting('meeting_prep').degraded).toBe(true);
  });
});
