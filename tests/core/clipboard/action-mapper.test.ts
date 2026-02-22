// Action Mapper Tests — Verify pattern-to-action mapping and multi-pattern detection.

import { describe, it, expect, vi } from 'vitest';
import { ClipboardActionMapper } from '../../../packages/core/agent/clipboard/action-mapper';
import { ClipboardPatternRecognizer } from '../../../packages/core/agent/clipboard/pattern-recognizer';
import type { PatternMatch } from '../../../packages/core/agent/clipboard/patterns';

describe('ClipboardActionMapper', () => {
  const mapper = new ClipboardActionMapper();

  it('tracking_number → track_package action type', () => {
    const pattern: PatternMatch = {
      type: 'tracking_number',
      value: '123456789012',
      confidence: 0.7,
      carrier: 'fedex',
    };
    const action = mapper.mapPatternToAction(pattern);
    expect(action.actionType).toBe('track_package');
    expect(action.description).toContain('FEDEX');
  });

  it('flight_code → track_flight action type', () => {
    const pattern: PatternMatch = {
      type: 'flight_code',
      value: 'UA456',
      confidence: 0.8,
    };
    const action = mapper.mapPatternToAction(pattern);
    expect(action.actionType).toBe('track_flight');
    expect(action.description).toContain('flight');
  });

  it('multiple patterns in same text → all detected and mapped', async () => {
    const recognizer = new ClipboardPatternRecognizer();
    const result = await recognizer.analyze(
      'Track 1Z999AA10123456784 and call (555) 123-4567'
    );

    expect(result.hasActionableContent).toBe(true);
    expect(result.patterns.length).toBeGreaterThanOrEqual(2);

    const types = result.patterns.map(p => p.type);
    expect(types).toContain('tracking_number');
    expect(types).toContain('phone_number');

    // All patterns should have suggested actions
    for (const pattern of result.patterns) {
      expect(pattern.suggestedAction).toBeDefined();
    }
  });

  it('LLM fallback invoked for ambiguous address text (mock LLM)', async () => {
    const mockLLM = {
      chat: vi.fn().mockResolvedValue({
        message: {
          content: JSON.stringify([{ type: 'address', value: '123 Main St, Springfield, IL' }]),
          role: 'assistant',
        },
        tokensUsed: { prompt: 10, completion: 5 },
      }),
      isAvailable: vi.fn().mockResolvedValue(true),
      listModels: vi.fn().mockResolvedValue([]),
    };

    const recognizer = new ClipboardPatternRecognizer({ llm: mockLLM as never, model: 'test' });
    const result = await recognizer.analyze('Meet me at one twenty three Main Street in Springfield Illinois');

    // LLM should have been called since regex won't match a spelled-out address
    expect(mockLLM.chat).toHaveBeenCalled();
    // Depending on LLM mock response, may have patterns
    if (result.hasActionableContent) {
      expect(result.patterns[0]!.type).toBe('address');
    }
  });

  it('UPS 1Z prefix detected as carrier distinction', async () => {
    const recognizer = new ClipboardPatternRecognizer();
    const result = await recognizer.analyze('1Z999AA10123456784');

    const upsPattern = result.patterns.find(p => p.carrier === 'ups');
    expect(upsPattern).toBeDefined();
    expect(upsPattern!.carrier).toBe('ups');
  });
});
