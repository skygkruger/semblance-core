// AudioResampler — Pure functions for audio format conversion.
//
// Linear interpolation resampler, stereo-to-mono, and normalization.
// Used by TranscriptionPipeline to prepare audio for Whisper.cpp (16kHz mono).
//
// CRITICAL: No network imports. Pure computation.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

/**
 * Resample audio from one sample rate to another using linear interpolation.
 * @param input  - Source audio samples
 * @param inputRate  - Source sample rate (e.g. 44100)
 * @param outputRate - Target sample rate (e.g. 16000)
 * @returns Resampled audio at the target rate
 */
export function resampleAudio(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) {
    return new Float32Array(input);
  }

  if (input.length === 0) {
    return new Float32Array(0);
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, input.length - 1);
    const fraction = srcIndex - srcFloor;

    output[i] = input[srcFloor]! * (1 - fraction) + input[srcCeil]! * fraction;
  }

  return output;
}

/**
 * Convert stereo interleaved audio to mono by averaging channels.
 * Input: [L0, R0, L1, R1, ...] → Output: [(L0+R0)/2, (L1+R1)/2, ...]
 * @param stereoData - Interleaved stereo audio
 * @returns Mono audio (half the length)
 */
export function stereoToMono(stereoData: Float32Array): Float32Array {
  const monoLength = Math.floor(stereoData.length / 2);
  const mono = new Float32Array(monoLength);

  for (let i = 0; i < monoLength; i++) {
    const left = stereoData[i * 2]!;
    const right = stereoData[i * 2 + 1]!;
    mono[i] = (left + right) / 2;
  }

  return mono;
}

/**
 * Normalize audio data so all values are within [-1.0, 1.0].
 * If the audio is already within range, it's returned as a copy.
 * @param data - Audio samples
 * @returns Normalized audio samples
 */
export function normalizeAudio(data: Float32Array): Float32Array {
  if (data.length === 0) {
    return new Float32Array(0);
  }

  let maxAbs = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]!);
    if (abs > maxAbs) maxAbs = abs;
  }

  // Already normalized or silent
  if (maxAbs <= 1.0) {
    return new Float32Array(data);
  }

  const output = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    output[i] = data[i]! / maxAbs;
  }

  return output;
}
