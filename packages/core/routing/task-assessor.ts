// Task Complexity Assessor
// Evaluates what resources a task needs for routing decisions.
// CRITICAL: No networking imports. Pure logic — assesses task requirements
// based on task type and metadata.

import type { TaskRequirements } from './device-registry.js';

// --- Interfaces ---

export interface TaskDescription {
  type: string;
  dataSize?: number;
  urgency: 'immediate' | 'background' | 'scheduled';
  requiresNetwork: boolean;
  requiresLLM: boolean;
  estimatedInferenceTokens?: number;
}

// --- Known Task Profiles ---

/**
 * AUTONOMOUS DECISION: Pre-defined profiles for known task types.
 * Reasoning: Sprint 2 has a fixed set of action types. Profiles can be
 *   extended as new action types are added in Sprint 3+.
 * Escalation check: No architectural changes — pure data mapping.
 */
const TASK_PROFILES: Record<string, Partial<TaskRequirements>> = {
  // Email tasks — mostly lightweight, need network
  'email.categorize': {
    minRAM: 2,
    minModelSize: '3B',
    requiresGPU: false,
    requiresNetwork: false,
    estimatedDurationMs: 2000,
    estimatedBatteryImpact: 'low',
    canRunOnMobile: true,
    canRunOnDesktop: true,
    preferredDevice: 'either',
  },
  'email.fetch': {
    minRAM: 1,
    minModelSize: '0B',
    requiresGPU: false,
    requiresNetwork: true,
    estimatedDurationMs: 5000,
    estimatedBatteryImpact: 'low',
    canRunOnMobile: false, // Gateway is desktop-only for now
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },
  'email.send': {
    minRAM: 1,
    minModelSize: '0B',
    requiresGPU: false,
    requiresNetwork: true,
    estimatedDurationMs: 3000,
    estimatedBatteryImpact: 'low',
    canRunOnMobile: false,
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },
  'email.draft': {
    minRAM: 4,
    minModelSize: '7B',
    requiresGPU: false,
    requiresNetwork: false,
    estimatedDurationMs: 10000,
    estimatedBatteryImpact: 'medium',
    canRunOnMobile: true,
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },
  'email.archive': {
    minRAM: 1,
    minModelSize: '0B',
    requiresGPU: false,
    requiresNetwork: true,
    estimatedDurationMs: 2000,
    estimatedBatteryImpact: 'low',
    canRunOnMobile: false,
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },

  // Calendar tasks
  'calendar.fetch': {
    minRAM: 1,
    minModelSize: '0B',
    requiresGPU: false,
    requiresNetwork: true,
    estimatedDurationMs: 3000,
    estimatedBatteryImpact: 'low',
    canRunOnMobile: false,
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },
  'calendar.create': {
    minRAM: 1,
    minModelSize: '0B',
    requiresGPU: false,
    requiresNetwork: true,
    estimatedDurationMs: 2000,
    estimatedBatteryImpact: 'low',
    canRunOnMobile: false,
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },
  'calendar.update': {
    minRAM: 1,
    minModelSize: '0B',
    requiresGPU: false,
    requiresNetwork: true,
    estimatedDurationMs: 2000,
    estimatedBatteryImpact: 'low',
    canRunOnMobile: false,
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },

  // Complex reasoning tasks
  'meeting_prep': {
    minRAM: 4,
    minModelSize: '7B',
    requiresGPU: false,
    requiresNetwork: false,
    estimatedDurationMs: 30000,
    estimatedBatteryImpact: 'high',
    canRunOnMobile: false,
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },
  'subscription_detect': {
    minRAM: 2,
    minModelSize: '3B',
    requiresGPU: false,
    requiresNetwork: false,
    estimatedDurationMs: 5000,
    estimatedBatteryImpact: 'low',
    canRunOnMobile: true,
    canRunOnDesktop: true,
    preferredDevice: 'either',
  },
  'knowledge_moment': {
    minRAM: 4,
    minModelSize: '7B',
    requiresGPU: false,
    requiresNetwork: false,
    estimatedDurationMs: 15000,
    estimatedBatteryImpact: 'medium',
    canRunOnMobile: false,
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },
  'weekly_digest': {
    minRAM: 4,
    minModelSize: '7B',
    requiresGPU: false,
    requiresNetwork: false,
    estimatedDurationMs: 20000,
    estimatedBatteryImpact: 'medium',
    canRunOnMobile: false,
    canRunOnDesktop: true,
    preferredDevice: 'desktop',
  },
  'conflict_detection': {
    minRAM: 2,
    minModelSize: '3B',
    requiresGPU: false,
    requiresNetwork: false,
    estimatedDurationMs: 3000,
    estimatedBatteryImpact: 'low',
    canRunOnMobile: true,
    canRunOnDesktop: true,
    preferredDevice: 'either',
  },
};

// --- Default requirements for unknown task types ---

const DEFAULT_REQUIREMENTS: TaskRequirements = {
  minRAM: 4,
  minModelSize: '7B',
  requiresGPU: false,
  requiresNetwork: false,
  estimatedDurationMs: 10000,
  estimatedBatteryImpact: 'medium',
  canRunOnMobile: false,
  canRunOnDesktop: true,
  preferredDevice: 'desktop',
};

// --- TaskAssessor ---

export class TaskAssessor {
  /**
   * Assess what resources a task needs based on its type and metadata.
   */
  assess(task: TaskDescription): TaskRequirements {
    const profile = TASK_PROFILES[task.type];
    const base = profile ? { ...DEFAULT_REQUIREMENTS, ...profile } : { ...DEFAULT_REQUIREMENTS };

    // Override network requirement from task description
    if (task.requiresNetwork) {
      base.requiresNetwork = true;
      base.canRunOnMobile = false; // Gateway is desktop-only for now
      base.preferredDevice = 'desktop';
    }

    // Scale duration based on data size
    if (task.dataSize && task.dataSize > 1_000_000) {
      base.estimatedDurationMs *= 2;
      base.estimatedBatteryImpact = 'high';
    }

    // Scale requirements for large inference tasks
    if (task.requiresLLM && task.estimatedInferenceTokens) {
      if (task.estimatedInferenceTokens > 4000) {
        base.minModelSize = '7B';
        base.estimatedBatteryImpact = 'high';
        base.canRunOnMobile = false;
        base.preferredDevice = 'desktop';
      } else if (task.estimatedInferenceTokens > 1000) {
        base.estimatedBatteryImpact = 'medium';
      }
    }

    // Urgency affects preferred device
    if (task.urgency === 'background') {
      base.preferredDevice = 'desktop';
    }

    return base;
  }

  /**
   * Get the list of known task types with profiles.
   */
  getKnownTaskTypes(): string[] {
    return Object.keys(TASK_PROFILES);
  }
}
