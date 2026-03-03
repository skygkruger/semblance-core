// generate-voice-sounds.ts — Generates voice-start.wav and voice-stop.wav
//
// voice-start: 300ms ascending sine sweep (440Hz → 880Hz)
// voice-stop:  300ms descending sine sweep (880Hz → 440Hz)
// Format: 44100 Hz, 16-bit mono PCM WAV
//
// Run: npx tsx packages/desktop/scripts/generate-voice-sounds.ts
// No external dependencies — uses Buffer and fs only.

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SAMPLE_RATE = 44100;
const DURATION_SECONDS = 0.3;
const BIT_DEPTH = 16;
const NUM_CHANNELS = 1;
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SECONDS);

function generateSineSweep(startHz: number, endHz: number): Buffer {
  const dataSize = TOTAL_SAMPLES * (BIT_DEPTH / 8) * NUM_CHANNELS;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // ─── WAV Header ──────────────────────────────────────────────────────
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4); // ChunkSize
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (PCM = 1)
  buffer.writeUInt16LE(NUM_CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BIT_DEPTH / 8), 28); // ByteRate
  buffer.writeUInt16LE(NUM_CHANNELS * (BIT_DEPTH / 8), 32); // BlockAlign
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // ─── PCM Data ────────────────────────────────────────────────────────
  let phase = 0;
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const t = i / TOTAL_SAMPLES; // 0..1
    const freq = startHz + (endHz - startHz) * t;
    const amplitude = 0.4 * (1 - 0.3 * t); // Slight fade-out

    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const sample = Math.sin(phase) * amplitude;

    // Clamp to 16-bit range
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buffer.writeInt16LE(intSample, headerSize + i * 2);
  }

  return buffer;
}

// ─── Generate both sounds ────────────────────────────────────────────────────

const voiceStart = generateSineSweep(440, 880);
const voiceStop = generateSineSweep(880, 440);

const outputDirs = [
  resolve(__dirname, '../src/assets/sounds'),
  resolve(__dirname, '../../mobile/src/assets/sounds'),
];

for (const dir of outputDirs) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'voice-start.wav'), voiceStart);
  writeFileSync(resolve(dir, 'voice-stop.wav'), voiceStop);
}

console.log(`Generated voice-start.wav (${voiceStart.length} bytes) and voice-stop.wav (${voiceStop.length} bytes)`);
console.log(`Output directories: ${outputDirs.join(', ')}`);
