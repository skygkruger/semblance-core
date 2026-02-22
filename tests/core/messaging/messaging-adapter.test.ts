// MessagingAdapter Tests — Verify platform-specific messaging behavior.
// Tests mock adapter for iOS, Android, and Desktop platforms.

import { describe, it, expect } from 'vitest';
import { createMockMessagingAdapter } from '../../../packages/core/platform/desktop-messaging';

describe('MessagingAdapter', () => {
  it('returns correct capabilities for iOS', () => {
    const adapter = createMockMessagingAdapter({ platform: 'ios' });
    const caps = adapter.getCapabilities();
    expect(caps.canSendAutonomously).toBe(false);
    expect(caps.canReadHistory).toBe(false);
    expect(caps.requiresUserConfirmation).toBe(true);
  });

  it('returns correct capabilities for Android with permission', () => {
    const adapter = createMockMessagingAdapter({ platform: 'android', permissionGranted: true });
    const caps = adapter.getCapabilities();
    expect(caps.canSendAutonomously).toBe(true);
    expect(caps.canReadHistory).toBe(true);
    expect(caps.requiresUserConfirmation).toBe(false);
  });

  it('returns correct capabilities for Desktop', () => {
    const adapter = createMockMessagingAdapter({ platform: 'desktop' });
    const caps = adapter.getCapabilities();
    expect(caps.canSendAutonomously).toBe(false);
    expect(caps.canReadHistory).toBe(false);
    expect(caps.requiresUserConfirmation).toBe(true);
  });

  it('iOS sendMessage always returns presented', async () => {
    const adapter = createMockMessagingAdapter({ platform: 'ios' });
    const result = await adapter.sendMessage({ phone: '+15551234567', body: 'Hello' });
    expect(result.status).toBe('presented');
  });

  it('Android sendMessage with autonomous=true returns sent', async () => {
    const adapter = createMockMessagingAdapter({ platform: 'android', permissionGranted: true });
    const result = await adapter.sendMessage({ phone: '+15551234567', body: 'Hello', autonomous: true });
    expect(result.status).toBe('sent');
    expect(result.messageId).toBeDefined();
  });

  it('Android sendMessage with autonomous=false returns presented', async () => {
    const adapter = createMockMessagingAdapter({ platform: 'android', permissionGranted: true });
    const result = await adapter.sendMessage({ phone: '+15551234567', body: 'Hello', autonomous: false });
    expect(result.status).toBe('presented');
  });

  it('invalid phone number returns failed with error', async () => {
    const adapter = createMockMessagingAdapter({ platform: 'desktop' });
    const result = await adapter.sendMessage({ phone: '12', body: 'Hello' });
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/invalid/i);
  });

  it('permission denied returns permission_denied', async () => {
    const adapter = createMockMessagingAdapter({ platform: 'android', permissionGranted: false });
    const result = await adapter.sendMessage({ phone: '+15551234567', body: 'Hello' });
    expect(result.status).toBe('permission_denied');
    expect(result.error).toBeDefined();
  });
});
