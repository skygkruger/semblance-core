import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSemblanceCore, type SemblanceCore } from '@semblance/core';
import { createLLMProvider } from '@semblance/core/llm/index.js';

export interface CoreBootOptions {
  dataDir: string;
  initTimeoutMs?: number;
}

export interface CoreBootResult {
  status: 'ready' | 'degraded';
  core: SemblanceCore | null;
  error?: string;
}

export async function bootCoreRuntime(options: CoreBootOptions): Promise<CoreBootResult> {
  mkdirSync(options.dataDir, { recursive: true });
  const knowledgeDir = join(options.dataDir, 'knowledge');
  mkdirSync(knowledgeDir, { recursive: true });

  const initTimeoutMs = options.initTimeoutMs ?? 60_000;

  try {
    const llmProvider = createLLMProvider({
      runtime: 'ollama',
      ollamaHost: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
      embeddingModel: 'nomic-embed-text',
    });

    const core = createSemblanceCore({ dataDir: options.dataDir, llmProvider });
    const initTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Core initialization timed out after ${initTimeoutMs}ms`)), initTimeoutMs);
    });
    await Promise.race([core.initialize(), initTimeout]);

    return { status: 'ready', core };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'degraded', core: null, error: message };
  }
}

export function resolveCoreIpcPath(inprocessTransport: boolean): string {
  if (inprocessTransport) {
    return join(tmpdir(), `semblance-core-ipc-${process.pid}.sock`);
  }
  return join(tmpdir(), `semblance-core-ipc-${process.pid}.sock`);
}
