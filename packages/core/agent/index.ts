// Agent Orchestration Layer — Export types, autonomy, IPC client, and orchestrator.

export type {
  AutonomyTier,
  AutonomyConfig,
  AutonomyDomain,
  AgentAction,
  ConversationTurn,
} from './types.js';

export { AutonomyManager } from './autonomy.js';
export type { AutonomyDecision } from './autonomy.js';
export { CoreIPCClient } from './ipc-client.js';
export type { IPCClient, IPCClientConfig } from './ipc-client.js';
export { OrchestratorImpl } from './orchestrator.js';
export type { Orchestrator, OrchestratorResponse } from './orchestrator.js';
export { DocumentContextManager } from './document-context.js';
export type { DocumentContextInfo } from './document-context.js';
export { DailyDigestGenerator } from './daily-digest.js';
export type { DailyDigest, DailyDigestPreferences } from './daily-digest.js';

import type { LLMProvider } from '../llm/types.js';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { IPCClient } from './ipc-client.js';
import type { AutonomyConfig } from './types.js';
import type { Orchestrator } from './orchestrator.js';
import { OrchestratorImpl } from './orchestrator.js';
import { AutonomyManager } from './autonomy.js';
import { getPlatform } from '../platform/index.js';
import type { SemblanceExtension } from '../extensions/types.js';

/**
 * Create an Orchestrator instance.
 * If extensions are provided, their tools are registered with the orchestrator.
 */
export function createOrchestrator(config: {
  llmProvider: LLMProvider;
  knowledgeGraph: KnowledgeGraph;
  ipcClient: IPCClient;
  autonomyConfig?: AutonomyConfig;
  dataDir: string;
  model: string;
  extensions?: SemblanceExtension[];
}): Orchestrator {
  const p = getPlatform();
  const db = p.sqlite.openDatabase(p.path.join(config.dataDir, 'agent.db'));
  db.pragma('journal_mode = WAL');

  const autonomy = new AutonomyManager(db, config.autonomyConfig);

  const orchestrator = new OrchestratorImpl({
    llm: config.llmProvider,
    knowledge: config.knowledgeGraph,
    ipc: config.ipcClient,
    autonomy,
    db,
    model: config.model,
  });

  // Wire extension tools
  if (config.extensions) {
    for (const ext of config.extensions) {
      if (ext.tools && ext.tools.length > 0) {
        orchestrator.registerTools(ext.tools);
      }
    }
  }

  return orchestrator;
}
