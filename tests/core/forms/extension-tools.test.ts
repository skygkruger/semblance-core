/**
 * Step 21 — Extension tools tests.
 * Tests tool registration, premium gating, and tool execution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { FormTemplateEngine } from '@semblance/core/forms/form-templates';
import { BureaucracyTracker } from '@semblance/core/forms/bureaucracy-tracker';
import { createFormTools } from '@semblance/core/forms/extension-tools';
import type { FormManager } from '@semblance/core/forms/form-manager';

let db: InstanceType<typeof Database>;

function activatePremium(gate: PremiumGate): void {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const payload = JSON.stringify({ tier: 'digital-representative', exp: futureDate });
  const encoded = Buffer.from(payload).toString('base64');
  gate.activateLicense(`sem_header.${encoded}.signature`);
}

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('Form Extension Tools (Step 21)', () => {
  it('fill_form tool registered and callable', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    activatePremium(gate);

    const tools = createFormTools({
      formManager: { analyzeAndFill: vi.fn(), applyTemplate: vi.fn() } as unknown as FormManager,
      tracker: new BureaucracyTracker(db as unknown as DatabaseHandle),
      templates: new FormTemplateEngine(),
      premiumGate: gate,
    });

    const fillTool = tools.find(t => t.definition.name === 'fill_form');
    expect(fillTool).toBeDefined();
    expect(fillTool!.isLocal).toBe(true);
  });

  it('check_form_status tool returns tracking data', async () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    activatePremium(gate);

    const tracker = new BureaucracyTracker(db as unknown as DatabaseHandle);
    tracker.createSubmission({ formName: 'Test', expectedResponseDays: 14 });

    const tools = createFormTools({
      formManager: {} as unknown as FormManager,
      tracker,
      templates: new FormTemplateEngine(),
      premiumGate: gate,
    });

    const statusTool = tools.find(t => t.definition.name === 'check_form_status');
    const result = await statusTool!.handler({});
    const data = result.result as { pending: unknown[]; stats: { filled: number } };
    expect(data.pending).toHaveLength(1);
    expect(data.stats.filled).toBe(1);
  });

  it('list_form_templates tool returns all 4 templates', async () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    activatePremium(gate);

    const tools = createFormTools({
      formManager: {} as unknown as FormManager,
      tracker: new BureaucracyTracker(db as unknown as DatabaseHandle),
      templates: new FormTemplateEngine(),
      premiumGate: gate,
    });

    const templateTool = tools.find(t => t.definition.name === 'list_form_templates');
    const result = await templateTool!.handler({});
    const data = result.result as { templates: unknown[] };
    expect(data.templates).toHaveLength(4);
  });

  it('all tools have isLocal: true', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    const tools = createFormTools({
      formManager: {} as unknown as FormManager,
      tracker: new BureaucracyTracker(db as unknown as DatabaseHandle),
      templates: new FormTemplateEngine(),
      premiumGate: gate,
    });

    for (const tool of tools) {
      expect(tool.isLocal).toBe(true);
    }
  });

  it('tools return error when not premium', async () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    // DON'T activate premium

    const tools = createFormTools({
      formManager: {} as unknown as FormManager,
      tracker: new BureaucracyTracker(db as unknown as DatabaseHandle),
      templates: new FormTemplateEngine(),
      premiumGate: gate,
    });

    for (const tool of tools) {
      const result = await tool.handler({});
      expect(result.error).toBeDefined();
    }
  });
});
