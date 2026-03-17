// Tests for SemblanceEventBus — emission, subscription, queue, high-priority delivery.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemblanceEventBus } from '../../packages/gateway/events/event-bus.js';
import type { SemblanceEvent, SemblanceEventType } from '../../packages/gateway/events/event-bus.js';

describe('SemblanceEventBus', () => {
  let bus: SemblanceEventBus;

  beforeEach(() => {
    bus = new SemblanceEventBus();
  });

  describe('emit and subscribe', () => {
    it('delivers event to matching subscriber', () => {
      const received: SemblanceEvent[] = [];
      bus.subscribe(['email.arrived'], (e) => received.push(e));

      bus.emit('email.arrived', { accountId: 'a', messageId: 'm', subject: 'Test', priority: 'high' });

      expect(received).toHaveLength(1);
      expect(received[0]!.type).toBe('email.arrived');
      expect(received[0]!.payload).toEqual({ accountId: 'a', messageId: 'm', subject: 'Test', priority: 'high' });
    });

    it('does not deliver event to non-matching subscriber', () => {
      const received: SemblanceEvent[] = [];
      bus.subscribe(['file.created'], (e) => received.push(e));

      bus.emit('email.arrived', { accountId: 'a', messageId: 'm', subject: 'Test', priority: 'low' });

      expect(received).toHaveLength(0);
    });

    it('subscriber receives multiple matching events', () => {
      const received: SemblanceEvent[] = [];
      bus.subscribe(['cron.fired'], (e) => received.push(e));

      bus.emit('cron.fired', { jobId: 'j1', actionType: 'test' });
      bus.emit('cron.fired', { jobId: 'j2', actionType: 'test2' });

      expect(received).toHaveLength(2);
    });

    it('subscriber with multiple types receives both', () => {
      const received: SemblanceEvent[] = [];
      bus.subscribe(['email.arrived', 'calendar.starting'], (e) => received.push(e));

      bus.emit('email.arrived', { accountId: 'a', messageId: 'm', subject: 'T', priority: 'normal' });
      bus.emit('calendar.starting', { eventId: 'e', title: 'Meeting', minutesUntil: 10 });

      expect(received).toHaveLength(2);
    });
  });

  describe('unsubscribe', () => {
    it('unsubscribe function stops delivery', () => {
      const received: SemblanceEvent[] = [];
      const unsub = bus.subscribe(['cron.fired'], (e) => received.push(e));

      bus.emit('cron.fired', { jobId: 'j1', actionType: 't' });
      unsub();
      bus.emit('cron.fired', { jobId: 'j2', actionType: 't' });

      expect(received).toHaveLength(1);
    });

    it('unsubscribeAll removes all subscriptions', () => {
      const received: SemblanceEvent[] = [];
      bus.subscribe(['cron.fired'], (e) => received.push(e));
      bus.subscribe(['email.arrived'], (e) => received.push(e));

      bus.unsubscribeAll();
      bus.emit('cron.fired', { jobId: 'j', actionType: 't' });
      bus.emit('email.arrived', { accountId: 'a', messageId: 'm', subject: 'T', priority: 'low' });

      expect(received).toHaveLength(0);
      expect(bus.getSubscriptionCount()).toBe(0);
    });
  });

  describe('recent events', () => {
    it('getRecentEvents returns emitted events', () => {
      bus.emit('system.wake', { timestamp: new Date().toISOString() });
      bus.emit('cron.fired', { jobId: 'j', actionType: 't' });

      const recent = bus.getRecentEvents();
      expect(recent).toHaveLength(2);
    });

    it('getRecentEvents respects limit', () => {
      for (let i = 0; i < 10; i++) {
        bus.emit('cron.fired', { jobId: `j${i}`, actionType: 't' });
      }
      expect(bus.getRecentEvents(3)).toHaveLength(3);
    });
  });

  describe('high-priority queue', () => {
    it('queues high-priority events when no subscriber', () => {
      // No subscribers — email.arrived is high priority
      bus.emit('email.arrived', { accountId: 'a', messageId: 'm', subject: 'Urgent', priority: 'high' });

      const queued = bus.getQueuedEvents();
      expect(queued).toHaveLength(1);
      expect(queued[0]!.type).toBe('email.arrived');
    });

    it('does not queue low-priority events', () => {
      // file.created is not high-priority
      bus.emit('file.created', { path: '/test', watchedDirectory: '/dir' });
      expect(bus.getQueuedEvents()).toHaveLength(0);
    });

    it('markSessionActive flushes queue to subscribers', () => {
      // Emit without subscribers
      bus.emit('email.arrived', { accountId: 'a', messageId: 'm', subject: 'Q', priority: 'high' });

      // Now subscribe and mark active
      const received: SemblanceEvent[] = [];
      bus.subscribe(['email.arrived'], (e) => received.push(e));
      bus.markSessionActive();

      expect(received).toHaveLength(1);
      expect(bus.getQueuedEvents()).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('handler error does not break other subscribers', () => {
      const received: SemblanceEvent[] = [];
      bus.subscribe(['cron.fired'], () => { throw new Error('Handler crash'); });
      bus.subscribe(['cron.fired'], (e) => received.push(e));

      bus.emit('cron.fired', { jobId: 'j', actionType: 't' });
      expect(received).toHaveLength(1);
    });
  });

  describe('event typing', () => {
    it('all event types can be emitted', () => {
      // Just verify type-safety — no runtime assertion needed beyond no-throw
      bus.emit('email.arrived', { accountId: 'a', messageId: 'm', subject: 's', priority: 'normal' });
      bus.emit('calendar.starting', { eventId: 'e', title: 't', minutesUntil: 5 });
      bus.emit('file.created', { path: '/p', watchedDirectory: '/d' });
      bus.emit('file.modified', { path: '/p' });
      bus.emit('financial.anomaly', { description: 'd', amount: 100 });
      bus.emit('system.wake', { timestamp: new Date().toISOString() });
      bus.emit('tunnel.connected', { deviceId: 'd' });
      bus.emit('tunnel.disconnected', { deviceId: 'd' });
      bus.emit('channel.message_received', { channelId: 'c', senderId: 's', sessionKey: 'k' });
      bus.emit('cron.fired', { jobId: 'j', actionType: 'a' });
      expect(bus.getRecentEvents()).toHaveLength(10);
    });
  });
});
