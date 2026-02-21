// Task Router — Routing Decision Engine
// Matches tasks to the best available device based on requirements and capabilities.
// CRITICAL: No networking imports. Pure logic — routing decisions only.
// Actual task delegation (sending tasks between devices) is Sprint 3.

import { DeviceRegistry } from './device-registry.js';
import type { DeviceCapabilities, TaskRequirements } from './device-registry.js';
import { TaskAssessor } from './task-assessor.js';
import type { TaskDescription } from './task-assessor.js';

// --- Interfaces ---

export interface RoutingDecision {
  targetDevice: DeviceCapabilities;
  reason: string;
  confidence: number;
  alternatives: Array<{
    device: DeviceCapabilities;
    reason: string;
  }>;
}

// --- Task Router ---

export class TaskRouter {
  private registry: DeviceRegistry;
  private assessor: TaskAssessor;

  constructor(registry: DeviceRegistry, assessor?: TaskAssessor) {
    this.registry = registry;
    this.assessor = assessor ?? new TaskAssessor();
  }

  /**
   * Route a task to the best available device.
   * Follows routing rules in priority order:
   * 1. Network requirement: must have Gateway access
   * 2. Model size: must support required model
   * 3. Battery: prefer desktop when mobile is low
   * 4. Connectivity: prefer desktop for large data on cellular
   * 5. Current load: prefer idle device
   * 6. Urgency: immediate → active device, background → desktop
   * 7. Default: prefer desktop (more compute, reliable power)
   */
  route(task: TaskDescription): RoutingDecision | null {
    const requirements = this.assessor.assess(task);
    const devices = this.registry.getDevices().filter(d => d.isOnline);

    if (devices.length === 0) {
      return null;
    }

    // Score each device
    const scored = devices.map(device => ({
      device,
      score: this.scoreDevice(device, requirements, task),
      reasons: this.getReasons(device, requirements, task),
    }));

    // Filter to capable devices only
    const capable = scored.filter(s => s.score > -100);

    if (capable.length === 0) {
      return null;
    }

    // Sort by score descending
    capable.sort((a, b) => b.score - a.score);

    const best = capable[0]!;
    const alternatives = capable.slice(1).map(alt => ({
      device: alt.device,
      reason: alt.reasons.length > 0 ? alt.reasons[0]! : 'Lower overall score',
    }));

    // Compute confidence: 1.0 if clear winner, lower if close scores
    const confidence = capable.length === 1
      ? 1.0
      : Math.min(1.0, Math.max(0.5, (best.score - (capable[1]?.score ?? 0)) / 20));

    // Log the decision
    this.registry.logDecision(
      task.type,
      best.device.id,
      best.reasons.join('; ') || 'Best available device',
      confidence,
    );

    return {
      targetDevice: best.device,
      reason: best.reasons.join('; ') || 'Best available device',
      confidence,
      alternatives,
    };
  }

  /**
   * Check if a specific device can handle a task.
   */
  canHandle(deviceId: string, task: TaskDescription): boolean {
    const device = this.registry.getDevice(deviceId);
    if (!device || !device.isOnline) return false;

    const requirements = this.assessor.assess(task);
    return this.scoreDevice(device, requirements, task) > -100;
  }

  /**
   * Score a device for a task. Negative scores mean incapable.
   */
  private scoreDevice(
    device: DeviceCapabilities,
    requirements: TaskRequirements,
    task: TaskDescription,
  ): number {
    let score = 0;

    // Rule 1: Network requirement (hard constraint)
    if (requirements.requiresNetwork && device.type === 'mobile') {
      return -200; // Mobile doesn't have Gateway access yet
    }

    // Rule 2: Model size (hard constraint)
    if (!meetsModelSize(device.maxModelSize, requirements.minModelSize)) {
      return -150;
    }

    // RAM check (hard constraint)
    if (device.ramGB < requirements.minRAM) {
      return -150;
    }

    // GPU check (hard constraint)
    if (requirements.requiresGPU && !device.gpuAvailable) {
      return -150;
    }

    // Mobile/desktop capability check (hard constraint)
    if (device.type === 'mobile' && !requirements.canRunOnMobile) {
      return -150;
    }

    // Rule 3: Battery (soft constraint)
    if (device.type === 'mobile' && device.batteryLevel !== null && device.batteryLevel < 20) {
      if (task.urgency === 'background') {
        score -= 30; // Strongly avoid using low-battery mobile for background tasks
      } else if (requirements.estimatedBatteryImpact === 'high') {
        score -= 20;
      }
    }

    // Rule 4: Connectivity
    if (device.networkType === 'cellular' && task.dataSize && task.dataSize > 500_000) {
      score -= 10; // Avoid large data transfers over cellular
    }

    // Rule 5: Current load
    if (device.inferenceActive) {
      score -= 15;
    }
    score -= device.activeTasks * 3;

    // Rule 6: Urgency
    if (task.urgency === 'background') {
      if (device.type === 'desktop') score += 10;
    }

    // Rule 7: Device preference
    if (requirements.preferredDevice === device.type) score += 10;
    if (requirements.preferredDevice === 'either') score += 5;

    // Desktop baseline bonus
    if (device.type === 'desktop') score += 5;

    // More RAM is better
    score += Math.min(device.ramGB, 16);

    // Better connectivity is better
    if (device.networkType === 'ethernet') score += 3;
    if (device.networkType === 'wifi') score += 2;

    // Charging mobile gets bonus
    if (device.type === 'mobile' && device.isCharging) score += 5;

    return score;
  }

  /**
   * Get human-readable reasons for routing decisions.
   */
  private getReasons(
    device: DeviceCapabilities,
    requirements: TaskRequirements,
    task: TaskDescription,
  ): string[] {
    const reasons: string[] = [];

    if (requirements.requiresNetwork && device.type === 'desktop') {
      reasons.push('Task requires Gateway (desktop only)');
    }

    if (requirements.preferredDevice === device.type) {
      reasons.push(`Task prefers ${device.type}`);
    }

    if (device.type === 'mobile' && device.batteryLevel !== null && device.batteryLevel < 20) {
      reasons.push('Mobile battery is low');
    }

    if (!device.inferenceActive && device.activeTasks === 0) {
      reasons.push('Device is idle');
    }

    if (device.inferenceActive) {
      reasons.push('Device is already running inference');
    }

    return reasons;
  }
}

// --- Helpers ---

const MODEL_SIZE_ORDER: Record<string, number> = {
  '0B': 0, '1B': 1, '3B': 3, '7B': 7, '8B': 8, '13B': 13, '30B': 30, '70B': 70,
};

function parseModelSize(size: string): number {
  return MODEL_SIZE_ORDER[size] ?? (parseInt(size, 10) || 0);
}

function meetsModelSize(deviceMax: string, required: string): boolean {
  return parseModelSize(deviceMax) >= parseModelSize(required);
}
