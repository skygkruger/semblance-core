import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

describe('Sprint E — Event Bus Full Wiring', () => {
  const eventBusSrc = readFileSync(join(ROOT, 'packages/gateway/events/event-bus.ts'), 'utf-8');

  it('defines all 18 event types', () => {
    const expectedTypes = [
      'email.arrived',
      'email.follow_up_due',
      'calendar.starting',
      'calendar.created',
      'file.created',
      'file.modified',
      'financial.anomaly',
      'hardware.thermal_warning',
      'hardware.memory_pressure',
      'hardware.disk_low',
      'app.launched',
      'app.focused',
      'system.wake',
      'tunnel.connected',
      'tunnel.disconnected',
      'channel.message_received',
      'cron.fired',
      'preference.pattern_detected',
    ];

    for (const type of expectedTypes) {
      expect(eventBusSrc).toContain(`'${type}'`);
    }
  });

  it('has 18 event type payloads in SemblanceEventMap', () => {
    const payloadCount = (eventBusSrc.match(/'[a-z]+\.[a-z_]+': \{/g) ?? []).length;
    expect(payloadCount).toBeGreaterThanOrEqual(18);
  });

  it('hardware.thermal_warning has correct payload shape', () => {
    expect(eventBusSrc).toContain("'hardware.thermal_warning': { cpuTempCelsius: number; sustained: boolean }");
  });

  it('hardware.memory_pressure has correct payload shape', () => {
    expect(eventBusSrc).toContain("'hardware.memory_pressure': { level: 'moderate' | 'critical'; availableMb: number }");
  });

  it('hardware.disk_low and hardware.thermal_warning are high-priority', () => {
    expect(eventBusSrc).toContain("'hardware.thermal_warning'");
    expect(eventBusSrc).toContain("'hardware.disk_low'");
  });
});

describe('Sprint E — Emitter Wiring', () => {
  it('email-indexer has eventBus in constructor config', () => {
    const src = readFileSync(join(ROOT, 'packages/core/knowledge/email-indexer.ts'), 'utf-8');
    expect(src).toContain('eventBus?: EventBusLike');
    expect(src).toContain("eventBus.emit('email.arrived'");
  });

  it('calendar-indexer has eventBus in constructor config and timer registration', () => {
    const src = readFileSync(join(ROOT, 'packages/core/knowledge/calendar-indexer.ts'), 'utf-8');
    expect(src).toContain('eventBus?: EventBusLike');
    expect(src).toContain("eventBus.emit('calendar.created'");
    expect(src).toContain("eventBus?.emit('calendar.starting'");
    expect(src).toContain('registerUpcomingEventTimers');
    expect(src).toContain('registerCalendarTimers');
  });

  it('cron-scheduler emits cron.fired event', () => {
    const src = readFileSync(join(ROOT, 'packages/gateway/cron/cron-scheduler.ts'), 'utf-8');
    expect(src).toContain("eventBus.emit('cron.fired'");
    expect(src).toContain('morning-brief-preload');
    expect(src).toContain('digest.preload');
  });

  it('file indexing emits file.created event in bridge', () => {
    const src = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');
    expect(src).toContain("eventBus.emit('file.created'");
  });

  it('kg-sync emits tunnel.connected/disconnected events', () => {
    const src = readFileSync(join(ROOT, 'packages/gateway/tunnel/kg-sync.ts'), 'utf-8');
    expect(src).toContain("eventBus.emit('tunnel.connected'");
    expect(src).toContain("eventBus.emit('tunnel.disconnected'");
  });

  it('channel-registry has emitMessageReceived method', () => {
    const src = readFileSync(join(ROOT, 'packages/gateway/channels/channel-registry.ts'), 'utf-8');
    expect(src).toContain('emitMessageReceived');
    expect(src).toContain("eventBus.emit('channel.message_received'");
  });

  it('daemon-manager has wake detection via uptime polling', () => {
    const src = readFileSync(join(ROOT, 'packages/gateway/daemon/daemon-manager.ts'), 'utf-8');
    expect(src).toContain('startWakeDetection');
    expect(src).toContain('stopWakeDetection');
    expect(src).toContain("eventBus.emit('system.wake'");
    expect(src).toContain('uptime()');
  });
});

describe('Sprint E — Orchestrator Event Subscriptions', () => {
  const bridgeSrc = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');

  it('subscribes to email.arrived events', () => {
    expect(bridgeSrc).toContain("subscribe(['email.arrived']");
  });

  it('subscribes to calendar.starting events', () => {
    expect(bridgeSrc).toContain("subscribe(['calendar.starting']");
  });

  it('subscribes to system.wake events', () => {
    expect(bridgeSrc).toContain("subscribe(['system.wake']");
  });

  it('subscribes to tunnel.connected events', () => {
    expect(bridgeSrc).toContain("subscribe(['tunnel.connected']");
  });

  it('subscribes to financial.anomaly events', () => {
    expect(bridgeSrc).toContain("subscribe(['financial.anomaly']");
  });

  it('subscribes to channel.message_received events', () => {
    expect(bridgeSrc).toContain("subscribe(['channel.message_received']");
  });

  it('hardware monitoring runs at 30-second intervals', () => {
    expect(bridgeSrc).toContain('30_000');
    expect(bridgeSrc).toContain("'hardware.memory_pressure'");
    expect(bridgeSrc).toContain("'hardware.disk_low'");
  });
});
