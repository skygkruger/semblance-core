// ClipboardAdapter Tests — Verify clipboard read/write/change detection.

import { describe, it, expect, vi } from 'vitest';
import { createMockClipboardAdapter } from '../../../packages/core/platform/desktop-clipboard';

describe('ClipboardAdapter', () => {
  it('readClipboard returns current text', async () => {
    const adapter = createMockClipboardAdapter({ initialText: 'hello world' });
    const content = await adapter.readClipboard();
    expect(content.text).toBe('hello world');
    expect(content.hasText).toBe(true);
  });

  it('onClipboardChanged fires when content changes', async () => {
    const adapter = createMockClipboardAdapter();
    const callback = vi.fn();

    adapter.onClipboardChanged(callback);
    adapter.simulateCopy('new content');

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]![0].text).toBe('new content');
    expect(callback.mock.calls[0]![0].hasText).toBe(true);
  });

  it('unsubscribe stops callbacks', () => {
    const adapter = createMockClipboardAdapter();
    const callback = vi.fn();

    const unsubscribe = adapter.onClipboardChanged(callback);
    adapter.simulateCopy('first');
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    adapter.simulateCopy('second');
    expect(callback).toHaveBeenCalledTimes(1); // Not called again
  });

  it('permission denied → hasPermission false, readClipboard returns null text', async () => {
    const adapter = createMockClipboardAdapter({ permissionGranted: false });
    expect(await adapter.hasPermission()).toBe(false);
    const content = await adapter.readClipboard();
    expect(content.text).toBeNull();
    expect(content.hasText).toBe(false);
  });

  it('writeClipboard sets content (verified via readClipboard)', async () => {
    const adapter = createMockClipboardAdapter();
    await adapter.writeClipboard('written text');
    const content = await adapter.readClipboard();
    expect(content.text).toBe('written text');
  });

  it('multiple listeners fire independently', () => {
    const adapter = createMockClipboardAdapter();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    adapter.onClipboardChanged(callback1);
    adapter.onClipboardChanged(callback2);
    adapter.simulateCopy('shared content');

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(1);
  });
});
