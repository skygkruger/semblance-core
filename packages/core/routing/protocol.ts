// Cross-Device Communication Protocol Types
// Protocol interface definitions for inter-device task delegation.
// CRITICAL: No networking imports. Type definitions only.

import type { TaskDescription } from './task-assessor.js';

// --- Discovery ---

export interface DiscoveredDevice {
  id: string;
  name: string;
  address: string;
  port: number;
  type: 'desktop' | 'mobile';
  platform: string;
  discoveredAt: string;
  discoveryMethod: 'mdns' | 'manual';
}

// --- Delegation ---

export interface TaskDelegation {
  delegationId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  task: TaskDescription;
  payload: unknown;
  createdAt: string;
  status: DelegationStatus;
}

export type DelegationStatus = 'queued' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface DelegationResult {
  delegationId: string;
  status: DelegationStatus;
  result?: unknown;
  error?: { code: string; message: string };
  completedAt: string | null;
}

export interface IncomingDelegation {
  delegationId: string;
  sourceDeviceId: string;
  task: TaskDescription;
  payload: unknown;
}

// --- Protocol Interface ---

/**
 * TaskDelegationProtocol defines how devices discover each other
 * and delegate tasks.
 *
 * Implementation requirements:
 * - mDNS/Bonjour for local network discovery
 * - Mutual TLS authentication (NO unauthenticated local connections)
 * - IPC action request format over local TLS
 * - Graceful fallback to local execution if desktop unavailable
 */
export interface TaskDelegationProtocol {
  /** Discover devices on the local network. */
  discoverDevices(): Promise<DiscoveredDevice[]>;

  /** Delegate a task to another device. */
  delegateTask(deviceId: string, task: TaskDescription, payload: unknown): Promise<DelegationResult>;

  /** Check status of a delegated task. */
  checkStatus(delegationId: string): Promise<DelegationStatus>;

  /** Receive a delegated task (called on target device). */
  receiveTask(delegation: IncomingDelegation): Promise<void>;
}
