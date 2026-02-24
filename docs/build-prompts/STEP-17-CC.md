# Step 17 — Voice Interaction (Whisper.cpp STT + Piper TTS)

## Implementation Prompt for Claude Code

**Date:** February 22, 2026
**Context:** Steps 1–16 complete. Step 16 delivered Location + Weather + Contextual Awareness with 77 new tests. Sprint 4 continues — "Becomes Part of You." This step adds voice: local speech-to-text via Whisper.cpp, local text-to-speech via Piper, and a voice conversation mode that works with every existing capability. Audio data never leaves the device.
**Test Baseline:** 2,956 tests passing across ~190 files. Privacy audit clean. TypeScript compilation clean (`npx tsc --noEmit` → EXIT_CODE=0).
**Risk Level:** HIGHEST IN SPRINT 4. Whisper.cpp + primary LLM coexistence requires careful memory management. Piper TTS quality on local hardware needs validation. Voice models on mobile alongside the primary model may cause OOM on constrained devices. Build defensively.
**Rule:** ZERO stubs, ZERO placeholders, ZERO deferrals. Every deliverable ships production-ready. Platform-deferred adapters (Tauri audio capture, React Native native modules, actual Whisper/Piper binary integration) are acceptable with functional mocks and honest TODO labels.

---

## Read First

Before writing any code, read these files:

- `/CLAUDE.md` — Architecture rules, boundary rules, 5 inviolable rules, code quality standards
- `/docs/DESIGN_SYSTEM.md` — All UI must conform to Trellis design system
- `packages/core/platform/types.ts` — PlatformAdapter interface (VoiceAdapter will be added here)
- `packages/core/agent/orchestrator.ts` — Where voice input feeds into the existing chat/tool pipeline
- `packages/core/agent/proactive-engine.ts` — ProactiveInsight type union (voice notification integration)
- `packages/core/agent/types.ts` — AutonomyDomain union (voice domain to be added)
- `packages/core/agent/autonomy.ts` — ACTION_DOMAIN_MAP + ACTION_RISK_MAP (voice actions to be added)
- `packages/core/types/ipc.ts` — ActionType enum + payload schemas (voice action types)
- `packages/core/llm/inference-router.ts` — InferenceRouter (Whisper.cpp runs through similar infrastructure)
- `packages/core/llm/hardware-profile.ts` — Hardware detection + profile classification (memory budgeting)
- `packages/core/platform/desktop-location.ts` — Reference for desktop adapter factory pattern (Step 16)
- `packages/mobile/src/native/location-bridge.ts` — Reference for mobile bridge pattern (Step 16)
- `tests/privacy/location-privacy.test.ts` — Reference for privacy test pattern (Step 16)

---

## Why This Step Matters — The Moat Argument

Voice is the interface that makes Semblance disappear into your life.

Every other interaction mode — chat, inbox, notifications — requires the user to look at a screen. Voice lets the user talk to Semblance while driving, cooking, walking, exercising. "What's on my schedule today?" "Draft a reply to Sarah saying I'll be 10 minutes late." "Set a reminder to buy groceries when I'm near Safeway." All spoken. All processed locally. All responded to aloud.

Cloud AI assistants have voice — but their voice goes to a server. Every word you speak to Siri, Alexa, or Google Assistant is transmitted, processed remotely, and stored. Users know this. They self-censor. They don't ask their assistant to draft sensitive emails or discuss medical concerns or check their financial status — because they know someone might be listening.

Semblance's voice never leaves the device. Whisper.cpp runs locally. Piper TTS runs locally. The audio buffer exists in memory for the duration of processing and is then discarded. No cloud API. No audio storage. No transcription logs beyond the chat message the user intended to send.

This means Semblance gets the queries that cloud assistants don't. The sensitive ones. The personal ones. The ones that actually matter. And every one of those queries feeds the knowledge graph, making Semblance smarter about the user's life in ways that cloud AI can never match.

Voice is also the highest-risk step in Sprint 4. Whisper.cpp on mobile requires running TWO models simultaneously (Whisper for STT + primary LLM for reasoning). Memory management must be precise. The architecture must handle graceful degradation when hardware can't support both models at once. Build this defensively — a user who can't use voice should still have a flawless text experience.

---

## Scope Overview

| Section | Description | Test Target |
|---------|-------------|-------------|
| A | VoiceAdapter on PlatformAdapter — STT, TTS, Audio Capture | 8+ |
| B | Whisper.cpp STT Integration — Model Management, Transcription Pipeline | 12+ |
| C | Piper TTS Integration — Model Management, Speech Synthesis | 10+ |
| D | Voice Conversation Mode — End-to-End Flow, UI | 10+ |
| E | Memory Management + Hardware Budgeting | 8+ |
| F | Autonomy + Privacy + Orchestrator Wiring | 10+ |
| G | Privacy Audit + UI | 7+ |

**Minimum 65 new tests. Target 70+.**

---

## Section A: VoiceAdapter on PlatformAdapter

### A1: VoiceAdapter Interface

Create `packages/core/platform/voice-types.ts`:

```typescript
// Voice types — all audio processing local-only, no cloud speech APIs

export interface VoiceAdapter {
  /** Check if microphone permission has been granted */
  hasMicrophonePermission(): Promise<boolean>;

  /** Request microphone permission from the OS. Returns whether granted. */
  requestMicrophonePermission(): Promise<boolean>;

  /** Check if STT model is loaded and ready */
  isSTTReady(): Promise<boolean>;

  /** Check if TTS model is loaded and ready */
  isTTSReady(): Promise<boolean>;

  /**
   * Start audio capture from microphone.
   * Returns an AudioSession that accumulates audio data.
   * Caller is responsible for calling session.stop() to end capture.
   */
  startCapture(): Promise<AudioSession>;

  /**
   * Transcribe audio data to text using Whisper.cpp.
   * Accepts raw audio (PCM 16kHz mono) or the AudioSession from capture.
   * Returns transcription result with timing and confidence.
   */
  transcribe(audio: AudioData): Promise<TranscriptionResult>;

  /**
   * Synthesize text to speech using Piper TTS.
   * Returns audio data that can be played back.
   */
  synthesize(text: string, options?: TTSOptions): Promise<AudioData>;

  /**
   * Play audio data through the device speaker/headphones.
   * Returns a promise that resolves when playback completes.
   */
  playAudio(audio: AudioData): Promise<void>;

  /**
   * Stop any currently playing audio.
   */
  stopPlayback(): Promise<void>;

  /**
   * Get available TTS voices.
   */
  getAvailableVoices(): Promise<VoiceInfo[]>;

  /**
   * Release STT/TTS model resources to free memory.
   * Called when voice mode is deactivated or on memory pressure.
   */
  releaseModels(): Promise<void>;
}

export interface AudioSession {
  /** Stop recording and return captured audio */
  stop(): Promise<AudioData>;

  /** Cancel recording without returning data (discard audio) */
  cancel(): Promise<void>;

  /** Whether recording is currently active */
  isRecording(): boolean;

  /** Duration of recording so far in milliseconds */
  durationMs(): number;
}

export interface AudioData {
  /** Raw PCM audio data (16-bit, 16kHz, mono for STT input) */
  pcmData: Float32Array;

  /** Sample rate in Hz */
  sampleRate: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Audio format metadata */
  format: AudioFormat;
}

export interface AudioFormat {
  channels: 1 | 2;
  sampleRate: number;
  bitDepth: 16 | 32;
}

export interface TranscriptionResult {
  text: string;
  confidence: number; // 0-1
  durationMs: number; // Processing time
  language?: string; // Detected language
  segments?: TranscriptionSegment[]; // Word-level timing if available
}

export interface TranscriptionSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface TTSOptions {
  voiceId?: string;
  speed?: number; // 0.5-2.0, default 1.0
  pitch?: number; // 0.5-2.0, default 1.0
}

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
  sampleAudioAvailable: boolean;
}
```

### A2: PlatformAdapter Extension

Add to `packages/core/platform/types.ts`:

```typescript
// Add to PlatformAdapter interface (alongside existing location?, weather?)
voice?: import('./voice-types.js').VoiceAdapter;
```

### A3: Desktop Adapter Factory

Create `packages/core/platform/desktop-voice.ts`:

- **Dev/test mode:** Mock adapter that returns configurable transcription results and generates silence for TTS. `startCapture()` returns a mock AudioSession that resolves immediately with empty audio. `transcribe()` returns a configurable text result. `synthesize()` returns empty audio data.
- **Tauri runtime:** Delegates to native Rust-side audio capture (via `@tauri-apps/plugin-*` or custom Tauri command) + Whisper.cpp and Piper binaries. Mark with `// TODO(Sprint 4): Wire up Tauri audio capture + Whisper.cpp binary` and `// TODO(Sprint 4): Wire up Piper TTS binary`.

### A4: Mobile Bridges

Create `packages/mobile/src/native/voice-bridge.ts`:

- **iOS:** React Native Audio API for capture. Whisper.cpp via native module (Swift/Obj-C bridge to whisper.cpp C library). Piper via native module. `// TODO(Sprint 4): Wire up iOS native Whisper.cpp module` and `// TODO(Sprint 4): Wire up iOS native Piper TTS module`.
- **Android:** React Native Audio API for capture. Whisper.cpp via JNI bridge (same pattern as llama.cpp). Piper via JNI. `// TODO(Sprint 4): Wire up Android JNI Whisper.cpp module` and `// TODO(Sprint 4): Wire up Android JNI Piper TTS module`.
- Follow the pattern from `packages/mobile/src/native/location-bridge.ts`.

**Tests (8+):** `tests/core/voice/voice-adapter.test.ts`
- Mock adapter returns correct types for all VoiceAdapter methods
- `startCapture()` returns AudioSession with `stop()` and `cancel()`
- `stop()` returns AudioData with correct format
- `cancel()` discards audio without returning data
- `transcribe()` returns TranscriptionResult with text and confidence
- `synthesize()` returns AudioData
- Permission denied → `startCapture()` throws with clear error
- `releaseModels()` completes without error
- `getAvailableVoices()` returns VoiceInfo array

---

## Section B: Whisper.cpp STT Integration

### B1: WhisperModelManager

Create `packages/core/voice/whisper-model-manager.ts`:

```typescript
/**
 * Manages Whisper.cpp model lifecycle: selection, download, loading, unloading.
 *
 * Model selection follows hardware profile:
 * - High-end (≥16GB RAM): whisper-large-v3 (GGUF, ~1.5GB) — best accuracy
 * - Mid-range (8-16GB RAM): whisper-medium (GGUF, ~750MB) — good balance
 * - Constrained (4-8GB RAM): whisper-base (GGUF, ~140MB) — fast, adequate
 * - Very constrained (<4GB RAM): whisper-tiny (GGUF, ~75MB) — fast, lower accuracy
 *
 * Mobile defaults:
 * - iOS (6GB+ RAM): whisper-base — balance of speed and accuracy for mobile
 * - iOS (<6GB RAM): whisper-tiny
 * - Android: whisper-tiny (most constrained)
 *
 * The model registry from Step 9 (packages/core/llm/model-registry.ts) is
 * extended to include Whisper models. Same download/progress/verification pattern.
 *
 * CRITICAL: Whisper model loading must be coordinated with the primary LLM
 * to avoid OOM. See Section E for memory budgeting.
 */
export class WhisperModelManager {
  constructor(
    private modelRegistry: ModelRegistry,
    private hardwareProfile: HardwareProfile,
    private memoryBudget: VoiceMemoryBudget
  ) {}

  /** Select appropriate Whisper model for current hardware */
  selectModel(): WhisperModelInfo;

  /** Download the selected Whisper model (reuses model registry download pipeline) */
  async downloadModel(onProgress: (progress: DownloadProgress) => void): Promise<void>;

  /** Load model into memory. Checks memory budget first. */
  async loadModel(): Promise<void>;

  /** Unload model to free memory */
  async unloadModel(): Promise<void>;

  /** Whether model is currently loaded */
  isLoaded(): boolean;

  /** Get currently loaded model info */
  getLoadedModel(): WhisperModelInfo | null;
}

export interface WhisperModelInfo {
  id: string; // e.g., 'whisper-base-gguf'
  name: string; // e.g., 'Whisper Base'
  sizeBytes: number;
  memoryRequiredMB: number;
  expectedAccuracy: 'high' | 'medium' | 'adequate' | 'basic';
  languages: string[];
}
```

### B2: TranscriptionPipeline

Create `packages/core/voice/transcription-pipeline.ts`:

```typescript
/**
 * Orchestrates the STT process:
 * 1. Receive audio data (from AudioSession or direct input)
 * 2. Validate audio format (must be 16kHz mono PCM)
 * 3. Resample if needed (audio capture might be at different sample rate)
 * 4. Run through Whisper.cpp via VoiceAdapter.transcribe()
 * 5. Post-process: trim whitespace, normalize punctuation
 * 6. Return TranscriptionResult
 *
 * The pipeline handles the case where Whisper is not loaded:
 * - If model not loaded and memory budget allows: load model, transcribe, keep loaded
 * - If model not loaded and memory budget tight: load model, transcribe, unload
 * - If model cannot load (OOM): return error with clear message
 *
 * Audio data is EPHEMERAL — exists in memory during processing only.
 * After transcription completes, the audio buffer is released.
 * No audio is ever written to disk or stored in any persistent form.
 */
export class TranscriptionPipeline {
  constructor(
    private voiceAdapter: VoiceAdapter,
    private modelManager: WhisperModelManager
  ) {}

  /** Transcribe audio, handling model loading/unloading */
  async transcribe(audio: AudioData): Promise<TranscriptionResult>;

  /** Resample audio to 16kHz mono if needed */
  resampleAudio(audio: AudioData, targetSampleRate: number): AudioData;

  /** Validate audio format for Whisper input */
  validateAudioFormat(audio: AudioData): boolean;
}
```

### B3: Audio Resampler

Create `packages/core/voice/audio-resampler.ts`:

```typescript
/**
 * Pure TypeScript audio resampler.
 * Converts between sample rates (e.g., 44.1kHz → 16kHz for Whisper).
 * Uses linear interpolation — sufficient quality for speech.
 * No external dependencies.
 */
export function resampleAudio(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array;

/** Convert stereo to mono by averaging channels */
export function stereoToMono(stereoData: Float32Array): Float32Array;

/** Normalize audio to -1.0 to 1.0 range */
export function normalizeAudio(data: Float32Array): Float32Array;
```

**Tests (12+):** `tests/core/voice/whisper-model-manager.test.ts` (5) + `tests/core/voice/transcription-pipeline.test.ts` (4) + `tests/core/voice/audio-resampler.test.ts` (3)
- Model selection: high-end hardware → whisper-large-v3
- Model selection: constrained hardware → whisper-tiny
- Model selection: mobile iOS → whisper-base
- `loadModel()` checks memory budget before loading
- `unloadModel()` frees memory (isLoaded returns false)
- Pipeline: valid audio → TranscriptionResult with text
- Pipeline: model not loaded → auto-loads → transcribes
- Pipeline: invalid audio format → validation error
- Pipeline: audio buffer released after transcription (no persistent storage)
- Resampler: 44100Hz → 16000Hz produces correct output length
- `stereoToMono`: stereo input → mono output half the length
- `normalizeAudio`: output values within [-1.0, 1.0]

---

## Section C: Piper TTS Integration

### C1: PiperModelManager

Create `packages/core/voice/piper-model-manager.ts`:

```typescript
/**
 * Manages Piper TTS model lifecycle.
 *
 * Piper uses ONNX voice models. Each voice is ~15-60MB.
 * Default voice: en_US-amy-medium (~30MB) — clear, natural female voice.
 * Additional voices downloadable from Settings.
 *
 * Model registry extension (same pattern as Whisper):
 * - Model download with progress tracking
 * - Voice metadata (language, gender, quality tier)
 * - Voice preview capability (short sample synthesis)
 *
 * Memory impact is lower than Whisper — Piper ONNX models are small.
 * Can typically stay loaded alongside primary LLM and Whisper.
 */
export class PiperModelManager {
  constructor(
    private modelRegistry: ModelRegistry,
    private hardwareProfile: HardwareProfile
  ) {}

  /** Get default voice for the user's locale */
  getDefaultVoice(): PiperVoiceInfo;

  /** List all available voices (downloaded + downloadable) */
  async listVoices(): Promise<PiperVoiceInfo[]>;

  /** Download a voice model */
  async downloadVoice(voiceId: string, onProgress: (progress: DownloadProgress) => void): Promise<void>;

  /** Load a voice model */
  async loadVoice(voiceId: string): Promise<void>;

  /** Unload current voice to free memory */
  async unloadVoice(): Promise<void>;

  /** Whether a voice is currently loaded */
  isLoaded(): boolean;

  /** Get currently loaded voice info */
  getLoadedVoice(): PiperVoiceInfo | null;
}

export interface PiperVoiceInfo {
  id: string; // e.g., 'en_US-amy-medium'
  name: string; // e.g., 'Amy (US English)'
  language: string;
  gender: 'male' | 'female' | 'neutral';
  quality: 'low' | 'medium' | 'high';
  sizeBytes: number;
  downloaded: boolean;
}
```

### C2: SpeechSynthesisPipeline

Create `packages/core/voice/speech-synthesis-pipeline.ts`:

```typescript
/**
 * Orchestrates the TTS process:
 * 1. Receive text to speak
 * 2. Pre-process: split into sentences for natural pacing, handle numbers/abbreviations
 * 3. Run through Piper via VoiceAdapter.synthesize()
 * 4. Post-process: normalize volume
 * 5. Play through device speaker via VoiceAdapter.playAudio()
 *
 * Supports:
 * - Interruptible playback (user taps to stop, or starts speaking over)
 * - Configurable speed and pitch
 * - Sentence-level streaming: start playing first sentence while synthesizing the rest
 *
 * Audio output is EPHEMERAL — synthesized audio exists in memory during playback only.
 * No audio is written to disk.
 */
export class SpeechSynthesisPipeline {
  constructor(
    private voiceAdapter: VoiceAdapter,
    private modelManager: PiperModelManager
  ) {}

  /** Synthesize and play text. Returns when playback completes or is interrupted. */
  async speak(text: string, options?: TTSOptions): Promise<SpeakResult>;

  /** Stop current speech immediately */
  async stop(): Promise<void>;

  /** Whether speech is currently playing */
  isSpeaking(): boolean;

  /** Pre-process text for natural TTS output */
  preprocessText(text: string): string[];
}

export interface SpeakResult {
  completed: boolean; // false if interrupted
  durationMs: number; // How long playback lasted
  textSpoken: string; // What was actually spoken (may be partial if interrupted)
}
```

### C3: Text Preprocessor for TTS

Create `packages/core/voice/tts-preprocessor.ts`:

```typescript
/**
 * Preprocesses text for more natural TTS output.
 *
 * - Splits into sentences (for streaming synthesis)
 * - Expands abbreviations: "Dr." → "Doctor", "St." → "Street" or "Saint"
 * - Expands numbers: "3pm" → "3 PM", "$14.99" → "14 dollars and 99 cents"
 * - Handles time formats: "1:15pm" → "1 15 PM"
 * - Strips markdown formatting (bold, italic, links)
 * - Removes emoji (TTS can't pronounce them)
 * - Normalizes whitespace
 *
 * Pure functions, no state.
 */
export function splitIntoSentences(text: string): string[];
export function expandAbbreviations(text: string): string;
export function expandNumbers(text: string): string;
export function stripMarkdown(text: string): string;
export function stripEmoji(text: string): string;
export function preprocessForTTS(text: string): string[];
```

**Tests (10+):** `tests/core/voice/piper-model-manager.test.ts` (4) + `tests/core/voice/speech-synthesis-pipeline.test.ts` (3) + `tests/core/voice/tts-preprocessor.test.ts` (3)
- Default voice selection returns en_US voice
- `downloadVoice()` tracks progress
- `loadVoice()` + `isLoaded()` returns true
- `unloadVoice()` frees resources
- `speak()` calls synthesize + playAudio
- `stop()` interrupts playback, SpeakResult.completed = false
- `isSpeaking()` reflects current state
- `splitIntoSentences`: "Hello. How are you?" → ["Hello.", "How are you?"]
- `expandNumbers`: "$14.99" → "14 dollars and 99 cents"
- `stripMarkdown`: "**bold** text" → "bold text"
- `stripEmoji`: "Hello 👋" → "Hello"

---

## Section D: Voice Conversation Mode

### D1: VoiceConversationManager

Create `packages/core/voice/voice-conversation-manager.ts`:

```typescript
/**
 * Manages the full voice conversation loop:
 *
 * 1. User activates voice mode (tap mic button)
 * 2. Audio capture starts
 * 3. User speaks, then pauses (silence detection) or taps stop
 * 4. Audio sent to TranscriptionPipeline → text
 * 5. Text sent to Orchestrator (same pipeline as typed chat messages)
 * 6. Response text sent to SpeechSynthesisPipeline → spoken aloud
 * 7. Loop: wait for next voice input or user deactivates
 *
 * States:
 * - idle: voice mode not active
 * - listening: microphone active, capturing audio
 * - processing: transcribing audio to text
 * - thinking: Orchestrator processing the query
 * - speaking: TTS playing the response
 * - error: something went wrong (with recovery path)
 *
 * Silence detection:
 * - Monitor audio amplitude during capture
 * - If amplitude below threshold for 1.5 seconds, auto-stop capture
 * - User can also manually tap to stop
 *
 * Barge-in:
 * - If user starts speaking while TTS is playing, stop TTS and start new capture
 * - This makes conversation feel natural
 *
 * The conversation manager does NOT bypass the Orchestrator.
 * Voice input is just another way to enter text into the same pipeline.
 * All tools, autonomy checks, and audit trail entries work identically.
 */
export class VoiceConversationManager {
  constructor(
    private transcriptionPipeline: TranscriptionPipeline,
    private synthesisPipeline: SpeechSynthesisPipeline,
    private orchestrator: Orchestrator,
    private voiceAdapter: VoiceAdapter
  ) {}

  /** Start voice conversation mode */
  async activate(): Promise<void>;

  /** Stop voice conversation mode, release resources */
  async deactivate(): Promise<void>;

  /** Start listening (begin audio capture) */
  async startListening(): Promise<void>;

  /** Stop listening manually (alternative to silence detection) */
  async stopListening(): Promise<void>;

  /** Get current state */
  getState(): VoiceState;

  /** Register state change listener */
  onStateChange(callback: (state: VoiceState) => void): () => void;

  /** Register transcription listener (for showing text as it's transcribed) */
  onTranscription(callback: (result: TranscriptionResult) => void): () => void;
}

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'thinking'
  | 'speaking'
  | 'error';

export interface VoiceConversationEvent {
  type: 'state-change' | 'transcription' | 'response' | 'error';
  state?: VoiceState;
  transcription?: TranscriptionResult;
  response?: string;
  error?: string;
}
```

### D2: SilenceDetector

Create `packages/core/voice/silence-detector.ts`:

```typescript
/**
 * Detects silence in audio stream to auto-stop recording.
 *
 * Monitors RMS amplitude of audio chunks.
 * When amplitude drops below threshold for silenceDurationMs,
 * triggers the silence callback.
 *
 * Thresholds are configurable:
 * - silenceThreshold: 0.01 (RMS amplitude, 0-1 scale)
 * - silenceDurationMs: 1500 (how long silence must persist)
 * - minRecordingMs: 500 (minimum recording before silence detection kicks in)
 *
 * Pure computation — no audio capture, no platform dependencies.
 */
export class SilenceDetector {
  constructor(options?: SilenceDetectorOptions) {}

  /** Feed an audio chunk. Returns true if silence detected. */
  processChunk(chunk: Float32Array): boolean;

  /** Reset state (for new recording) */
  reset(): void;

  /** Calculate RMS amplitude of audio chunk */
  static calculateRMS(chunk: Float32Array): number;
}

export interface SilenceDetectorOptions {
  silenceThreshold?: number; // Default: 0.01
  silenceDurationMs?: number; // Default: 1500
  minRecordingMs?: number; // Default: 500
  chunkDurationMs?: number; // Duration of each processed chunk. Default: 100
}
```

### D3: Voice UI — Desktop

Create `packages/desktop/src/components/VoiceButton.tsx`:

```typescript
/**
 * Floating mic button for voice activation.
 * States map to VoiceState:
 * - idle: mic icon, neutral color
 * - listening: pulsing animation, Semblance Blue, audio waveform visualization
 * - processing: spinner, "Transcribing..."
 * - thinking: spinner, "Thinking..."
 * - speaking: speaker icon, audio wave animation
 * - error: red flash, error message, tap to retry
 *
 * Position: bottom-right of chat area (above text input).
 * Keyboard shortcut: Ctrl+Shift+V (configurable in Settings).
 *
 * Accessibility: aria-label changes with state,
 * screen reader announces state transitions.
 */
```

Create `packages/desktop/src/components/VoiceWaveform.tsx`:

```typescript
/**
 * Real-time audio waveform visualization during recording.
 * Shows amplitude bars that respond to mic input.
 * Purely decorative — helps user know recording is active.
 * Uses requestAnimationFrame for smooth animation.
 * Trellis design system: Semblance Blue bars on transparent background.
 */
```

### D4: Voice UI — Mobile

Create `packages/mobile/src/components/VoiceModeOverlay.tsx`:

```typescript
/**
 * Full-screen overlay for voice conversation on mobile.
 * Mobile-first design — big tap targets, clear state indicators.
 *
 * Layout:
 * - Top: transcription text (live, updates as user speaks)
 * - Center: large pulsing circle (listening), spinner (processing), wave (speaking)
 * - Bottom: large cancel button
 *
 * Gesture: tap anywhere to start listening, tap again to stop.
 * Swipe down to dismiss voice mode.
 *
 * Haptic feedback on state transitions (matches clipboard pattern from Step 15).
 */
```

**Tests (10+):** `tests/core/voice/voice-conversation-manager.test.ts` (5) + `tests/core/voice/silence-detector.test.ts` (3) + `tests/desktop/voice-button.test.ts` (2)
- Activate → state becomes 'listening' or 'idle' (depending on auto-listen setting)
- startListening → stopListening → transcription result returned
- Response from Orchestrator triggers TTS speak
- Deactivate releases resources, state returns to 'idle'
- State change callback fires on each transition
- SilenceDetector: loud audio → processChunk returns false
- SilenceDetector: silence for 1.5s → processChunk returns true
- SilenceDetector: silence before minRecordingMs → does not trigger
- calculateRMS: known sine wave → expected amplitude
- VoiceButton renders with correct aria-label per state
- VoiceButton click triggers startListening

---

## Section E: Memory Management + Hardware Budgeting

### E1: VoiceMemoryBudget

Create `packages/core/voice/voice-memory-budget.ts`:

```typescript
/**
 * Manages memory allocation for voice models alongside the primary LLM.
 *
 * The fundamental constraint: the device has a fixed amount of RAM.
 * The primary LLM is already using a significant portion.
 * Whisper and Piper need additional memory.
 *
 * Memory budget calculation:
 * 1. Get total device RAM from HardwareProfile
 * 2. Subtract OS overhead (~2GB)
 * 3. Subtract primary LLM model memory (from InferenceRouter)
 * 4. Subtract embedding model memory (~300MB)
 * 5. Remaining = available for voice models
 *
 * Whisper model sizes:
 * - whisper-tiny: ~75MB loaded
 * - whisper-base: ~140MB loaded
 * - whisper-medium: ~750MB loaded
 * - whisper-large-v3: ~1.5GB loaded
 *
 * Piper voice sizes: ~15-60MB loaded
 *
 * Strategy:
 * - If available memory > Whisper + Piper: keep both loaded (best UX)
 * - If available memory > Whisper only: load Whisper on-demand, load Piper on-demand
 *   (load one, unload before loading the other)
 * - If available memory < smallest Whisper: voice mode unavailable on this device
 *
 * On mobile:
 * - Much tighter budgets. whisper-tiny may be the only option.
 * - Consider on-demand loading: load Whisper for STT, unload, load Piper for TTS,
 *   unload. Adds latency but prevents OOM.
 *
 * CRITICAL: This budget must be checked BEFORE loading any voice model.
 * OOM crashes are unacceptable. Graceful degradation is mandatory.
 */
export class VoiceMemoryBudget {
  constructor(
    private hardwareProfile: HardwareProfile,
    private inferenceRouter: InferenceRouter
  ) {}

  /** Calculate available memory for voice models */
  getAvailableMemoryMB(): number;

  /** Can we load this Whisper model without OOM risk? */
  canLoadWhisper(model: WhisperModelInfo): boolean;

  /** Can we load Whisper AND Piper simultaneously? */
  canLoadBothModels(whisper: WhisperModelInfo, piper: PiperVoiceInfo): boolean;

  /** Get recommended loading strategy */
  getLoadingStrategy(): VoiceLoadingStrategy;

  /** Whether voice is available on this hardware at all */
  isVoiceAvailable(): boolean;
}

export type VoiceLoadingStrategy =
  | 'both-persistent' // Both models stay loaded (best UX)
  | 'on-demand' // Load/unload as needed (adds latency)
  | 'stt-only' // Only STT available, no TTS (very constrained)
  | 'unavailable'; // Not enough memory for any voice model
```

### E2: VoiceResourceCoordinator

Create `packages/core/voice/voice-resource-coordinator.ts`:

```typescript
/**
 * Coordinates voice model loading with the primary LLM to prevent OOM.
 *
 * When voice mode activates:
 * 1. Check VoiceMemoryBudget.getLoadingStrategy()
 * 2. If 'on-demand': notify InferenceRouter to release any cached context
 *    (not unload the model — just trim context cache to free some memory)
 * 3. Load Whisper model
 * 4. After transcription: if 'on-demand', may unload Whisper before loading Piper
 * 5. Load Piper, speak response
 * 6. If 'on-demand', unload Piper after speaking
 *
 * When voice mode deactivates:
 * 1. Unload all voice models (if on-demand strategy)
 * 2. Restore InferenceRouter context cache budget
 *
 * Memory pressure handling:
 * If OS signals memory pressure (via platform adapter or system notification),
 * immediately unload voice models and deactivate voice mode with user notification.
 */
export class VoiceResourceCoordinator {
  constructor(
    private memoryBudget: VoiceMemoryBudget,
    private whisperManager: WhisperModelManager,
    private piperManager: PiperModelManager,
    private inferenceRouter: InferenceRouter
  ) {}

  /** Prepare for voice mode — load models according to strategy */
  async prepareForVoice(): Promise<VoiceReadiness>;

  /** Release voice resources */
  async releaseVoiceResources(): Promise<void>;

  /** Handle memory pressure signal from OS */
  async onMemoryPressure(): Promise<void>;
}

export interface VoiceReadiness {
  ready: boolean;
  strategy: VoiceLoadingStrategy;
  sttAvailable: boolean;
  ttsAvailable: boolean;
  reason?: string; // Why voice isn't available, if not ready
}
```

**Tests (8+):** `tests/core/voice/voice-memory-budget.test.ts` (5) + `tests/core/voice/voice-resource-coordinator.test.ts` (3)
- High-end device (16GB): strategy = 'both-persistent'
- Mid-range device (8GB) with 7B model: strategy = 'on-demand'
- Constrained device (4GB): strategy = 'stt-only' or 'on-demand' with whisper-tiny
- Very constrained (<4GB) with model loaded: strategy = 'unavailable'
- `isVoiceAvailable()` returns false when insufficient memory
- `prepareForVoice()` loads models per strategy
- `releaseVoiceResources()` unloads all voice models
- `onMemoryPressure()` immediately unloads voice models

---

## Section F: Autonomy + Privacy + Orchestrator Wiring

### F1: Autonomy Domain Extension

Add `'voice'` domain to the autonomy system. **ALL updates in the SAME commit:**

1. Add `'voice'` to `AutonomyDomain` union in `packages/core/agent/types.ts`
2. Update `ACTION_DOMAIN_MAP` in `packages/core/agent/autonomy.ts`:
   - `'voice.transcribe'` → `'voice'`
   - `'voice.speak'` → `'voice'`
   - `'voice.conversation'` → `'voice'`
3. Update `ACTION_RISK_MAP`:
   - `'voice.transcribe'` → `'read'` (low risk — converting user's speech to text)
   - `'voice.speak'` → `'read'` (low risk — reading response aloud)
   - `'voice.conversation'` → `'read'` (low risk — meta action for voice mode)
4. Update `getConfig()` domains array to include `'voice'`
5. Add time-saved defaults in `packages/gateway/audit/time-saved-defaults.ts`:
   - `'voice.transcribe'` → `30` seconds (saved vs typing)
   - `'voice.speak'` → `15` seconds (saved vs reading)
   - `'voice.conversation'` → `60` seconds (full voice interaction)

Default autonomy for voice domain: **Partner** (voice interactions autonomous, no approval needed for listening/speaking).

### F2: IPC ActionTypes

Add to `packages/core/types/ipc.ts`:
- `'voice.transcribe'` — speech-to-text completed
- `'voice.speak'` — text-to-speech played
- `'voice.conversation'` — voice conversation session (meta event)

Payload schemas for each.

### F3: Orchestrator Integration

Voice input feeds into the Orchestrator as text — the Orchestrator doesn't know or care whether input came from typing or voice. The VoiceConversationManager handles this:

```
User speaks → Whisper STT → text → Orchestrator.processMessage(text) → response → Piper TTS → spoken
```

No changes to Orchestrator's core logic are needed. The Orchestrator already handles text input and returns text output. VoiceConversationManager wraps this.

However, add the voice mode status to the Orchestrator context so the LLM can adapt responses:

- When voice mode is active, inject a system context note: "The user is in voice conversation mode. Keep responses concise and conversational — they will be spoken aloud. Avoid long lists, code blocks, and complex formatting."
- This is a one-line addition to the system prompt context when voice mode is active.

### F4: Privacy — Audio Never Persisted

Create the privacy enforcement:

- **No audio storage:** AudioData exists only in memory. No file I/O for audio.
- **Transcription goes to chat:** The transcribed text becomes a chat message (same as typed input). The chat message IS persisted (this is intentional — it's text, not audio).
- **No voice recording logs:** Audit trail logs `'voice.transcribe'` with the transcribed text length (not content) and processing time. Does NOT log the audio or the full transcription.
- **Model files are the only disk artifact:** Whisper and Piper model files are stored on disk (like the primary LLM). They are model weights, not user data.

### F5: Voice Settings

Add to Settings:
- **Voice section:**
  - Toggle: "Enable voice mode" (default: OFF)
  - Whisper model selection (auto-selected, can override)
  - TTS voice selection (list available voices)
  - TTS speed slider (0.5x–2.0x, default 1.0)
  - "Download voice models" button (triggers model download)
  - Model storage usage indicator
  - Keyboard shortcut configuration (desktop only)
  - Silence detection sensitivity (low/medium/high)

**Tests (10+):** `tests/core/voice/voice-autonomy.test.ts` (3) + `tests/privacy/voice-privacy.test.ts` (4) + `tests/core/voice/voice-settings.test.ts` (3)
- `getConfig()` includes 'voice' domain
- ACTION_DOMAIN_MAP includes all voice action types
- ACTION_RISK_MAP classifies voice actions as 'read'
- Privacy: zero network imports in `packages/core/voice/`
- Privacy: zero Gateway imports in `packages/core/voice/`
- Privacy: no audio file I/O in voice modules (scan for writeFile, createWriteStream, fs.write)
- Privacy: audit trail entries for voice.transcribe do NOT contain transcription text
- Voice settings: default OFF
- Voice settings: model selection reflects hardware profile
- Voice settings: speed slider within 0.5-2.0 range

---

## Section G: Integration + Final Polish

### G1: End-to-End Integration Tests

Create `tests/integration/voice-e2e.test.ts`:

```typescript
describe('Voice E2E', () => {
  // Full voice conversation loop with mocks
  it('voice activate → speak → transcribe → Orchestrator → TTS → deactivate');

  // Voice works with existing features
  it('voice input: "What is the weather today?" → routes to get_weather tool');
  it('voice input: "Remind me to buy milk near Safeway" → creates location-tagged reminder');

  // Graceful degradation
  it('insufficient memory → voice mode shows clear unavailable message');

  // Privacy
  it('no audio data persisted to disk at any point during voice conversation');
});
```

### G2: Voice Onboarding Card

Create `packages/desktop/src/components/VoiceOnboardingCard.tsx`:

When voice models are not yet downloaded, show a card in Settings:
"Enable hands-free interaction. Semblance can listen and speak — entirely on your device. Your voice never leaves this machine."
[Download Voice Models] button → triggers Whisper + Piper download.
Progress indicator during download.

### G3: Voice Status Indicator

Add a voice status indicator to the chat UI header (desktop) and the chat screen (mobile):
- When voice mode is active: small mic icon with pulsing dot
- When voice is unavailable: no icon shown (don't clutter UI for unsupported hardware)

**Tests (7+):** `tests/integration/voice-e2e.test.ts` (5) + `tests/desktop/voice-onboarding.test.ts` (2)
- E2E: full conversation loop works
- E2E: voice routes to weather tool
- E2E: voice creates location reminder
- E2E: insufficient memory → unavailable message
- E2E: no audio persisted
- Onboarding card renders with download button
- Voice status indicator shows correct state

---

## Commit Strategy

10 commits. Each compiles, passes all tests, and leaves the codebase in a working state.

| Commit | Section | Description | Tests |
|--------|---------|-------------|-------|
| 1 | A | VoiceAdapter interface + PlatformAdapter extension + desktop/mobile adapters | 8+ |
| 2 | B1-B3 | WhisperModelManager + TranscriptionPipeline + AudioResampler | 12+ |
| 3 | C1-C3 | PiperModelManager + SpeechSynthesisPipeline + TTS Preprocessor | 10+ |
| 4 | D1-D2 | VoiceConversationManager + SilenceDetector | 6+ |
| 5 | E | VoiceMemoryBudget + VoiceResourceCoordinator | 8+ |
| 6 | F1-F2 | Autonomy domain + IPC ActionTypes + time-saved defaults | 3+ |
| 7 | F3-F4 | Orchestrator voice context + audio privacy enforcement | 4+ |
| 8 | D3-D4 | Voice UI: VoiceButton, VoiceWaveform (desktop), VoiceModeOverlay (mobile) | 2+ |
| 9 | F5+G2-G3 | Voice settings + onboarding card + status indicator | 5+ |
| 10 | G1 | Integration tests + barrel exports + final verification | 7+ |

**Minimum 65 new tests. Target: 70+.**

---

## Exit Criteria

Step 17 is complete when ALL of the following are true. No exceptions. No deferrals.

### Voice Adapter (A)
1. ☐ VoiceAdapter added to PlatformAdapter as optional field
2. ☐ AudioSession capture → stop → AudioData flow works
3. ☐ Microphone permission requested and respected

### STT — Whisper.cpp (B)
4. ☐ WhisperModelManager selects model based on hardware profile
5. ☐ Model download uses existing model registry pipeline with progress
6. ☐ TranscriptionPipeline: audio → text with confidence score
7. ☐ Audio resampler handles 44.1kHz → 16kHz conversion
8. ☐ Audio buffer released after transcription (no persistent audio storage)

### TTS — Piper (C)
9. ☐ PiperModelManager manages voice download/load/unload lifecycle
10. ☐ SpeechSynthesisPipeline: text → speech with interruptible playback
11. ☐ TTS preprocessor handles numbers, abbreviations, markdown, emoji

### Voice Conversation Mode (D)
12. ☐ VoiceConversationManager: activate → listen → transcribe → think → speak → loop
13. ☐ Silence detection auto-stops recording after 1.5s silence
14. ☐ State machine transitions fire correctly (idle → listening → processing → thinking → speaking)
15. ☐ Voice UI renders on desktop (VoiceButton + VoiceWaveform)
16. ☐ Voice UI renders on mobile (VoiceModeOverlay)

### Memory Management (E)
17. ☐ VoiceMemoryBudget calculates available memory accounting for primary LLM
18. ☐ Loading strategy adapts to hardware: both-persistent / on-demand / stt-only / unavailable
19. ☐ Insufficient memory → voice mode unavailable with clear user message (no crash)
20. ☐ Memory pressure → voice models unloaded immediately

### Autonomy + Privacy (F)
21. ☐ 'voice' autonomy domain added with all maps updated atomically
22. ☐ IPC ActionTypes: voice.transcribe, voice.speak, voice.conversation
23. ☐ Orchestrator injects concise-response context when voice mode active
24. ☐ Privacy: zero network imports in `packages/core/voice/`
25. ☐ Privacy: zero Gateway imports in `packages/core/voice/`
26. ☐ Privacy: no audio file I/O in voice modules
27. ☐ Privacy: audit trail does NOT contain transcription text or audio data
28. ☐ Voice settings default OFF

### Tests + Compilation
29. ☐ `npx tsc --noEmit` → zero errors
30. ☐ All existing 2,956 tests pass — zero regressions
31. ☐ 65+ new tests from this step
32. ☐ Total test suite passes with zero failures

**All 32 criteria must be marked PASS. Step 17 does not close until every line is checked.**

---

## Approved Dependencies

### New (requires justification in commit message)
- `whisper.cpp` bindings (Rust crate or Node.js bindings) — STT engine, local-only, no network
- `piper-tts` bindings (Rust crate or Node.js bindings) — TTS engine, local-only, no network
- `onnxruntime-node` — ONNX runtime for Piper models on desktop (if Piper uses ONNX format)
- `@tauri-apps/plugin-*` — Tauri audio plugins for microphone access (if available)

### Pre-approved (already in project)
- `zod` — schema validation for voice data structures
- `nanoid` — ID generation
- `date-fns` — time formatting in voice UI

### NOT Approved
- Any cloud speech API SDK (Google Speech-to-Text, Azure Speech, AWS Transcribe, OpenAI Whisper API)
- Any cloud TTS SDK (Google TTS, Azure TTS, Amazon Polly, ElevenLabs)
- Any audio processing library that phones home or requires API keys
- Any analytics or telemetry package

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Exact Whisper model size thresholds per hardware tier
- Piper default voice selection
- Silence detection threshold tuning (0.005-0.02 range)
- Silence duration tuning (1000-2000ms range)
- TTS speed/pitch default values
- Audio resampler interpolation method (linear is fine)
- Voice UI animation details within Trellis design system
- Keyboard shortcut default (Ctrl+Shift+V suggested)
- Memory budget OS overhead estimate (1.5-2.5GB range)
- Voice conversation state machine timing details
- TTS text preprocessor abbreviation/number expansion rules

## Escalation Triggers — STOP and Report

You MUST stop and report back to Orbital Directors if:
- No viable Whisper.cpp binding exists for the Node.js/Rust ecosystem → need alternative STT engine discussion
- No viable Piper TTS binding exists → need alternative TTS engine discussion
- Memory budgeting reveals that Whisper cannot run alongside the primary LLM on ANY desktop hardware profile → fundamental architecture issue
- Audio capture on Tauri requires a plugin that doesn't exist or is unmaintained → need alternative audio capture approach
- The `\bfetch\b` privacy ban (from Step 16) applies to voice modules too and would block method naming → need clarification
- Autonomy domain extension causes type regressions in more than 3 files
- Any change would require network access in `packages/core/` (RULE 1 VIOLATION)
- Voice conversation flow requires changes to Orchestrator's core processMessage API signature

---

## Verification Commands

Run ALL checks after completion. Every check must PASS.

```bash
echo "=== CHECK 1: GIT HISTORY ==="
git log --oneline -12
echo "--- Expected: 10 Step 17 commits visible ---"

echo "=== CHECK 2: TYPESCRIPT ==="
npx tsc --noEmit 2>&1
echo "EXIT_CODE=$?"
echo "--- Expected: EXIT_CODE=0, zero errors ---"

echo "=== CHECK 3: TEST SUITE ==="
npx vitest run 2>&1 | tail -30
echo "--- Expected: ~3,026+ tests, 0 failures ---"

echo "=== CHECK 4: NEW TEST FILES ==="
echo "--- Voice tests ---"
ls -la tests/core/voice/*.test.ts 2>/dev/null || echo "MISSING: tests/core/voice/"
echo "--- Privacy tests ---"
ls -la tests/privacy/voice-privacy.test.ts 2>/dev/null || echo "MISSING: voice privacy test"
echo "--- Desktop UI tests ---"
ls -la tests/desktop/voice-button.test.ts tests/desktop/voice-onboarding.test.ts 2>/dev/null || echo "MISSING: desktop voice UI tests"
echo "--- Integration test ---"
ls -la tests/integration/voice-e2e.test.ts 2>/dev/null || echo "MISSING: voice integration test"
echo "--- Expected: all test files present ---"

echo "=== CHECK 5: SOURCE FILES EXIST ==="
for f in \
  packages/core/platform/voice-types.ts \
  packages/core/platform/desktop-voice.ts \
  packages/mobile/src/native/voice-bridge.ts \
  packages/core/voice/whisper-model-manager.ts \
  packages/core/voice/transcription-pipeline.ts \
  packages/core/voice/audio-resampler.ts \
  packages/core/voice/piper-model-manager.ts \
  packages/core/voice/speech-synthesis-pipeline.ts \
  packages/core/voice/tts-preprocessor.ts \
  packages/core/voice/voice-conversation-manager.ts \
  packages/core/voice/silence-detector.ts \
  packages/core/voice/voice-memory-budget.ts \
  packages/core/voice/voice-resource-coordinator.ts \
  packages/core/voice/index.ts \
  packages/desktop/src/components/VoiceButton.tsx \
  packages/desktop/src/components/VoiceWaveform.tsx \
  packages/desktop/src/components/VoiceOnboardingCard.tsx \
  packages/mobile/src/components/VoiceModeOverlay.tsx; do
  if [ -f "$f" ]; then
    echo "OK: $f ($(wc -l < "$f") lines)"
  else
    echo "MISSING: $f"
  fi
done
echo "--- Expected: all files present with meaningful line counts ---"

echo "=== CHECK 6: ZERO NETWORK IN CORE VOICE ==="
grep -rn "import.*from.*['\"]node:http\|import.*from.*['\"]node:https\|import.*from.*['\"]node:net\|import.*from.*['\"]node:dgram\|import.*from.*['\"]node:dns\|import.*from.*['\"]node:tls" packages/core/voice/ --include="*.ts" || echo "CLEAN: zero Node.js network imports in core/voice"
grep -rn "import.*XMLHttpRequest\|import.*WebSocket\|import.*from.*['\"]node-fetch\|import.*from.*['\"]undici\|import.*from.*['\"]axios\|import.*from.*['\"]got\b" packages/core/voice/ --include="*.ts" || echo "CLEAN: zero HTTP library imports"
echo "--- Expected: all CLEAN ---"

echo "=== CHECK 7: ZERO GATEWAY IMPORTS ==="
grep -rn "from.*['\"].*gateway" packages/core/voice/ --include="*.ts" | grep -v '\.test\.' || echo "CLEAN: zero gateway imports in core/voice"
echo "--- Expected: CLEAN ---"

echo "=== CHECK 8: NO AUDIO FILE I/O ==="
grep -rn "writeFile\|createWriteStream\|fs\.write\|writeFileSync\|appendFile\|saveAudio\|exportAudio" packages/core/voice/ --include="*.ts" | grep -v '\.test\.' | grep -v 'comment' || echo "CLEAN: no audio file I/O"
echo "--- Expected: CLEAN ---"

echo "=== CHECK 9: AUTONOMY DOMAIN ==="
grep -n "'voice'" packages/core/agent/types.ts
grep -n "voice\." packages/core/agent/autonomy.ts | head -10
grep -n "voice\." packages/core/types/ipc.ts | head -10
echo "--- Expected: 'voice' in union, 3 domain map entries, 3 IPC action types ---"

echo "=== CHECK 10: PLATFORMADAPTER ==="
grep -n "voice.*VoiceAdapter" packages/core/platform/types.ts
echo "--- Expected: voice? field present ---"

echo "=== CHECK 11: ORCHESTRATOR VOICE CONTEXT ==="
grep -n "voice\|concise\|spoken aloud" packages/core/agent/orchestrator.ts | head -5
echo "--- Expected: voice mode context injection present ---"

echo "=== CHECK 12: VOICE DEFAULT OFF ==="
grep -n "voiceEnabled.*false\|voice.*enabled.*false\|default.*false" packages/desktop/src/state/AppState.tsx | grep -i "voice" | head -3
echo "--- Expected: voice defaults to OFF ---"

echo "=== CHECK 13: STUB AUDIT ==="
grep -rn "TODO\|PLACEHOLDER\|FIXME\|stub\|not.implemented" packages/core/voice/ --include="*.ts" | grep -v '\.test\.' | grep -v 'node_modules'
echo "--- Expected: only TODO(Sprint N) on platform-deferred binary wiring ---"

echo "=== CHECK 14: AUDIT TRAIL PRIVACY ==="
grep -rn "transcri" packages/core/voice/ --include="*.ts" | grep -i "audit\|log\|trail" | grep -v '\.test\.' | head -10
echo "--- Expected: audit entries log duration/metadata, NOT transcription text ---"

echo ""
echo "=========================================="
echo "  STEP 17 VERIFICATION SUMMARY"
echo "=========================================="
echo ""
echo "CHECK 1:  Git History (10 commits)           [ ]"
echo "CHECK 2:  TypeScript Clean (EXIT_CODE=0)      [ ]"
echo "CHECK 3:  Tests (≥3,020, 0 failures)          [ ]"
echo "CHECK 4:  Test Files Exist                    [ ]"
echo "CHECK 5:  Source Files Exist (18 files)       [ ]"
echo "CHECK 6:  Zero Network Imports                [ ]"
echo "CHECK 7:  Zero Gateway Imports                [ ]"
echo "CHECK 8:  No Audio File I/O                   [ ]"
echo "CHECK 9:  Autonomy Domain Added               [ ]"
echo "CHECK 10: PlatformAdapter Extended            [ ]"
echo "CHECK 11: Orchestrator Voice Context          [ ]"
echo "CHECK 12: Voice Default OFF                   [ ]"
echo "CHECK 13: Stub Audit Clean                    [ ]"
echo "CHECK 14: Audit Trail Privacy                 [ ]"
echo ""
echo "ALL 14 CHECKS MUST PASS."
echo "Step 17 is NOT complete until every check is marked PASS."
echo "=========================================="
```

If ANY check fails: fix the issue, then re-run ALL checks.

---

## Completion Report

When finished, provide:

```
## Step 17 — Completion Report

### Section A: VoiceAdapter
| Item | Status | Evidence |
|------|--------|----------|
| VoiceAdapter interface | PASS/FAIL | File exists, all methods typed |
| PlatformAdapter extended | PASS/FAIL | voice? field present |
| Desktop adapter | PASS/FAIL | Mock for dev, Tauri TODO for runtime |
| Mobile bridges | PASS/FAIL | iOS + Android platform split |

### Section B: Whisper.cpp STT
| Item | Status | Evidence |
|------|--------|----------|
| WhisperModelManager | PASS/FAIL | Hardware-aware model selection |
| TranscriptionPipeline | PASS/FAIL | Audio → text flow |
| AudioResampler | PASS/FAIL | Sample rate conversion + mono |

### Section C: Piper TTS
| Item | Status | Evidence |
|------|--------|----------|
| PiperModelManager | PASS/FAIL | Voice download/load/unload |
| SpeechSynthesisPipeline | PASS/FAIL | Text → speech with interrupt |
| TTS Preprocessor | PASS/FAIL | Numbers, abbreviations, markdown |

### Section D: Voice Conversation Mode
| Item | Status | Evidence |
|------|--------|----------|
| VoiceConversationManager | PASS/FAIL | State machine works |
| SilenceDetector | PASS/FAIL | Silence triggers at threshold |
| Desktop UI | PASS/FAIL | VoiceButton + VoiceWaveform |
| Mobile UI | PASS/FAIL | VoiceModeOverlay |

### Section E: Memory Management
| Item | Status | Evidence |
|------|--------|----------|
| VoiceMemoryBudget | PASS/FAIL | Strategy selection per hardware |
| VoiceResourceCoordinator | PASS/FAIL | Model load/unload coordination |
| Graceful degradation | PASS/FAIL | Unavailable message, no crash |

### Section F: Autonomy + Privacy
| Item | Status | Evidence |
|------|--------|----------|
| Autonomy domain | PASS/FAIL | Union + maps atomically updated |
| IPC ActionTypes | PASS/FAIL | 3 voice action types |
| Privacy tests | PASS/FAIL | Zero network, zero gateway, zero audio I/O |
| Audit trail | PASS/FAIL | No transcription text logged |

### Section G: Integration
| Item | Status | Evidence |
|------|--------|----------|
| E2E tests | PASS/FAIL | Full conversation loop |
| Voice onboarding card | PASS/FAIL | Download prompt renders |
| Voice status indicator | PASS/FAIL | Shows correct state |

### Test Summary
- Previous: 2,956
- New: [number]
- Total: [number]
- Failures: 0

### Escalation Triggers Hit
- [None / description]

### Decisions Made
- Whisper binding: [choice] because [reason]
- Piper binding: [choice] because [reason]
- Memory thresholds: [values chosen]
- [Any other decisions]
```

---

## The Bar

This is the highest-risk step in Sprint 4. When this step closes:

- A user taps the mic button and says "What's on my schedule today?" Their voice is captured locally by Whisper.cpp, transcribed on their device, processed by the Orchestrator against their calendar data, and the response is spoken back by Piper TTS. At no point did audio data touch a network. At no point was their voice sent to a server. At no point was a transcript stored beyond the chat message they intended.

- A user driving home says "Set a reminder to pick up groceries when I'm near Safeway." Voice → transcription → Orchestrator → location-tagged reminder (from Step 16). Three steps of local AI working together: voice recognition, natural language understanding, and location awareness. All on-device.

- A user on a constrained 8GB laptop activates voice mode. Semblance checks the memory budget, sees that Whisper and Piper can't both stay loaded alongside the 7B LLM, and switches to on-demand loading — load Whisper for transcription, unload, load Piper for speech, unload. It's slightly slower but it works. The user never sees an OOM crash.

- A user on a 4GB device tries voice mode. Semblance politely says: "Voice mode requires more memory than is currently available. You can free memory by closing other applications, or continue using text input." No crash. No degradation of the text experience. Just an honest message.

Cloud assistants have better voice quality — for now. They also record everything you say and store it on their servers. Semblance's voice is private. It's local. It works. And it gets better with every model update — without the user's audio ever leaving their device.

Your voice. Your device. Your rules.
