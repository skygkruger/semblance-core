// Task Delegation — Intelligent routing and offloading between desktop and mobile.
//
// Extends existing TaskRouter and TaskAssessor with:
//   - Task complexity classification (lightweight / medium / heavy)
//   - Cross-device task offloading via sync transport
//   - Failover: desktop unreachable → run locally with degraded capability
//   - Transparency: events when tasks route to another device
//
// CRITICAL: No networking imports. Task delegation uses the sync transport
// (already encrypted and authenticated) for cross-device communication.

import { nanoid } from 'nanoid';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TaskComplexity = 'lightweight' | 'medium' | 'heavy';

export interface TaskRequest {
  id: string;
  type: 'inference' | 'embedding' | 'analysis';
  payload: unknown;
  priority: 'high' | 'normal' | 'low';
  timeoutMs: number;
  sourceDeviceId: string;
  taskType: string;
}

export interface TaskResponse {
  requestId: string;
  status: 'success' | 'error' | 'timeout';
  result?: unknown;
  executedOn: string;
  durationMs: number;
  error?: string;
}

export interface RoutingEvent {
  type: 'routed_remote' | 'fallback_local' | 'executing_local';
  taskId: string;
  targetDeviceName?: string;
  targetDeviceId?: string;
  reason: string;
}

/**
 * Abstract transport for task offloading.
 * Uses the same sync connection as state sync.
 */
export interface TaskOffloadTransport {
  sendTask(deviceId: string, request: TaskRequest): Promise<TaskResponse | null>;
  isDeviceReachable(deviceId: string): boolean;
}

// ─── Task Classification ────────────────────────────────────────────────────

/**
 * Classification rules for task complexity.
 * Lightweight: 3B model sufficient, runs on any device.
 * Medium: 3B preferred, routes to desktop if only 1.5B available.
 * Heavy: 7B+ needed, routes to desktop, degrades on mobile.
 */
const TASK_COMPLEXITY_MAP: Record<string, TaskComplexity> = {
  // Lightweight — mobile 3B handles well
  'email.categorize': 'lightweight',
  'email.archive': 'lightweight',
  'reminder.create': 'lightweight',
  'reminder.snooze': 'lightweight',
  'reminder.dismiss': 'lightweight',
  'capture.save': 'lightweight',
  'subscription_detect': 'lightweight',
  'conflict_detection': 'lightweight',
  'web_search.classify': 'lightweight',

  // Medium — 3B can do it but desktop does it better
  'email.draft_short': 'medium',
  'email.reply': 'medium',
  'calendar.suggest': 'medium',
  'web_search.summarize': 'medium',
  'chat.respond': 'medium',
  'style.match': 'medium',

  // Heavy — needs desktop 7B+ for quality
  'email.draft_long': 'heavy',
  'meeting_prep': 'heavy',
  'knowledge_moment': 'heavy',
  'weekly_digest': 'heavy',
  'document.analyze': 'heavy',
  'style.extract': 'heavy',
  'chat.complex_reasoning': 'heavy',
};

/**
 * Classify a task by complexity.
 * Unknown tasks default to 'heavy' for safety.
 */
export function classifyTask(taskType: string): TaskComplexity {
  return TASK_COMPLEXITY_MAP[taskType] ?? 'heavy';
}

/**
 * Get the default timeout for a task type.
 */
export function getTaskTimeout(type: 'inference' | 'embedding' | 'analysis'): number {
  switch (type) {
    case 'inference': return 30_000;
    case 'embedding': return 10_000;
    case 'analysis': return 60_000;
  }
}

// ─── Task Delegation Engine ─────────────────────────────────────────────────

/**
 * TaskDelegationEngine routes tasks between local and remote devices.
 * Implements the routing logic:
 *   1. Lightweight → always run locally
 *   2. Medium/Heavy → check desktop availability → offload or degrade locally
 *   3. Failover → if desktop drops mid-task, re-execute locally
 */
export class TaskDelegationEngine {
  private localDeviceId: string;
  private localDeviceType: 'desktop' | 'mobile';
  private localModelTier: '1.5B' | '3B' | '7B' | 'none';
  private transport: TaskOffloadTransport | null;
  private pairedDesktopId: string | null = null;
  private pairedDesktopName: string | null = null;
  private onRoutingEvent?: (event: RoutingEvent) => void;

  constructor(config: {
    localDeviceId: string;
    localDeviceType: 'desktop' | 'mobile';
    localModelTier: '1.5B' | '3B' | '7B' | 'none';
    transport?: TaskOffloadTransport;
    onRoutingEvent?: (event: RoutingEvent) => void;
  }) {
    this.localDeviceId = config.localDeviceId;
    this.localDeviceType = config.localDeviceType;
    this.localModelTier = config.localModelTier;
    this.transport = config.transport ?? null;
    this.onRoutingEvent = config.onRoutingEvent;
  }

  /**
   * Register the paired desktop for offloading.
   */
  setPairedDesktop(deviceId: string, deviceName: string): void {
    this.pairedDesktopId = deviceId;
    this.pairedDesktopName = deviceName;
  }

  /**
   * Clear the paired desktop.
   */
  clearPairedDesktop(): void {
    this.pairedDesktopId = null;
    this.pairedDesktopName = null;
  }

  /**
   * Decide where to execute a task.
   * Returns the routing decision without executing.
   */
  decideRouting(taskType: string): {
    target: 'local' | 'remote';
    complexity: TaskComplexity;
    reason: string;
    degraded: boolean;
  } {
    const complexity = classifyTask(taskType);

    // Desktop always runs locally (it's the powerful device)
    if (this.localDeviceType === 'desktop') {
      return {
        target: 'local',
        complexity,
        reason: 'Desktop runs all tasks locally',
        degraded: false,
      };
    }

    // Mobile routing logic
    if (complexity === 'lightweight') {
      return {
        target: 'local',
        complexity,
        reason: 'Lightweight task — mobile can handle',
        degraded: false,
      };
    }

    // Check if desktop is available
    const desktopAvailable = this.pairedDesktopId !== null
      && this.transport?.isDeviceReachable(this.pairedDesktopId);

    if (complexity === 'medium') {
      if (this.localModelTier === '3B' || this.localModelTier === '7B') {
        return {
          target: 'local',
          complexity,
          reason: 'Medium task — local model is capable',
          degraded: false,
        };
      }
      if (desktopAvailable) {
        return {
          target: 'remote',
          complexity,
          reason: 'Medium task — routing to desktop (local model too small)',
          degraded: false,
        };
      }
      return {
        target: 'local',
        complexity,
        reason: 'Medium task — desktop unavailable, running locally with degraded quality',
        degraded: true,
      };
    }

    // Heavy tasks
    if (desktopAvailable) {
      return {
        target: 'remote',
        complexity,
        reason: 'Heavy task — routing to desktop for better quality',
        degraded: false,
      };
    }

    // No desktop — degrade locally if we have any model
    if (this.localModelTier !== 'none') {
      return {
        target: 'local',
        complexity,
        reason: 'Heavy task — desktop unavailable, running locally with significantly degraded quality',
        degraded: true,
      };
    }

    // No model at all — can't run
    return {
      target: 'local',
      complexity,
      reason: 'No inference capability — requires desktop connection',
      degraded: true,
    };
  }

  /**
   * Execute a task with automatic routing and failover.
   * - Routes to the best device based on complexity
   * - Falls back to local if remote fails
   * - Emits routing events for transparency
   */
  async executeTask(
    taskType: string,
    payload: unknown,
    localExecutor: (payload: unknown) => Promise<unknown>,
  ): Promise<TaskResponse> {
    const routing = this.decideRouting(taskType);
    const taskId = nanoid();
    const startTime = Date.now();

    if (routing.target === 'local') {
      this.emitEvent({
        type: 'executing_local',
        taskId,
        reason: routing.reason,
      });

      try {
        const result = await localExecutor(payload);
        return {
          requestId: taskId,
          status: 'success',
          result,
          executedOn: this.localDeviceId,
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        return {
          requestId: taskId,
          status: 'error',
          executedOn: this.localDeviceId,
          durationMs: Date.now() - startTime,
          error: err instanceof Error ? err.message : 'Local execution failed',
        };
      }
    }

    // Remote execution
    if (!this.transport || !this.pairedDesktopId) {
      // Failover to local
      return this.failoverLocal(taskId, taskType, payload, localExecutor, startTime);
    }

    this.emitEvent({
      type: 'routed_remote',
      taskId,
      targetDeviceId: this.pairedDesktopId,
      targetDeviceName: this.pairedDesktopName ?? undefined,
      reason: routing.reason,
    });

    const request: TaskRequest = {
      id: taskId,
      type: inferRequestType(taskType),
      payload,
      priority: 'normal',
      timeoutMs: getTaskTimeout(inferRequestType(taskType)),
      sourceDeviceId: this.localDeviceId,
      taskType,
    };

    try {
      const response = await this.transport.sendTask(this.pairedDesktopId, request);

      if (response && response.status === 'success') {
        return response;
      }

      // Remote failed — fallback
      return this.failoverLocal(taskId, taskType, payload, localExecutor, startTime);
    } catch {
      // Connection lost — failover
      return this.failoverLocal(taskId, taskType, payload, localExecutor, startTime);
    }
  }

  private async failoverLocal(
    taskId: string,
    _taskType: string,
    payload: unknown,
    localExecutor: (payload: unknown) => Promise<unknown>,
    startTime: number,
  ): Promise<TaskResponse> {
    this.emitEvent({
      type: 'fallback_local',
      taskId,
      reason: 'Desktop connection lost. Running locally instead.',
    });

    try {
      const result = await localExecutor(payload);
      return {
        requestId: taskId,
        status: 'success',
        result,
        executedOn: this.localDeviceId,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        requestId: taskId,
        status: 'error',
        executedOn: this.localDeviceId,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : 'Local execution failed',
      };
    }
  }

  private emitEvent(event: RoutingEvent): void {
    this.onRoutingEvent?.(event);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inferRequestType(taskType: string): 'inference' | 'embedding' | 'analysis' {
  if (taskType.includes('embed') || taskType.includes('search')) return 'embedding';
  if (taskType.includes('analyze') || taskType.includes('prep') || taskType.includes('digest')) return 'analysis';
  return 'inference';
}
