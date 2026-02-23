/**
 * Step 20 — TemplateEngine tests.
 * Tests 6 built-in templates, field validation, and template filling.
 */

import { describe, it, expect, vi } from 'vitest';
import { TemplateEngine } from '@semblance/core/representative/template-engine';
import type { RepresentativeEmailDrafter } from '@semblance/core/representative/email-drafter';
import type { RepresentativeDraft } from '@semblance/core/representative/types';

function makeDrafter(): RepresentativeEmailDrafter {
  return {
    draftEmail: vi.fn(async (req) => ({
      to: req.to,
      subject: req.subject,
      body: `Drafted email about: ${req.intent}`,
      draftType: req.draftType,
      styleScore: null,
      attempts: 1,
    } as RepresentativeDraft)),
  } as unknown as RepresentativeEmailDrafter;
}

describe('TemplateEngine (Step 20)', () => {
  it('returns all 6 built-in templates', () => {
    const engine = new TemplateEngine(makeDrafter());
    const templates = engine.getTemplates();
    expect(templates).toHaveLength(6);
    const names = templates.map(t => t.name);
    expect(names).toContain('refund');
    expect(names).toContain('billing');
    expect(names).toContain('cancellation');
    expect(names).toContain('inquiry');
    expect(names).toContain('escalation');
    expect(names).toContain('warranty');
  });

  it('getTemplate returns specific template by name', () => {
    const engine = new TemplateEngine(makeDrafter());
    const template = engine.getTemplate('refund');
    expect(template).not.toBeNull();
    expect(template!.label).toBe('Request Refund');
    expect(template!.draftType).toBe('refund');
    expect(template!.fields.some(f => f.name === 'reason' && f.required)).toBe(true);
  });

  it('validateFields catches missing required fields', () => {
    const engine = new TemplateEngine(makeDrafter());
    const result = engine.validateFields('refund', {
      companyName: 'Acme',
      supportEmail: 'support@acme.com',
      // missing 'reason' which is required
    });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('reason');
  });

  it('validateFields passes when all required fields present', () => {
    const engine = new TemplateEngine(makeDrafter());
    const result = engine.validateFields('cancellation', {
      companyName: 'Netflix',
      supportEmail: 'support@netflix.com',
    });
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('fillTemplate delegates to emailDrafter with correct parameters', async () => {
    const drafter = makeDrafter();
    const engine = new TemplateEngine(drafter);

    const draft = await engine.fillTemplate('refund', {
      companyName: 'Acme Corp',
      supportEmail: 'support@acme.com',
      reason: 'Product was defective',
      amount: '$49.99',
    }, 'support@acme.com');

    expect(draft).not.toBeNull();
    expect(draft!.subject).toBe('Refund Request — Acme Corp');
    expect(draft!.draftType).toBe('refund');
    expect(drafter.draftEmail).toHaveBeenCalledOnce();
  });

  it('fillTemplate returns null for unknown template name', async () => {
    const engine = new TemplateEngine(makeDrafter());
    const result = await engine.fillTemplate('nonexistent', {}, 'test@test.com');
    expect(result).toBeNull();
  });
});
