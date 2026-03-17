// Canvas Manager — Agent-driven UI panel for structured data display.
//
// The Canvas panel renders alongside the conversation. The AI Core pushes
// structured updates — charts, briefs, timelines — via canvas.* action types.
// Canvas updates are sandboxed: only known componentType schemas are accepted.
// All pushes are logged to the Merkle audit chain.
// CRITICAL: No dangerouslySetInnerHTML. No eval. Typed data props only.

import { sha256 } from '@semblance/core';
import type { AuditTrail } from '../audit/trail.js';

export type CanvasComponentType =
  | 'morning_brief'
  | 'knowledge_graph'
  | 'chart'
  | 'timeline'
  | 'form_preview'
  | 'sovereignty_report'
  | 'alter_ego_card'
  | 'custom';

export interface CanvasPushPayload {
  componentType: CanvasComponentType;
  data: Record<string, unknown>;
  replace: boolean;
  title?: string;
}

export interface CanvasState {
  currentPayload: CanvasPushPayload | null;
  history: CanvasPushPayload[];
  lastPushedAt: string | null;
  pushCount: number;
}

const VALID_COMPONENT_TYPES = new Set<CanvasComponentType>([
  'morning_brief',
  'knowledge_graph',
  'chart',
  'timeline',
  'form_preview',
  'sovereignty_report',
  'alter_ego_card',
  'custom',
]);

/**
 * CanvasManager validates and tracks canvas state.
 * All canvas pushes are audit-logged with content hashes.
 */
export class CanvasManager {
  private state: CanvasState = {
    currentPayload: null,
    history: [],
    lastPushedAt: null,
    pushCount: 0,
  };
  private auditTrail: AuditTrail | null;
  private maxHistorySize = 20;

  constructor(config?: { auditTrail?: AuditTrail }) {
    this.auditTrail = config?.auditTrail ?? null;
  }

  /**
   * Validate and push a canvas update.
   * Returns true if accepted, false if rejected (unknown component type).
   */
  push(payload: CanvasPushPayload): { accepted: boolean; reason?: string } {
    // Validate component type
    if (!VALID_COMPONENT_TYPES.has(payload.componentType)) {
      return { accepted: false, reason: `Unknown component type: ${payload.componentType}` };
    }

    // Validate data exists
    if (!payload.data || typeof payload.data !== 'object') {
      return { accepted: false, reason: 'Payload data must be a non-null object' };
    }

    // Apply to state
    if (payload.replace) {
      this.state.currentPayload = payload;
    } else {
      this.state.currentPayload = payload; // For now, single-payload canvas
    }

    this.state.pushCount++;
    this.state.lastPushedAt = new Date().toISOString();
    this.state.history.push(payload);
    if (this.state.history.length > this.maxHistorySize) {
      this.state.history.shift();
    }

    // Audit log
    if (this.auditTrail) {
      const payloadHash = sha256(JSON.stringify(payload));
      this.auditTrail.append({
        requestId: `canvas-push-${Date.now()}`,
        timestamp: this.state.lastPushedAt,
        action: 'canvas.push' as any,
        direction: 'request',
        status: 'success',
        payloadHash,
        signature: payloadHash,
        metadata: {
          componentType: payload.componentType,
          title: payload.title,
          replace: payload.replace,
        },
      });
    }

    return { accepted: true };
  }

  /**
   * Clear the canvas panel.
   */
  clear(): void {
    this.state.currentPayload = null;

    if (this.auditTrail) {
      const now = new Date().toISOString();
      this.auditTrail.append({
        requestId: `canvas-clear-${Date.now()}`,
        timestamp: now,
        action: 'canvas.clear' as any,
        direction: 'request',
        status: 'success',
        payloadHash: sha256('canvas-clear'),
        signature: sha256('canvas-clear'),
        metadata: { event: 'canvas_cleared' },
      });
    }
  }

  /**
   * Get current canvas state (for restore after app restart).
   */
  getState(): CanvasState {
    return { ...this.state };
  }

  /**
   * Snapshot current canvas as JSON (for audit trail).
   */
  snapshot(): string {
    return JSON.stringify(this.state.currentPayload);
  }

  /**
   * Get the current payload (for frontend rendering).
   */
  getCurrentPayload(): CanvasPushPayload | null {
    return this.state.currentPayload;
  }
}
