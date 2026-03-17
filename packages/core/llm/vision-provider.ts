// VisionProvider — Local vision inference pipeline for Moondream2 and Qwen2.5-VL.
//
// Manages two vision model tiers:
//   - 'fast': Moondream2 (screen reading, quick visual queries, ~1.9B params)
//   - 'rich': Qwen2.5-VL-3B (document OCR, complex visual tasks, ~3B params)
//
// Both models require a main GGUF + mmproj (multimodal projector) file.
// Vision inference stays in the AI Core — only extracted text crosses IPC.
// CRITICAL: No network imports. Pure inference logic.

import type {
  LLMProvider,
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
} from './types.js';
import type { NativeRuntimeBridge } from './native-bridge-types.js';

export interface VisionRequest {
  /** Path to image file on disk */
  imagePath?: string;
  /** Base64-encoded image bytes (for screen capture) */
  imageBase64?: string;
  /** Prompt describing what to extract/analyze */
  prompt: string;
  /** Vision tier: 'fast' (Moondream2) or 'rich' (Qwen2.5-VL) */
  tier: 'fast' | 'rich';
  /** Maximum response tokens */
  maxTokens?: number;
}

export interface VisionResponse {
  /** Extracted text / description */
  text: string;
  /** Model ID used for inference */
  modelUsed: string;
  /** Tokens consumed */
  tokensUsed: number;
  /** Processing time in milliseconds */
  processingMs: number;
}

interface VisionModelState {
  loaded: boolean;
  modelId: string;
  modelPath: string;
  mmProjectorPath: string;
}

/**
 * VisionProvider manages local vision-language model inference.
 * Implements LLMProvider so it can slot into InferenceRouter.
 */
export class VisionProvider implements LLMProvider {
  private bridge: NativeRuntimeBridge | null;
  private fastModel: VisionModelState | null = null;
  private richModel: VisionModelState | null = null;

  constructor(config?: { bridge?: NativeRuntimeBridge }) {
    this.bridge = config?.bridge ?? null;
  }

  /**
   * Configure a vision model tier.
   */
  configure(tier: 'fast' | 'rich', config: {
    modelId: string;
    modelPath: string;
    mmProjectorPath: string;
  }): void {
    const state: VisionModelState = {
      loaded: false,
      modelId: config.modelId,
      modelPath: config.modelPath,
      mmProjectorPath: config.mmProjectorPath,
    };
    if (tier === 'fast') {
      this.fastModel = state;
    } else {
      this.richModel = state;
    }
  }

  /**
   * Check if a vision model tier is loaded and ready.
   */
  isLoaded(tier: 'fast' | 'rich'): boolean {
    const model = tier === 'fast' ? this.fastModel : this.richModel;
    return model?.loaded ?? false;
  }

  /**
   * Load a vision model tier into memory.
   * In production, this calls the NativeRuntimeBridge to load the GGUF + mmproj.
   */
  async load(tier: 'fast' | 'rich'): Promise<void> {
    const model = tier === 'fast' ? this.fastModel : this.richModel;
    if (!model) throw new Error(`Vision ${tier} tier not configured`);
    if (model.loaded) return;

    // In production: bridge.loadVisionModel(model.modelPath, model.mmProjectorPath)
    // For now, mark as loaded — actual bridge wiring happens when Tauri vision_generate command exists
    model.loaded = true;
    console.log(`[VisionProvider] ${tier} tier loaded: ${model.modelId}`);
  }

  /**
   * Unload a vision model tier from memory.
   */
  async unload(tier: 'fast' | 'rich'): Promise<void> {
    const model = tier === 'fast' ? this.fastModel : this.richModel;
    if (!model) return;
    model.loaded = false;
    console.log(`[VisionProvider] ${tier} tier unloaded: ${model.modelId}`);
  }

  /**
   * Analyze an image using the specified vision tier.
   */
  async analyzeImage(request: VisionRequest): Promise<VisionResponse> {
    const tier = request.tier;
    const model = tier === 'fast' ? this.fastModel : this.richModel;

    if (!model) {
      throw new Error(`Vision ${tier} tier not configured`);
    }

    if (!model.loaded) {
      await this.load(tier);
    }

    const startMs = Date.now();

    // Bridge to llama.cpp multimodal inference
    // In production: bridge.visionGenerate({ modelPath, mmProjectorPath, imagePath/imageBase64, prompt })
    // For now: return a structured placeholder that the Tauri command will replace
    if (this.bridge) {
      const result = await this.bridge.generate({
        prompt: request.prompt,
        maxTokens: request.maxTokens ?? 512,
        temperature: 0.3,
      });

      return {
        text: result.text,
        modelUsed: model.modelId,
        tokensUsed: result.tokensGenerated,
        processingMs: Date.now() - startMs,
      };
    }

    // No bridge available — return error message
    return {
      text: `[VisionProvider] No inference bridge available for ${tier} tier. Configure NativeRuntimeBridge with vision support.`,
      modelUsed: model.modelId,
      tokensUsed: 0,
      processingMs: Date.now() - startMs,
    };
  }

  /**
   * Analyze an image from a file path.
   */
  async analyzeFromPath(imagePath: string, prompt: string, tier: 'fast' | 'rich' = 'fast'): Promise<VisionResponse> {
    return this.analyzeImage({ imagePath, prompt, tier });
  }

  /**
   * Capture and analyze the current screen (desktop only).
   * Screen capture is done by the caller (OS-specific), base64 passed here.
   */
  async captureAndAnalyzeScreen(screenshotBase64: string, prompt?: string): Promise<VisionResponse> {
    return this.analyzeImage({
      imageBase64: screenshotBase64,
      prompt: prompt ?? 'Describe what you see on this screen. Focus on the active application, any visible text, and what the user appears to be working on.',
      tier: 'fast',
    });
  }

  /**
   * OCR a document image (uses rich tier for better accuracy).
   */
  async ocrDocument(imagePath: string): Promise<VisionResponse> {
    return this.analyzeImage({
      imagePath,
      prompt: 'Extract all text from this document image. Preserve formatting and structure where possible. Include all visible text.',
      tier: 'rich',
      maxTokens: 2048,
    });
  }

  // ─── LLMProvider Interface ───────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    return this.fastModel?.loaded || this.richModel?.loaded || false;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await this.analyzeImage({
      prompt: request.prompt,
      tier: 'fast',
      maxTokens: request.maxTokens,
    });
    return {
      text: response.text,
      model: response.modelUsed,
      tokensUsed: { prompt: 0, completion: response.tokensUsed, total: response.tokensUsed },
      durationMs: response.processingMs,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const lastUserMessage = [...request.messages].reverse().find(m => m.role === 'user');
    const response = await this.analyzeImage({
      prompt: lastUserMessage?.content ?? '',
      tier: 'fast',
      maxTokens: request.maxTokens,
    });
    return {
      message: { role: 'assistant', content: response.text },
      model: response.modelUsed,
      tokensUsed: { prompt: 0, completion: response.tokensUsed, total: response.tokensUsed },
      durationMs: response.processingMs,
    };
  }

  async embed(_request: EmbedRequest): Promise<EmbedResponse> {
    throw new Error('VisionProvider does not support embeddings');
  }

  async listModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    if (this.fastModel) {
      models.push({ name: this.fastModel.modelId, size: 0, isEmbedding: false, family: 'moondream' });
    }
    if (this.richModel) {
      models.push({ name: this.richModel.modelId, size: 0, isEmbedding: false, family: 'qwen2.5-vl' });
    }
    return models;
  }

  async getModel(name: string): Promise<ModelInfo | null> {
    if (this.fastModel?.modelId === name) {
      return { name, size: 0, isEmbedding: false, family: 'moondream' };
    }
    if (this.richModel?.modelId === name) {
      return { name, size: 0, isEmbedding: false, family: 'qwen2.5-vl' };
    }
    return null;
  }

  /**
   * Get status of both vision tiers.
   */
  getStatus(): { fastLoaded: boolean; richLoaded: boolean; fastModel: string | null; richModel: string | null } {
    return {
      fastLoaded: this.fastModel?.loaded ?? false,
      richLoaded: this.richModel?.loaded ?? false,
      fastModel: this.fastModel?.modelId ?? null,
      richModel: this.richModel?.modelId ?? null,
    };
  }
}
