// VoiceConversationManager Tests — State machine and conversation flow.

import { describe, it, expect, vi } from 'vitest';
import { VoiceConversationManager } from '../../../packages/core/voice/voice-conversation-manager';
import { TranscriptionPipeline } from '../../../packages/core/voice/transcription-pipeline';
import { SpeechSynthesisPipeline } from '../../../packages/core/voice/speech-synthesis-pipeline';
import { WhisperModelManager } from '../../../packages/core/voice/whisper-model-manager';
import { PiperModelManager } from '../../../packages/core/voice/piper-model-manager';
import { createMockVoiceAdapter } from '../../../packages/core/platform/desktop-voice';
import type { HardwareProfile } from '../../../packages/core/llm/hardware-types';

function makeProfile(): HardwareProfile {
  return {
    tier: 'performance',
    cpuCores: 8,
    cpuArch: 'arm64',
    totalRamMb: 16384,
    availableRamMb: 10000,
    os: 'macos',
    gpu: null,
  };
}

function createManager() {
  const adapter = createMockVoiceAdapter({
    transcriptionResult: { text: 'Test input', confidence: 0.9, durationMs: 100 },
  });
  const whisperMgr = new WhisperModelManager(makeProfile());
  const piperMgr = new PiperModelManager();
  const transcription = new TranscriptionPipeline(adapter, whisperMgr);
  const synthesis = new SpeechSynthesisPipeline(adapter, piperMgr);

  return new VoiceConversationManager(transcription, synthesis, adapter);
}

describe('VoiceConversationManager', () => {
  it('activate sets state to idle', () => {
    const mgr = createManager();
    expect(mgr.getState()).toBe('idle');

    mgr.activate();
    expect(mgr.getState()).toBe('idle');
  });

  it('startListening → stopListening → transcription result', async () => {
    const mgr = createManager();
    mgr.activate();

    await mgr.startListening();
    expect(mgr.getState()).toBe('listening');

    const result = await mgr.stopListening();
    expect(result).not.toBeNull();
    expect(result?.text).toBe('Test input');
    expect(mgr.getState()).toBe('idle');
  });

  it('speakResponse triggers TTS', async () => {
    const mgr = createManager();
    mgr.activate();

    await mgr.speakResponse('Hello!');
    expect(mgr.getState()).toBe('idle');
  });

  it('deactivate releases resources, state idle', async () => {
    const mgr = createManager();
    mgr.activate();

    await mgr.deactivate();
    expect(mgr.getState()).toBe('idle');
  });

  it('state change callback fires on transitions', async () => {
    const mgr = createManager();
    const states: string[] = [];
    mgr.onStateChange((s) => states.push(s));

    mgr.activate(); // idle
    await mgr.startListening(); // listening
    await mgr.stopListening(); // processing → idle

    expect(states).toContain('idle');
    expect(states).toContain('listening');
    expect(states).toContain('processing');
  });
});
