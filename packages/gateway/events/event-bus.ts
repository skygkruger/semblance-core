// Sovereignty Event Bus — Typed pub/sub for daemon-mode reactive events.
//
// In-memory only — events are NOT persisted. High-priority events that fire
// when no orchestrator session is active are queued for delivery when the
// session next becomes active (queue TTL: 4 hours).
//
// This is the foundation for event-driven reactivity in the daemon.

export type SemblanceEventType =
  | 'email.arrived'
  | 'calendar.starting'
  | 'file.created'
  | 'file.modified'
  | 'financial.anomaly'
  | 'system.wake'
  | 'tunnel.connected'
  | 'tunnel.disconnected'
  | 'channel.message_received'
  | 'cron.fired';

export interface SemblanceEventMap {
  'email.arrived': { accountId: string; messageId: string; subject: string; priority: 'high' | 'normal' | 'low' };
  'calendar.starting': { eventId: string; title: string; minutesUntil: number };
  'file.created': { path: string; watchedDirectory: string };
  'file.modified': { path: string };
  'financial.anomaly': { description: string; amount: number };
  'system.wake': { timestamp: string };
  'tunnel.connected': { deviceId: string };
  'tunnel.disconnected': { deviceId: string };
  'channel.message_received': { channelId: string; senderId: string; sessionKey: string };
  'cron.fired': { jobId: string; actionType: string };
}

export interface SemblanceEvent<T extends SemblanceEventType = SemblanceEventType> {
  type: T;
  payload: SemblanceEventMap[T];
  timestamp: string;
}

type EventHandler = (event: SemblanceEvent) => void;

interface Subscription {
  id: number;
  types: Set<SemblanceEventType>;
  handler: EventHandler;
}

const HIGH_PRIORITY_EVENTS: Set<SemblanceEventType> = new Set([
  'email.arrived',
  'calendar.starting',
  'financial.anomaly',
  'channel.message_received',
]);

const QUEUE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface QueuedEvent {
  event: SemblanceEvent;
  queuedAt: number;
}

/**
 * SemblanceEventBus — In-memory typed event pub/sub.
 */
export class SemblanceEventBus {
  private subscriptions: Subscription[] = [];
  private nextSubId = 1;
  private recentEvents: SemblanceEvent[] = [];
  private maxRecentEvents = 100;
  private highPriorityQueue: QueuedEvent[] = [];
  private hasActiveSession = false;

  /**
   * Emit a typed event to all matching subscribers.
   * High-priority events are queued if no active session exists.
   */
  emit<T extends SemblanceEventType>(type: T, payload: SemblanceEventMap[T]): void {
    const event: SemblanceEvent<T> = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    // Store in recent events ring buffer
    this.recentEvents.push(event as SemblanceEvent);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
    }

    // Deliver to subscribers
    let delivered = false;
    for (const sub of this.subscriptions) {
      if (sub.types.has(type)) {
        try {
          sub.handler(event as SemblanceEvent);
          delivered = true;
        } catch (error) {
          console.error(`[EventBus] Handler error for ${type}:`, (error as Error).message);
        }
      }
    }

    // Queue high-priority events if no session is active
    if (!delivered && HIGH_PRIORITY_EVENTS.has(type)) {
      this.highPriorityQueue.push({ event: event as SemblanceEvent, queuedAt: Date.now() });
    }
  }

  /**
   * Subscribe to specific event types. Returns an unsubscribe function.
   */
  subscribe(types: SemblanceEventType[], handler: EventHandler): () => void {
    const sub: Subscription = {
      id: this.nextSubId++,
      types: new Set(types),
      handler,
    };
    this.subscriptions.push(sub);

    return () => {
      this.subscriptions = this.subscriptions.filter(s => s.id !== sub.id);
    };
  }

  /**
   * Remove all subscriptions.
   */
  unsubscribeAll(): void {
    this.subscriptions = [];
  }

  /**
   * Get recent events (in-memory only).
   */
  getRecentEvents(limit?: number): SemblanceEvent[] {
    const n = limit ?? this.maxRecentEvents;
    return this.recentEvents.slice(-n);
  }

  /**
   * Mark that an active orchestrator session exists.
   * Flushes queued high-priority events to subscribers.
   */
  markSessionActive(): void {
    this.hasActiveSession = true;
    this.flushQueue();
  }

  /**
   * Mark that no orchestrator session is active.
   */
  markSessionInactive(): void {
    this.hasActiveSession = false;
  }

  /**
   * Get queued high-priority events (for testing/debugging).
   */
  getQueuedEvents(): SemblanceEvent[] {
    return this.highPriorityQueue.map(q => q.event);
  }

  /**
   * Get the number of active subscriptions.
   */
  getSubscriptionCount(): number {
    return this.subscriptions.length;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private flushQueue(): void {
    const now = Date.now();
    const validEvents = this.highPriorityQueue.filter(
      q => now - q.queuedAt < QUEUE_TTL_MS,
    );
    this.highPriorityQueue = [];

    for (const { event } of validEvents) {
      for (const sub of this.subscriptions) {
        if (sub.types.has(event.type)) {
          try {
            sub.handler(event);
          } catch (error) {
            console.error(`[EventBus] Queued handler error for ${event.type}:`, (error as Error).message);
          }
        }
      }
    }
  }
}
