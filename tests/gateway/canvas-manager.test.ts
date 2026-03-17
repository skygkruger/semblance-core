// Tests for CanvasManager — push validation, schema rejection, state, audit logging.

import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasManager } from '../../packages/gateway/canvas/canvas-manager.js';
import type { CanvasPushPayload } from '../../packages/gateway/canvas/canvas-manager.js';

describe('CanvasManager', () => {
  let canvas: CanvasManager;

  beforeEach(() => {
    canvas = new CanvasManager();
  });

  describe('push validation', () => {
    it('accepts valid morning_brief component', () => {
      const result = canvas.push({
        componentType: 'morning_brief',
        data: { summary: 'Good morning!' },
        replace: true,
        title: 'Morning Brief',
      });
      expect(result.accepted).toBe(true);
    });

    it('accepts all valid component types', () => {
      const types = [
        'morning_brief', 'knowledge_graph', 'chart', 'timeline',
        'form_preview', 'sovereignty_report', 'alter_ego_card', 'custom',
      ] as const;
      for (const type of types) {
        const result = canvas.push({ componentType: type, data: {}, replace: true });
        expect(result.accepted).toBe(true);
      }
    });

    it('rejects unknown component type', () => {
      const result = canvas.push({
        componentType: 'malicious_script' as any,
        data: {},
        replace: true,
      });
      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('Unknown component type');
    });

    it('rejects null data', () => {
      const result = canvas.push({
        componentType: 'chart',
        data: null as any,
        replace: true,
      });
      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('non-null object');
    });
  });

  describe('state management', () => {
    it('getCurrentPayload returns null initially', () => {
      expect(canvas.getCurrentPayload()).toBeNull();
    });

    it('push updates current payload', () => {
      canvas.push({ componentType: 'chart', data: { x: 1 }, replace: true });
      const payload = canvas.getCurrentPayload();
      expect(payload).not.toBeNull();
      expect(payload!.componentType).toBe('chart');
    });

    it('clear removes current payload', () => {
      canvas.push({ componentType: 'chart', data: {}, replace: true });
      canvas.clear();
      expect(canvas.getCurrentPayload()).toBeNull();
    });

    it('getState returns push count', () => {
      canvas.push({ componentType: 'chart', data: {}, replace: true });
      canvas.push({ componentType: 'timeline', data: {}, replace: true });
      const state = canvas.getState();
      expect(state.pushCount).toBe(2);
      expect(state.lastPushedAt).toBeTruthy();
    });

    it('maintains history', () => {
      canvas.push({ componentType: 'chart', data: { id: 1 }, replace: true });
      canvas.push({ componentType: 'timeline', data: { id: 2 }, replace: true });
      const state = canvas.getState();
      expect(state.history).toHaveLength(2);
    });

    it('snapshot returns current payload as JSON', () => {
      canvas.push({ componentType: 'morning_brief', data: { hello: 'world' }, replace: true });
      const snap = canvas.snapshot();
      const parsed = JSON.parse(snap);
      expect(parsed.componentType).toBe('morning_brief');
      expect(parsed.data.hello).toBe('world');
    });

    it('snapshot returns "null" when empty', () => {
      expect(canvas.snapshot()).toBe('null');
    });
  });
});
