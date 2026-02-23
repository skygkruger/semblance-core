// SilenceDetector — Detects silence in audio streams via RMS amplitude.
//
// Pure computation — receives audio chunks, returns whether silence threshold
// has been exceeded for the configured duration. No platform dependencies.
//
// CRITICAL: No network imports. Pure computation.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

export interface SilenceDetectorOptions {
  /** RMS amplitude threshold below which audio is considered "silent" (default: 0.01) */
  silenceThreshold?: number;
  /** How long silence must persist to trigger detection, in ms (default: 1500) */
  silenceDurationMs?: number;
  /** Minimum recording duration before silence can trigger, in ms (default: 500) */
  minRecordingMs?: number;
  /** Duration of each audio chunk in ms (default: 100) */
  chunkDurationMs?: number;
}

export class SilenceDetector {
  private silenceThreshold: number;
  private silenceDurationMs: number;
  private minRecordingMs: number;
  private chunkDurationMs: number;

  private silentMs = 0;
  private totalMs = 0;

  constructor(options?: SilenceDetectorOptions) {
    this.silenceThreshold = options?.silenceThreshold ?? 0.01;
    this.silenceDurationMs = options?.silenceDurationMs ?? 1500;
    this.minRecordingMs = options?.minRecordingMs ?? 500;
    this.chunkDurationMs = options?.chunkDurationMs ?? 100;
  }

  /**
   * Calculate RMS (Root Mean Square) amplitude of an audio chunk.
   */
  static calculateRMS(chunk: Float32Array): number {
    if (chunk.length === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < chunk.length; i++) {
      sumSquares += chunk[i]! * chunk[i]!;
    }
    return Math.sqrt(sumSquares / chunk.length);
  }

  /**
   * Process an audio chunk and return whether silence has been detected.
   * Returns true when silence has exceeded the configured duration
   * AND the minimum recording time has been met.
   */
  processChunk(chunk: Float32Array): boolean {
    this.totalMs += this.chunkDurationMs;
    const rms = SilenceDetector.calculateRMS(chunk);

    if (rms < this.silenceThreshold) {
      this.silentMs += this.chunkDurationMs;
    } else {
      this.silentMs = 0;
    }

    // Don't trigger before minimum recording duration
    if (this.totalMs < this.minRecordingMs) {
      return false;
    }

    return this.silentMs >= this.silenceDurationMs;
  }

  /**
   * Reset detector state for a new recording session.
   */
  reset(): void {
    this.silentMs = 0;
    this.totalMs = 0;
  }
}
