// SpeechSynthesisPipeline Tests — TTS orchestration.

import { describe, it, expect, vi } from 'vitest';
import { SpeechSynthesisPipeline } from '../../../packages/core/voice/speech-synthesis-pipeline';
import { PiperModelManager } from '../../../packages/core/voice/piper-model-manager';
import { createMockVoiceAdapter } from '../../../packages/core/platform/desktop-voice';

describe('SpeechSynthesisPipeline', () => {
  it('speak() calls synthesize and playAudio', async () => {
    const adapter = createMockVoiceAdapter();
    const synthesizeSpy = vi.spyOn(adapter, 'synthesize');
    const playSpy = vi.spyOn(adapter, 'playAudio');
    const mgr = new PiperModelManager();
    const pipeline = new SpeechSynthesisPipeline(adapter, mgr);

    const result = await pipeline.speak('Hello, world.');
    expect(result.completed).toBe(true);
    expect(result.sentenceCount).toBeGreaterThan(0);
    expect(synthesizeSpy).toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalled();
  });

  it('stop() interrupts, SpeakResult.completed = false', async () => {
    const adapter = createMockVoiceAdapter();
    // Make playAudio slow so we can stop mid-speech
    vi.spyOn(adapter, 'playAudio').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    const mgr = new PiperModelManager();
    const pipeline = new SpeechSynthesisPipeline(adapter, mgr);

    // Start speaking and stop after a brief delay
    const speakPromise = pipeline.speak('First sentence. Second sentence. Third sentence.');
    setTimeout(() => pipeline.stop(), 10);

    const result = await speakPromise;
    expect(result.completed).toBe(false);
  });

  it('isSpeaking() reflects current state', async () => {
    const adapter = createMockVoiceAdapter();
    const mgr = new PiperModelManager();
    const pipeline = new SpeechSynthesisPipeline(adapter, mgr);

    expect(pipeline.isSpeaking()).toBe(false);

    // After speak completes, isSpeaking should be false again
    await pipeline.speak('Short text.');
    expect(pipeline.isSpeaking()).toBe(false);
  });
});
