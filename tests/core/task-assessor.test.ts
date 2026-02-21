// Tests for TaskAssessor — requirements assessment for each task type, mobile compatibility.

import { describe, it, expect } from 'vitest';
import { TaskAssessor } from '@semblance/core/routing/task-assessor.js';
import type { TaskDescription } from '@semblance/core/routing/task-assessor.js';

describe('TaskAssessor', () => {
  const assessor = new TaskAssessor();

  describe('known task types', () => {
    it('lists known task types', () => {
      const types = assessor.getKnownTaskTypes();
      expect(types.length).toBeGreaterThan(5);
      expect(types).toContain('email.fetch');
      expect(types).toContain('email.categorize');
      expect(types).toContain('calendar.fetch');
      expect(types).toContain('meeting_prep');
      expect(types).toContain('subscription_detect');
    });
  });

  describe('email tasks', () => {
    it('email.fetch requires network', () => {
      const req = assessor.assess({
        type: 'email.fetch',
        urgency: 'immediate',
        requiresNetwork: true,
        requiresLLM: false,
      });
      expect(req.requiresNetwork).toBe(true);
      expect(req.canRunOnMobile).toBe(false);
      expect(req.preferredDevice).toBe('desktop');
    });

    it('email.categorize can run on mobile', () => {
      const req = assessor.assess({
        type: 'email.categorize',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(req.canRunOnMobile).toBe(true);
      expect(req.minModelSize).toBe('3B');
    });

    it('email.draft needs larger model', () => {
      const req = assessor.assess({
        type: 'email.draft',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(req.minModelSize).toBe('7B');
      expect(req.estimatedBatteryImpact).toBe('medium');
    });

    it('email.send requires network', () => {
      const req = assessor.assess({
        type: 'email.send',
        urgency: 'immediate',
        requiresNetwork: true,
        requiresLLM: false,
      });
      expect(req.requiresNetwork).toBe(true);
      expect(req.canRunOnMobile).toBe(false);
    });

    it('email.archive requires network', () => {
      const req = assessor.assess({
        type: 'email.archive',
        urgency: 'background',
        requiresNetwork: true,
        requiresLLM: false,
      });
      expect(req.requiresNetwork).toBe(true);
    });
  });

  describe('calendar tasks', () => {
    it('calendar.fetch requires network', () => {
      const req = assessor.assess({
        type: 'calendar.fetch',
        urgency: 'background',
        requiresNetwork: true,
        requiresLLM: false,
      });
      expect(req.requiresNetwork).toBe(true);
      expect(req.preferredDevice).toBe('desktop');
    });

    it('conflict_detection can run on mobile', () => {
      const req = assessor.assess({
        type: 'conflict_detection',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(req.canRunOnMobile).toBe(true);
      expect(req.estimatedBatteryImpact).toBe('low');
    });
  });

  describe('complex reasoning tasks', () => {
    it('meeting_prep prefers desktop', () => {
      const req = assessor.assess({
        type: 'meeting_prep',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(req.preferredDevice).toBe('desktop');
      expect(req.canRunOnMobile).toBe(false);
      expect(req.estimatedBatteryImpact).toBe('high');
    });

    it('weekly_digest prefers desktop', () => {
      const req = assessor.assess({
        type: 'weekly_digest',
        urgency: 'scheduled',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(req.preferredDevice).toBe('desktop');
      expect(req.minModelSize).toBe('7B');
    });
  });

  describe('dynamic adjustments', () => {
    it('scales duration for large data', () => {
      const small = assessor.assess({
        type: 'email.categorize',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: true,
        dataSize: 100,
      });
      const large = assessor.assess({
        type: 'email.categorize',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: true,
        dataSize: 2_000_000,
      });
      expect(large.estimatedDurationMs).toBeGreaterThan(small.estimatedDurationMs);
    });

    it('scales for large inference tokens', () => {
      const small = assessor.assess({
        type: 'email.categorize',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: true,
        estimatedInferenceTokens: 500,
      });
      const large = assessor.assess({
        type: 'email.categorize',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: true,
        estimatedInferenceTokens: 5000,
      });
      expect(large.canRunOnMobile).toBe(false);
      expect(large.estimatedBatteryImpact).toBe('high');
    });

    it('background tasks prefer desktop', () => {
      const req = assessor.assess({
        type: 'subscription_detect',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: false,
      });
      expect(req.preferredDevice).toBe('desktop');
    });
  });

  describe('unknown task types', () => {
    it('returns safe defaults for unknown types', () => {
      const req = assessor.assess({
        type: 'unknown.task',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: false,
      });
      expect(req.canRunOnDesktop).toBe(true);
      expect(req.preferredDevice).toBe('desktop');
    });
  });
});
