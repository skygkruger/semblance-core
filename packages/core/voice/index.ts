// Voice module barrel export.
// Local-only voice interaction: STT via Whisper.cpp, TTS via Piper.
//
// CRITICAL: No network imports. All voice processing is local.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

export { WhisperModelManager, WHISPER_MODELS } from './whisper-model-manager.js';
export type { WhisperModelEntry } from './whisper-model-manager.js';

export { PiperModelManager, PIPER_VOICES } from './piper-model-manager.js';
export type { PiperVoiceEntry } from './piper-model-manager.js';

export { TranscriptionPipeline } from './transcription-pipeline.js';
export type { TranscriptionPipelineOptions } from './transcription-pipeline.js';

export { SpeechSynthesisPipeline } from './speech-synthesis-pipeline.js';
export type { SpeakResult } from './speech-synthesis-pipeline.js';

export { VoiceConversationManager } from './voice-conversation-manager.js';
export type { VoiceConversationState, StateChangeCallback, TranscriptionCallback } from './voice-conversation-manager.js';

export { SilenceDetector } from './silence-detector.js';
export type { SilenceDetectorOptions } from './silence-detector.js';

export { VoiceMemoryBudget } from './voice-memory-budget.js';
export type { VoiceLoadingStrategy } from './voice-memory-budget.js';

export { VoiceResourceCoordinator } from './voice-resource-coordinator.js';
export type { VoiceReadiness } from './voice-resource-coordinator.js';

export { resampleAudio, stereoToMono, normalizeAudio } from './audio-resampler.js';

export {
  splitIntoSentences,
  expandAbbreviations,
  expandNumbers,
  stripMarkdown,
  stripEmoji,
  preprocessForTTS,
} from './tts-preprocessor.js';
