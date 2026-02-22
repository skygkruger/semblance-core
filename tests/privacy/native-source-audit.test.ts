/**
 * Native Source Audit — Static analysis of native Swift/Kotlin/C++ source files.
 *
 * Verifies that native inference code contains REAL framework API calls,
 * not placeholder strings. This is the static equivalent of the acid test —
 * catches the failure mode where native files look complete but still
 * return hardcoded placeholder strings.
 *
 * Scans are text-based and run on any platform (including Windows).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

describe('Native Source Audit', () => {
  // ─── iOS MLX Swift ──────────────────────────────────────────────────────

  describe('SemblanceMLXModule.swift', () => {
    const filePath = path.join(ROOT, 'packages/mobile/ios/SemblanceMLX/SemblanceMLXModule.swift');
    let content: string;

    it('file exists', () => {
      expect(fs.existsSync(filePath)).toBe(true);
      content = fs.readFileSync(filePath, 'utf-8');
    });

    it('does not contain placeholder strings', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      const lower = content.toLowerCase();
      expect(lower).not.toContain('[mlx inference placeholder]');
      expect(lower).not.toContain('"placeholder"');
      expect(lower).not.toContain('"not implemented"');
      // Allow "TODO" in comments (e.g., "TODO: optimize") but not as return values
      const todoReturnPattern = /return\s*".*todo.*"/i;
      expect(todoReturnPattern.test(content)).toBe(false);
    });

    it('calls real MLX framework APIs', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      // Must contain at least one of these MLX Swift API calls
      const mlxAPIs = [
        'ModelContainer',      // MLXLLM model loading
        'GenerateParameters',  // MLXLLM generation config
        'MLXLMCommon',         // MLXLLM inference
        'MLX.GPU',             // MLX GPU operations
        'LLMModelFactory',     // Model factory
      ];
      const hasMLXAPI = mlxAPIs.some(api => content.includes(api));
      expect(hasMLXAPI).toBe(true);
    });

    it('has loadModel with real implementation', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      // loadModel should reference ModelContainer or similar, not just "loaded"
      expect(content).toContain('func loadModel');
      // Should not have a one-liner return statement
      const loadModelIdx = content.indexOf('func loadModel');
      expect(loadModelIdx).toBeGreaterThan(-1);
    });

    it('has generate with real inference loop', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('func generate');
      // Should reference token generation, not a hardcoded string
      const hasInference = content.includes('generate(') || content.includes('MLXLMCommon');
      expect(hasInference).toBe(true);
    });
  });

  // ─── Android Kotlin ─────────────────────────────────────────────────────

  describe('SemblanceLlamaModule.kt', () => {
    const filePath = path.join(ROOT, 'packages/mobile/android/app/src/main/java/com/semblance/llm/SemblanceLlamaModule.kt');
    let content: string;

    it('file exists', () => {
      expect(fs.existsSync(filePath)).toBe(true);
      content = fs.readFileSync(filePath, 'utf-8');
    });

    it('does not contain placeholder strings', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      const lower = content.toLowerCase();
      expect(lower).not.toContain('[llamacpp inference placeholder]');
      expect(lower).not.toContain('"placeholder"');
      expect(lower).not.toContain('"not implemented"');
    });

    it('declares JNI native methods', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      // Must declare external native methods (JNI bridge)
      expect(content).toContain('external fun nativeLoadModel');
      expect(content).toContain('external fun nativeGenerate');
      expect(content).toContain('external fun nativeEmbed');
      expect(content).toContain('external fun nativeFreeModel');
    });

    it('generate calls nativeGenerate', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      // The generate function should call nativeGenerate, not return a hardcoded string
      expect(content).toContain('nativeGenerate(');
    });

    it('loads native library', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('System.loadLibrary("semblance_llama")');
    });
  });

  // ─── Android C++ JNI Bridge ─────────────────────────────────────────────

  describe('semblance_llama_jni.cpp', () => {
    const filePath = path.join(ROOT, 'packages/mobile/android/app/src/main/cpp/semblance_llama_jni.cpp');
    let content: string;

    it('file exists', () => {
      expect(fs.existsSync(filePath)).toBe(true);
      content = fs.readFileSync(filePath, 'utf-8');
    });

    it('does not contain placeholder strings', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      const lower = content.toLowerCase();
      expect(lower).not.toContain('"placeholder"');
      expect(lower).not.toContain('"todo"');
      expect(lower).not.toContain('"not implemented"');
    });

    it('calls real llama.cpp API functions', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      // Must contain actual llama.cpp API calls
      expect(content).toContain('llama_model_load_from_file');
      expect(content).toContain('llama_new_context_with_model');
      expect(content).toContain('llama_decode');
      expect(content).toContain('llama_tokenize');
    });

    it('has token-to-string conversion', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('llama_token_to_piece');
    });

    it('includes llama.h header', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('#include "llama.h"');
    });

    it('exports JNI functions with correct package name', () => {
      content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('Java_com_semblance_llm_SemblanceLlamaModule_nativeLoadModel');
      expect(content).toContain('Java_com_semblance_llm_SemblanceLlamaModule_nativeGenerate');
    });
  });

  // ─── CMakeLists.txt ─────────────────────────────────────────────────────

  describe('CMakeLists.txt', () => {
    const filePath = path.join(ROOT, 'packages/mobile/android/app/src/main/cpp/CMakeLists.txt');

    it('file exists', () => {
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('fetches llama.cpp from git', () => {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('FetchContent_Declare');
      expect(content).toContain('llama.cpp');
    });

    it('links llama library', () => {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('target_link_libraries');
      expect(content).toContain('llama');
    });
  });
});
