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

import type { LLMProvider } from '../llm/types.js';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { IPCClient } from './ipc-client.js';
import type { AutonomyConfig } from './types.js';
import type { Orchestrator } from './orchestrator.js';
import { OrchestratorImpl } from './orchestrator.js';
import { AutonomyManager } from './autonomy.js';
import Database from 'better-sqlite3';
import { join } from 'node:path';

/**
 * Create an Orchestrator instance.
 */
export function createOrchestrator(config: {
  llmProvider: LLMProvider;
  knowledgeGraph: KnowledgeGraph;
  ipcClient: IPCClient;
  autonomyConfig?: AutonomyConfig;
  dataDir: string;
  model: string;
}): Orchestrator {
  const db = new Database(join(config.dataDir, 'agent.db'));
  db.pragma('journal_mode = WAL');

  const autonomy = new AutonomyManager(db, config.autonomyConfig);

  return new OrchestratorImpl({
    llm: config.llmProvider,
    knowledge: config.knowledgeGraph,
    ipc: config.ipcClient,
    autonomy,
    db,
    model: config.model,
  });
}
