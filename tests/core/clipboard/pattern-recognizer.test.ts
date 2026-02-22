// Pattern Recognizer Tests — Verify regex pattern detection for clipboard content.

import { describe, it, expect } from 'vitest';
import { ClipboardPatternRecognizer } from '../../../packages/core/agent/clipboard/pattern-recognizer';

describe('ClipboardPatternRecognizer', () => {
  const recognizer = new ClipboardPatternRecognizer();

  it('FedEx tracking number recognized with high confidence', async () => {
    const result = await recognizer.analyze('Your tracking number is 123456789012');
    expect(result.hasActionableContent).toBe(true);
    const tracking = result.patterns.find(p => p.type === 'tracking_number');
    expect(tracking).toBeDefined();
    expect(tracking!.value).toBe('123456789012');
    expect(tracking!.carrier).toBe('fedex');
  });

  it('UPS tracking number (1Z prefix) recognized', async () => {
    const result = await recognizer.analyze('Track: 1Z999AA10123456784');
    expect(result.hasActionableContent).toBe(true);
    const tracking = result.patterns.find(p => p.type === 'tracking_number' && p.carrier === 'ups');
    expect(tracking).toBeDefined();
    expect(tracking!.value.startsWith('1Z')).toBe(true);
    expect(tracking!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('flight code "AA1234" recognized', async () => {
    const result = await recognizer.analyze('Flight AA1234 departs at 3pm');
    expect(result.hasActionableContent).toBe(true);
    const flight = result.patterns.find(p => p.type === 'flight_code');
    expect(flight).toBeDefined();
    expect(flight!.value).toBe('AA1234');
  });

  it('phone number various formats recognized', async () => {
    const formats = [
      '(555) 123-4567',
      '555-123-4567',
      '+1 555 123 4567',
      '5551234567',
    ];

    for (const phone of formats) {
      const result = await recognizer.analyze(`Call me at ${phone}`);
      expect(result.hasActionableContent).toBe(true);
      const phoneMatch = result.patterns.find(p => p.type === 'phone_number');
      expect(phoneMatch, `Failed to recognize: ${phone}`).toBeDefined();
    }
  });

  it('URL recognized', async () => {
    const result = await recognizer.analyze('Check out https://example.com/article/123');
    expect(result.hasActionableContent).toBe(true);
    const url = result.patterns.find(p => p.type === 'url');
    expect(url).toBeDefined();
    expect(url!.value).toContain('example.com');
  });

  it('email address recognized', async () => {
    const result = await recognizer.analyze('Send to user@example.com');
    expect(result.hasActionableContent).toBe(true);
    const email = result.patterns.find(p => p.type === 'email_address');
    expect(email).toBeDefined();
    expect(email!.value).toBe('user@example.com');
  });

  it('price "$49.99" and "$1,234.56" recognized', async () => {
    const result1 = await recognizer.analyze('The price is $49.99');
    expect(result1.hasActionableContent).toBe(true);
    expect(result1.patterns.find(p => p.type === 'price')).toBeDefined();

    const result2 = await recognizer.analyze('Total: $1,234.56');
    expect(result2.hasActionableContent).toBe(true);
    expect(result2.patterns.find(p => p.type === 'price')).toBeDefined();
  });

  it('plain text with no patterns → hasActionableContent: false', async () => {
    const result = await recognizer.analyze('Just some random text about nothing in particular');
    expect(result.hasActionableContent).toBe(false);
    expect(result.patterns).toHaveLength(0);
  });
});
