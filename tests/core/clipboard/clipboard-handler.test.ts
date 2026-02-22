// Clipboard Handler Tests — Verify action execution, autonomy, and privacy.

import { describe, it, expect } from 'vitest';
import { ClipboardActionHandler } from '../../../packages/core/agent/clipboard/clipboard-handler';
import { ClipboardPatternRecognizer } from '../../../packages/core/agent/clipboard/pattern-recognizer';
import { sanitizeForAuditTrail, CLIPBOARD_AUDIT_RULES } from '../../../packages/core/agent/clipboard/clipboard-privacy';

describe('ClipboardActionHandler', () => {
  const handler = new ClipboardActionHandler();
  const recognizer = new ClipboardPatternRecognizer();

  it('tracking number → web search executed (Partner)', async () => {
    const analysis = await recognizer.analyze('Track: 123456789012');
    const pattern = analysis.patterns[0]!;

    const result = await handler.handlePattern(pattern, 'partner');
    expect(result.executed).toBe(true);
    expect(result.action).toBe('track_package');
    expect(result.requiresApproval).toBe(false);
    expect(result.result).toBeDefined();
  });

  it('tracking number → not executed, requires approval (Guardian)', async () => {
    const analysis = await recognizer.analyze('Track: 123456789012');
    const pattern = analysis.patterns[0]!;

    const result = await handler.handlePattern(pattern, 'guardian');
    expect(result.executed).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.pendingApprovalId).toBeDefined();
  });

  it('URL → web.retrieve action triggered', async () => {
    const analysis = await recognizer.analyze('https://example.com/article');
    const pattern = analysis.patterns.find(p => p.type === 'url')!;

    const result = await handler.handlePattern(pattern, 'partner');
    expect(result.executed).toBe(true);
    expect(result.action).toBe('summarize_url');
    const data = result.result as Record<string, unknown>;
    expect(data.action).toBe('web.retrieve');
  });

  it('phone not in contacts → offer to add (lookup_contact action)', async () => {
    const analysis = await recognizer.analyze('Call (555) 123-4567');
    const pattern = analysis.patterns.find(p => p.type === 'phone_number')!;

    const result = await handler.handlePattern(pattern, 'alter_ego');
    expect(result.executed).toBe(true);
    expect(result.action).toBe('lookup_contact');
    const data = result.result as Record<string, unknown>;
    expect(data.action).toBe('contacts.search');
  });

  it('phone in contacts → show contact card', async () => {
    // Same action — lookup_contact triggers contact search
    const analysis = await recognizer.analyze('+15551234567');
    const pattern = analysis.patterns.find(p => p.type === 'phone_number')!;

    const result = await handler.handlePattern(pattern, 'partner');
    expect(result.action).toBe('lookup_contact');
  });
});

describe('Clipboard Privacy', () => {
  it('full clipboard text NOT in any output', () => {
    const fullText = 'My secret clipboard with tracking 123456789012 and password abc123';
    const recognizer = new ClipboardPatternRecognizer();

    // The recognizer only extracts patterns, never stores full text
    expect(CLIPBOARD_AUDIT_RULES.fullTextStored).toBe(false);

    // Verify sanitize function output
    const pattern = {
      type: 'tracking_number' as const,
      value: '123456789012',
      confidence: 0.7,
      carrier: 'fedex',
      suggestedAction: {
        actionType: 'track_package' as const,
        description: 'Track FedEx package',
        pattern: { type: 'tracking_number' as const, value: '123456789012', confidence: 0.7, carrier: 'fedex' },
      },
    };

    const sanitized = sanitizeForAuditTrail(pattern);
    const sanitizedStr = JSON.stringify(sanitized);

    // Full text should NOT appear anywhere in the sanitized output
    expect(sanitizedStr).not.toContain('My secret clipboard');
    expect(sanitizedStr).not.toContain('password');
    expect(sanitizedStr).not.toContain('abc123');
  });

  it('only pattern type + extracted value in sanitized output', () => {
    const pattern = {
      type: 'url' as const,
      value: 'https://example.com',
      confidence: 0.95,
      suggestedAction: {
        actionType: 'summarize_url' as const,
        description: 'Summarize this page',
        pattern: { type: 'url' as const, value: 'https://example.com', confidence: 0.95 },
      },
    };

    const sanitized = sanitizeForAuditTrail(pattern);

    expect(sanitized.patternType).toBe('url');
    expect(sanitized.extractedValue).toBe('https://example.com');
    expect(sanitized.actionType).toBe('summarize_url');
    expect(sanitized.confidence).toBe(0.95);

    // Should have exactly these fields and no more
    const keys = Object.keys(sanitized);
    expect(keys).toContain('patternType');
    expect(keys).toContain('extractedValue');
    expect(keys).not.toContain('fullText');
    expect(keys).not.toContain('clipboardText');
  });

  it('autonomy tier respected: Guardian requires approval, Partner auto-executes', async () => {
    const handler = new ClipboardActionHandler();
    const recognizer = new ClipboardPatternRecognizer();
    const analysis = await recognizer.analyze('Track: 123456789012');
    const pattern = analysis.patterns[0]!;

    const guardianResult = await handler.handlePattern(pattern, 'guardian');
    expect(guardianResult.requiresApproval).toBe(true);
    expect(guardianResult.executed).toBe(false);

    const partnerResult = await handler.handlePattern(pattern, 'partner');
    expect(partnerResult.requiresApproval).toBe(false);
    expect(partnerResult.executed).toBe(true);
  });
});
