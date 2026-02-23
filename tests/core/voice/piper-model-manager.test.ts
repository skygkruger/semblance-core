// PiperModelManager Tests — Voice selection and lifecycle.

import { describe, it, expect } from 'vitest';
import { PiperModelManager } from '../../../packages/core/voice/piper-model-manager';

describe('PiperModelManager', () => {
  it('getDefaultVoice returns en_US voice', () => {
    const mgr = new PiperModelManager();
    const voice = mgr.getDefaultVoice();
    expect(voice.language).toBe('en_US');
    expect(voice.quality).toBe('medium');
  });

  it('loadVoice + isLoaded returns true', () => {
    const mgr = new PiperModelManager();
    expect(mgr.isLoaded()).toBe(false);

    mgr.loadVoice('en_US-amy-medium');
    expect(mgr.isLoaded()).toBe(true);
    expect(mgr.getLoadedVoice()?.id).toBe('en_US-amy-medium');
  });

  it('unloadVoice frees resources', () => {
    const mgr = new PiperModelManager();
    mgr.loadVoice();
    expect(mgr.isLoaded()).toBe(true);

    mgr.unloadVoice();
    expect(mgr.isLoaded()).toBe(false);
    expect(mgr.getLoadedVoice()).toBeNull();
  });

  it('listVoices returns PiperVoiceEntry[]', () => {
    const mgr = new PiperModelManager();
    const voices = mgr.listVoices();
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('id');
    expect(voices[0]).toHaveProperty('name');
    expect(voices[0]).toHaveProperty('language');
    expect(voices[0]).toHaveProperty('gender');
    expect(voices[0]).toHaveProperty('sizeMb');
  });
});
