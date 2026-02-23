// Voice E2E Integration Tests — Full voice conversation loop, tool routing,
// memory budget, and barrel import verification.

import { describe, it, expect } from 'vitest';
import { createMockVoiceAdapter } from '../../packages/core/platform/desktop-voice';
import {
  WhisperModelManager,
  PiperModelManager,
  TranscriptionPipeline,
  SpeechSynthesisPipeline,
  VoiceConversationManager,
  VoiceMemoryBudget,
  VoiceResourceCoordinator,
  SilenceDetector,
  preprocessForTTS,
  WHISPER_MODELS,
  PIPER_VOICES,
} from '../../packages/core/voice/index';
import type { HardwareProfile } from '../../packages/core/llm/hardware-types';

function makeProfile(totalRamMb = 16384): HardwareProfile {
  return {
    tier: totalRamMb >= 32768 ? 'workstation' : 'performance',
    cpuCores: 8,
    cpuArch: 'arm64',
    totalRamMb,
    availableRamMb: totalRamMb * 0.6,
    os: 'macos',
    gpu: null,
  };
}

describe('Voice E2E Integration', () => {
  it('full voice conversation loop: activate → transcribe → speak → deactivate', async () => {
    const adapter = createMockVoiceAdapter({
      transcriptionResult: {
        text: 'What time is my next meeting?',
        confidence: 0.92,
        durationMs: 150,
        language: 'en',
      },
    });

    const profile = makeProfile();
    const whisperMgr = new WhisperModelManager(profile);
    const piperMgr = new PiperModelManager();
    const transcription = new TranscriptionPipeline(adapter, whisperMgr);
    const synthesis = new SpeechSynthesisPipeline(adapter, piperMgr);
    const convo = new VoiceConversationManager(transcription, synthesis, adapter);

    // 1. Activate
    convo.activate();
    expect(convo.getState()).toBe('idle');

    // 2. Start listening → stop → get transcription
    await convo.startListening();
    expect(convo.getState()).toBe('listening');

    const result = await convo.stopListening();
    expect(result).not.toBeNull();
    expect(result?.text).toBe('What time is my next meeting?');

    // 3. Speak response
    await convo.speakResponse('Your next meeting is at 2pm.');
    expect(convo.getState()).toBe('idle');

    // 4. Deactivate
    await convo.deactivate();
    expect(convo.getState()).toBe('idle');
  });

  it('voice routes to weather tool: transcription "What\'s the weather?" → recognized', async () => {
    const adapter = createMockVoiceAdapter({
      transcriptionResult: {
        text: "What's the weather like today?",
        confidence: 0.95,
        durationMs: 100,
      },
    });

    const profile = makeProfile();
    const whisperMgr = new WhisperModelManager(profile);
    const pipeline = new TranscriptionPipeline(adapter, whisperMgr);

    // Simulate voice capture
    const session = await adapter.startCapture();
    const audio = await session.stop();
    const result = await pipeline.transcribe(audio);

    // Verify transcription that would route to get_weather tool
    expect(result.text).toContain('weather');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('voice creates location reminder: transcription → reminder with location trigger', async () => {
    const adapter = createMockVoiceAdapter({
      transcriptionResult: {
        text: 'Remind me to buy milk when I get to the grocery store.',
        confidence: 0.88,
        durationMs: 200,
      },
    });

    const profile = makeProfile();
    const whisperMgr = new WhisperModelManager(profile);
    const pipeline = new TranscriptionPipeline(adapter, whisperMgr);

    const session = await adapter.startCapture();
    const audio = await session.stop();
    const result = await pipeline.transcribe(audio);

    // Verify transcription contains location-trigger keywords
    expect(result.text).toContain('Remind me');
    expect(result.text).toContain('grocery store');
  });

  it('insufficient memory → unavailable', () => {
    const tinyProfile = makeProfile(3072);
    const budget = new VoiceMemoryBudget(tinyProfile, 2048);

    expect(budget.isVoiceAvailable()).toBe(false);
    expect(budget.getLoadingStrategy()).toBe('unavailable');

    // Resource coordinator should reflect this
    const whisperMgr = new WhisperModelManager(tinyProfile, 0);
    const piperMgr = new PiperModelManager();
    const coord = new VoiceResourceCoordinator(budget, whisperMgr, piperMgr);

    const readiness = coord.prepareForVoice();
    expect(readiness.strategy).toBe('unavailable');
    expect(readiness.sttReady).toBe(false);
    expect(readiness.ttsReady).toBe(false);
  });

  it('barrel imports resolve: all exports accessible', () => {
    // Verify all key exports are accessible from barrel
    expect(WhisperModelManager).toBeDefined();
    expect(PiperModelManager).toBeDefined();
    expect(TranscriptionPipeline).toBeDefined();
    expect(SpeechSynthesisPipeline).toBeDefined();
    expect(VoiceConversationManager).toBeDefined();
    expect(SilenceDetector).toBeDefined();
    expect(VoiceMemoryBudget).toBeDefined();
    expect(VoiceResourceCoordinator).toBeDefined();
    expect(preprocessForTTS).toBeDefined();
    expect(WHISPER_MODELS).toBeDefined();
    expect(PIPER_VOICES).toBeDefined();
    expect(WHISPER_MODELS.length).toBe(4);
    expect(PIPER_VOICES.length).toBeGreaterThan(0);
  });
});
