// Mobile Runtime — Initializes the full Semblance AI stack on mobile.
//
// This is the mobile equivalent of the desktop's bridge.ts handleInitialize.
// It creates the platform adapter, inference bridge, knowledge graph,
// orchestrator, and all AI capabilities.
//
// Initialization order:
// 1. Hardware info (async device detection)
// 2. Platform adapter (setPlatform)
// 3. Directories (ensure data dir exists)
// 4. SQLite vector store
// 5. Inference bridge (MLX on iOS, llama.cpp on Android)
// 6. Mobile LLM provider
// 7. Inference router
// 8. Knowledge graph
// 9. IPC client (for Gateway actions)
// 10. Orchestrator
//
// CRITICAL: No network imports. All initialization is local.

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { setPlatform, createMobileAdapter } from '@semblance/core/platform/index';
import { mobilePath } from '@semblance/core/platform/mobile-adapter';
import { createSemblanceCore } from '@semblance/core';
import type { SemblanceCore } from '@semblance/core';
import { MobileProvider } from '@semblance/core/llm/mobile-provider';
import { InferenceRouter } from '@semblance/core/llm/inference-router';
import {
  classifyMobileDevice,
} from '@semblance/core/llm/mobile-bridge-types';
import type { MobileInferenceBridge } from '@semblance/core/llm/mobile-bridge-types';
import {
  MobileModelManager,
  selectReasoningModel,
  selectEmbeddingModel,
} from '@semblance/core/llm/mobile-model-manager';

import {
  createRNFSAdapter,
  createCryptoAdapter,
  createSQLiteAdapter,
  createHardwareAdapter,
  createNotificationAdapter,
  ensureDirectories,
  initHardwareInfo,
} from './platform-adapters';
import { createSQLiteVectorStore } from './sqlite-vector-store';

// Native bridges
import { createMobileVoiceAdapter } from '../native/voice-bridge';
import { createMobileContactsAdapter } from '../native/contacts-bridge';
import { createMobileLocationAdapter } from '../native/location-bridge';
import { createMobileWeatherAdapter } from '../native/weather-bridge';
import { createMobileMessagingAdapter } from '../native/messaging-bridge';

// Inference bridges
import { createMobileInferenceBridge } from '../inference/unified-bridge';

export interface MobileRuntimeState {
  /** Whether the runtime has been initialized */
  initialized: boolean;
  /** The SemblanceCore instance (knowledge graph, orchestrator, LLM) */
  core: SemblanceCore | null;
  /** The inference router */
  inferenceRouter: InferenceRouter | null;
  /** The mobile model manager */
  modelManager: MobileModelManager | null;
  /** The native inference bridge */
  inferenceBridge: MobileInferenceBridge | null;
  /** Data directory path */
  dataDir: string;
  /** Device profile info */
  deviceInfo: {
    platform: 'ios' | 'android';
    totalMemMb: number;
    deviceName: string;
    tier: 'capable' | 'constrained' | 'none';
  } | null;
  /** Initialization error, if any */
  error: string | null;
  /** Initialization progress (0-100) */
  progress: number;
  /** Current initialization step description */
  progressLabel: string;
}

const initialState: MobileRuntimeState = {
  initialized: false,
  core: null,
  inferenceRouter: null,
  modelManager: null,
  inferenceBridge: null,
  dataDir: '',
  deviceInfo: null,
  error: null,
  progress: 0,
  progressLabel: '',
};

// Singleton runtime state
let runtimeState: MobileRuntimeState = { ...initialState };
let initPromise: Promise<MobileRuntimeState> | null = null;

/**
 * Get current runtime state.
 */
export function getRuntimeState(): Readonly<MobileRuntimeState> {
  return runtimeState;
}

type ProgressCallback = (progress: number, label: string) => void;

/**
 * Initialize the mobile runtime.
 * Safe to call multiple times — returns cached result after first init.
 */
export async function initializeMobileRuntime(
  onProgress?: ProgressCallback,
): Promise<MobileRuntimeState> {
  // Return cached result if already initialized
  if (runtimeState.initialized) return runtimeState;

  // Return in-flight promise if already initializing
  if (initPromise) return initPromise;

  initPromise = doInitialize(onProgress);
  return initPromise;
}

function updateProgress(progress: number, label: string, onProgress?: ProgressCallback) {
  runtimeState.progress = progress;
  runtimeState.progressLabel = label;
  onProgress?.(progress, label);
}

async function doInitialize(onProgress?: ProgressCallback): Promise<MobileRuntimeState> {
  try {
    // ─── Step 1: Hardware Detection ─────────────────────────────────────
    updateProgress(5, 'Detecting hardware...', onProgress);
    const hwInfo = await initHardwareInfo();
    const totalMemMb = Math.round(hwInfo.totalMemBytes / (1024 * 1024));
    const deviceProfile = classifyMobileDevice(
      hwInfo.platform,
      totalMemMb,
      hwInfo.deviceName,
    );

    runtimeState.deviceInfo = {
      platform: hwInfo.platform,
      totalMemMb,
      deviceName: hwInfo.deviceName,
      tier: deviceProfile.tier,
    };

    console.log(`[MobileRuntime] Device: ${hwInfo.deviceName}, RAM: ${totalMemMb}MB, Tier: ${deviceProfile.tier}`);

    // ─── Step 2: Platform Adapter ───────────────────────────────────────
    updateProgress(10, 'Setting up platform...', onProgress);

    const sqliteAdapter = createSQLiteAdapter();
    const dataDir = `${RNFS.DocumentDirectoryPath}/semblance`;

    // Create vector store DB handle
    await ensureDirectories(dataDir);
    const vectorDb = sqliteAdapter.openDatabase(`${dataDir}/vectors.db`);
    vectorDb.pragma('journal_mode = WAL');
    const vectorStore = createSQLiteVectorStore(vectorDb);

    const platformAdapter = createMobileAdapter({
      name: hwInfo.platform === 'ios' ? 'mobile-ios' : 'mobile-android',
      fs: createRNFSAdapter(),
      path: mobilePath,
      crypto: createCryptoAdapter(),
      sqlite: sqliteAdapter,
      hardware: createHardwareAdapter(),
      notifications: createNotificationAdapter(),
      vectorStore,
    });

    // Inject optional adapters
    const mobilePlatform = hwInfo.platform;
    platformAdapter.voice = createMobileVoiceAdapter(mobilePlatform);
    platformAdapter.contacts = createMobileContactsAdapter();
    platformAdapter.location = createMobileLocationAdapter(mobilePlatform);
    platformAdapter.weather = createMobileWeatherAdapter(mobilePlatform);
    platformAdapter.messaging = createMobileMessagingAdapter(mobilePlatform);

    setPlatform(platformAdapter);
    runtimeState.dataDir = dataDir;

    console.log('[MobileRuntime] Platform adapter configured');

    // ─── Step 3: Inference Bridge ───────────────────────────────────────
    updateProgress(20, 'Initializing inference engine...', onProgress);

    let inferenceBridge: MobileInferenceBridge | null = null;
    let mobileProvider: MobileProvider | null = null;
    let inferenceRouter: InferenceRouter | null = null;

    const reasoningModel = selectReasoningModel(deviceProfile);
    const embeddingModel = selectEmbeddingModel(deviceProfile);

    if (deviceProfile.tier !== 'none') {
      try {
        inferenceBridge = await createMobileInferenceBridge({
          platform: hwInfo.platform,
        });

        mobileProvider = new MobileProvider({
          bridge: inferenceBridge,
          modelName: reasoningModel?.id ?? 'llama-3.2-3b-q4',
          embeddingModelName: embeddingModel?.id ?? 'nomic-embed-text-v1.5',
        });

        inferenceRouter = new InferenceRouter({
          reasoningProvider: mobileProvider,
          embeddingProvider: mobileProvider,
          reasoningModel: reasoningModel?.id ?? 'llama-3.2-3b-q4',
          embeddingModel: embeddingModel?.id ?? 'nomic-embed-text-v1.5',
          platform: hwInfo.platform,
          mobileProvider,
          mobileReasoningModel: reasoningModel?.id ?? 'llama-3.2-3b-q4',
          mobileEmbeddingModel: embeddingModel?.id ?? 'nomic-embed-text-v1.5',
        });

        runtimeState.inferenceBridge = inferenceBridge;
        runtimeState.inferenceRouter = inferenceRouter;

        console.log(`[MobileRuntime] Inference engine ready (${deviceProfile.tier})`);
      } catch (err) {
        console.error('[MobileRuntime] Inference bridge init failed:', err);
        // Continue without inference — chat will be unavailable but other features work
      }
    } else {
      console.log('[MobileRuntime] Device tier: none — inference disabled');
    }

    // ─── Step 4: Model Manager ──────────────────────────────────────────
    updateProgress(30, 'Setting up model management...', onProgress);

    const modelManager = new MobileModelManager({
      storageDir: `${dataDir}/models`,
      wifiOnly: true,
      storageBudget: { maxTotalBytes: 4_000_000_000 },
    });
    runtimeState.modelManager = modelManager;

    // Check if models are cached
    if (reasoningModel && modelManager.isModelCached(reasoningModel.id)) {
      const modelPath = modelManager.getModelPath(reasoningModel.id);
      if (modelPath && inferenceBridge && !inferenceBridge.isModelLoaded()) {
        updateProgress(40, 'Loading AI model...', onProgress);
        try {
          await inferenceBridge.loadModel(modelPath, deviceProfile.modelOptions);
          console.log(`[MobileRuntime] Model loaded: ${reasoningModel.id}`);
        } catch (err) {
          console.error('[MobileRuntime] Model load failed:', err);
        }
      }
    }

    // ─── Step 5: SemblanceCore ──────────────────────────────────────────
    updateProgress(50, 'Initializing AI core...', onProgress);

    let core: SemblanceCore | null = null;

    if (inferenceRouter) {
      try {
        core = createSemblanceCore({
          dataDir,
          llmProvider: inferenceRouter,
          embeddingModel: embeddingModel?.id ?? 'nomic-embed-text',
        });

        updateProgress(60, 'Connecting knowledge graph...', onProgress);

        // Initialize with timeout — knowledge graph can hang
        const initTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Core init timed out after 30s')), 30_000),
        );
        await Promise.race([core.initialize(), initTimeout]);

        runtimeState.core = core;
        console.log('[MobileRuntime] SemblanceCore initialized');
      } catch (err) {
        console.error('[MobileRuntime] Core initialization failed:', err);
        // Core failed but we can still operate in degraded mode
      }
    }

    // ─── Step 6: Finalize ──────────────────────────────────────────────
    updateProgress(90, 'Finalizing...', onProgress);

    runtimeState.initialized = true;
    runtimeState.error = null;

    updateProgress(100, 'Ready', onProgress);
    console.log('[MobileRuntime] Initialization complete');

    return runtimeState;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[MobileRuntime] Initialization failed:', message);
    runtimeState.error = message;
    runtimeState.initialized = true; // Mark as initialized even on failure to prevent retries
    return runtimeState;
  }
}

/**
 * Shut down the mobile runtime.
 */
export async function shutdownMobileRuntime(): Promise<void> {
  if (runtimeState.core) {
    await runtimeState.core.shutdown();
  }
  if (runtimeState.inferenceBridge?.isModelLoaded()) {
    await runtimeState.inferenceBridge.unloadModel();
  }
  runtimeState = { ...initialState };
  initPromise = null;
}

/**
 * Send a chat message through the orchestrator.
 * Returns the response text and any actions taken.
 */
export async function sendChatMessage(
  message: string,
  conversationId?: string,
): Promise<{
  response: string;
  conversationId: string;
  actions: Array<{ id: string; type: string; status: string }>;
}> {
  const { core, inferenceRouter } = runtimeState;

  if (!core && !inferenceRouter) {
    throw new Error('AI not available. Model may not be downloaded yet.');
  }

  // Primary path: orchestrator with tools
  if (core) {
    try {
      const result = await core.agent.processMessage(message, conversationId);
      return {
        response: result.message,
        conversationId: result.conversationId ?? conversationId ?? 'default',
        actions: (result.actions ?? []).map((a: { action: string; status?: string }, i: number) => ({
          id: String(i),
          type: a.action,
          status: a.status ?? 'completed',
        })),
      };
    } catch (err) {
      console.error('[MobileRuntime] Orchestrator failed, falling back to direct LLM:', err);
    }
  }

  // Fallback: direct LLM chat (no tools, no knowledge search)
  if (inferenceRouter) {
    const response = await inferenceRouter.chat({
      model: runtimeState.inferenceRouter?.getModelForTask?.('reason') ?? 'llama-3.2-3b-q4',
      messages: [
        {
          role: 'system',
          content: 'You are Semblance, a personal AI assistant. You run entirely on the user\'s device. Be helpful, warm, and concise.',
        },
        { role: 'user', content: message },
      ],
    });
    return {
      response: response.content,
      conversationId: conversationId ?? 'default',
      actions: [],
    };
  }

  throw new Error('No inference capability available.');
}

/**
 * Stream a chat response token by token.
 */
export async function* streamChatMessage(
  message: string,
  conversationId?: string,
): AsyncIterable<string> {
  const { inferenceRouter } = runtimeState;

  if (!inferenceRouter) {
    throw new Error('AI not available. Model may not be downloaded yet.');
  }

  const stream = inferenceRouter.chatStream({
    model: inferenceRouter.getModelForTask?.('reason') ?? 'llama-3.2-3b-q4',
    messages: [
      {
        role: 'system',
        content: 'You are Semblance, a personal AI assistant. You run entirely on the user\'s device. Be helpful, warm, and concise.',
      },
      { role: 'user', content: message },
    ],
  });

  for await (const token of stream) {
    yield token;
  }
}
