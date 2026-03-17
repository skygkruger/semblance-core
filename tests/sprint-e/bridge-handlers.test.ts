import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const BRIDGE = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');

describe('Sprint E — Bridge Handler Registration', () => {
  const requiredHandlers = [
    'preference_list',
    'preference_confirm',
    'preference_deny',
    'preference_get_high_confidence',
    'speculative_cache_status',
    'speculative_preload_now',
    'commitment_list_due',
    'commitment_resolve',
    'commitment_dismiss',
    'relationship_pattern_shifts',
    'relationship_reciprocity',
  ];

  for (const handler of requiredHandlers) {
    it(`has handler for '${handler}'`, () => {
      expect(BRIDGE).toContain(`case '${handler}':`);
    });
  }
});

describe('Sprint E — Sprint E Imports', () => {
  it('imports PreferenceGraph', () => {
    expect(BRIDGE).toContain("import { PreferenceGraph }");
  });

  it('imports SpeculativeLoader', () => {
    expect(BRIDGE).toContain("import { SpeculativeLoader }");
  });

  it('imports CommitmentTracker', () => {
    expect(BRIDGE).toContain("import { CommitmentTracker }");
  });

  it('imports PatternShiftDetector', () => {
    expect(BRIDGE).toContain("import { PatternShiftDetector }");
  });

  it('imports CronScheduler', () => {
    expect(BRIDGE).toContain("import { CronScheduler }");
  });

  it('imports DaemonManager', () => {
    expect(BRIDGE).toContain("import { DaemonManager }");
  });

  it('imports runAllPreferenceDetectors', () => {
    expect(BRIDGE).toContain("import { runAllPreferenceDetectors }");
  });
});

describe('Sprint E — Initialization', () => {
  it('initializes PreferenceGraph in handleInitialize', () => {
    expect(BRIDGE).toContain('new PreferenceGraph(');
    expect(BRIDGE).toContain('PreferenceGraph initialized');
  });

  it('initializes SpeculativeLoader', () => {
    expect(BRIDGE).toContain('new SpeculativeLoader()');
    expect(BRIDGE).toContain('SpeculativeLoader initialized');
  });

  it('initializes CommitmentTracker', () => {
    expect(BRIDGE).toContain('new CommitmentTracker(');
    expect(BRIDGE).toContain('CommitmentTracker initialized');
  });

  it('initializes PatternShiftDetector', () => {
    expect(BRIDGE).toContain('new PatternShiftDetector(');
    expect(BRIDGE).toContain('PatternShiftDetector initialized');
  });

  it('wires preference graph into autonomy manager', () => {
    expect(BRIDGE).toContain('setPreferenceGraph(preferenceGraph)');
  });

  it('starts hardware monitoring at 30-second intervals', () => {
    expect(BRIDGE).toContain('30_000');
    expect(BRIDGE).toContain('hardware.memory_pressure');
    expect(BRIDGE).toContain('hardware.disk_low');
  });

  it('starts daemon wake detection', () => {
    expect(BRIDGE).toContain('daemonManager.startWakeDetection()');
  });

  it('initializes CronScheduler with event bus', () => {
    expect(BRIDGE).toContain('new CronScheduler(undefined, eventBus)');
  });

  it('morning-brief-preload job is in cron-scheduler built-in jobs', () => {
    const cronSrc = readFileSync(join(ROOT, 'packages/gateway/cron/cron-scheduler.ts'), 'utf-8');
    expect(cronSrc).toContain("id: 'morning-brief-preload'");
    expect(cronSrc).toContain("schedule: '0 5 * * *'");
    expect(cronSrc).toContain("actionType: 'digest.preload'");
  });
});
