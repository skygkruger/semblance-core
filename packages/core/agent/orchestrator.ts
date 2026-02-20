// Orchestrator — The main reasoning loop. Heart of Semblance.
// User message → knowledge search → LLM prompt → tool calls → autonomy → IPC → response.

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type {
  LLMProvider,
  ChatMessage,
  ToolDefinition,
  ToolCall,
} from '../llm/types.js';
import type { KnowledgeGraph, SearchResult } from '../knowledge/index.js';
import type { IPCClient } from './ipc-client.js';
import { AutonomyManager, type AutonomyDecision } from './autonomy.js';
import type {
  AgentAction,
  ConversationTurn,
  AutonomyConfig,
  AutonomyDomain,
} from './types.js';
import type { ActionType, ActionResponse } from '../types/ipc.js';

// --- Conversation Storage ---

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    title TEXT
  );

  CREATE TABLE IF NOT EXISTS conversation_turns (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    context_json TEXT,
    actions_json TEXT,
    tokens_prompt INTEGER,
    tokens_completion INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_turns_conversation ON conversation_turns(conversation_id);

  CREATE TABLE IF NOT EXISTS pending_actions (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    domain TEXT NOT NULL,
    tier TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_approval',
    created_at TEXT NOT NULL,
    executed_at TEXT,
    response_json TEXT
  );
`;

// --- Tool Definitions (map to ActionTypes) ---

const TOOLS: ToolDefinition[] = [
  {
    name: 'search_files',
    description: 'Search the user\'s local files and documents for relevant information',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email on behalf of the user',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Recipients' },
        subject: { type: 'string' },
        body: { type: 'string' },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'fetch_email',
    description: 'Fetch recent emails from the user\'s inbox',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Email folder (default: INBOX)' },
        limit: { type: 'number', description: 'Max emails to fetch' },
      },
    },
  },
  {
    name: 'fetch_calendar',
    description: 'Fetch calendar events within a date range',
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date (ISO 8601)' },
        endDate: { type: 'string', description: 'End date (ISO 8601)' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new calendar event',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startTime: { type: 'string', description: 'Start time (ISO 8601)' },
        endTime: { type: 'string', description: 'End time (ISO 8601)' },
        description: { type: 'string' },
      },
      required: ['title', 'startTime', 'endTime'],
    },
  },
];

// Map tool names to ActionTypes
const TOOL_ACTION_MAP: Record<string, ActionType> = {
  'send_email': 'email.send',
  'fetch_email': 'email.fetch',
  'fetch_calendar': 'calendar.fetch',
  'create_calendar_event': 'calendar.create',
};

// --- System Prompt ---

const SYSTEM_PROMPT = `You are Semblance, the user's personal AI. You run entirely on their device — their data never leaves their machine.

You have access to their local files, documents, emails, and calendar through secure tools. You can search their knowledge base, send emails on their behalf, and manage their calendar.

Core principles:
- You are helpful, warm, proactive, and concise
- You respect the user's privacy absolutely — all processing happens locally
- When you need information, search the user's knowledge base first
- When taking actions (sending emails, creating events), explain what you plan to do and why
- Be transparent about what data you're accessing and what actions you're taking

Available tools:
- search_files: Search the user's local documents and files
- send_email: Send an email (requires user approval)
- fetch_email: Check the user's inbox
- fetch_calendar: View upcoming calendar events
- create_calendar_event: Schedule a new event

Always use tools when the user's request involves their data or external actions. Respond conversationally when the user just wants to chat.`;

// --- Orchestrator Interface ---

export interface Orchestrator {
  processMessage(message: string, conversationId?: string): Promise<OrchestratorResponse>;
  getConversation(conversationId: string): Promise<ConversationTurn[]>;
  approveAction(actionId: string): Promise<ActionResponse>;
  rejectAction(actionId: string): Promise<void>;
  getPendingActions(): Promise<AgentAction[]>;
}

export interface OrchestratorResponse {
  message: string;
  conversationId: string;
  actions: AgentAction[];
  context: SearchResult[];
  tokensUsed: { prompt: number; completion: number };
}

// --- Implementation ---

export class OrchestratorImpl implements Orchestrator {
  private llm: LLMProvider;
  private knowledge: KnowledgeGraph;
  private ipc: IPCClient;
  private autonomy: AutonomyManager;
  private db: Database.Database;
  private model: string;

  constructor(config: {
    llm: LLMProvider;
    knowledge: KnowledgeGraph;
    ipc: IPCClient;
    autonomy: AutonomyManager;
    db: Database.Database;
    model: string;
  }) {
    this.llm = config.llm;
    this.knowledge = config.knowledge;
    this.ipc = config.ipc;
    this.autonomy = config.autonomy;
    this.db = config.db;
    this.model = config.model;
    this.db.exec(CREATE_TABLES);
  }

  async processMessage(message: string, conversationId?: string): Promise<OrchestratorResponse> {
    // Get or create conversation
    const convId = conversationId ?? this.createConversation();

    // Step 1: Search knowledge graph for context
    const context = await this.knowledge.search(message, { limit: 5 });

    // Step 2: Build conversation history
    const history = conversationId ? await this.getConversation(convId) : [];

    // Step 3: Construct messages for LLM
    const messages = this.buildMessages(message, context, history);

    // Step 4: Call LLM with tools
    const response = await this.llm.chat({
      model: this.model,
      messages,
      tools: TOOLS,
      temperature: 0.7,
    });

    // Step 5: Process tool calls
    const actions: AgentAction[] = [];
    let finalMessage = response.message.content;

    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolResults = await this.processToolCalls(response.toolCalls, context);
      actions.push(...toolResults.actions);

      // If any tools were executed, send results back to LLM for final response
      if (toolResults.executedResults.length > 0) {
        const followUpMessages = [
          ...messages,
          { role: 'assistant' as const, content: response.message.content },
          {
            role: 'user' as const,
            content: `Tool results:\n${toolResults.executedResults.map(r =>
              `${r.tool}: ${JSON.stringify(r.result)}`
            ).join('\n')}`,
          },
        ];

        const followUp = await this.llm.chat({
          model: this.model,
          messages: followUpMessages,
          temperature: 0.7,
        });
        finalMessage = followUp.message.content;
      }

      // Mention pending approvals
      const pendingCount = actions.filter(a => a.status === 'pending_approval').length;
      if (pendingCount > 0) {
        finalMessage += `\n\n[${pendingCount} action(s) awaiting your approval]`;
      }
    }

    // Step 6: Store conversation turns
    this.storeTurn(convId, 'user', message, context, null, 0, 0);
    this.storeTurn(
      convId, 'assistant', finalMessage, null, actions,
      response.tokensUsed.prompt, response.tokensUsed.completion,
    );

    return {
      message: finalMessage,
      conversationId: convId,
      actions,
      context,
      tokensUsed: response.tokensUsed,
    };
  }

  async getConversation(conversationId: string): Promise<ConversationTurn[]> {
    const rows = this.db.prepare(
      'SELECT * FROM conversation_turns WHERE conversation_id = ? ORDER BY timestamp ASC'
    ).all(conversationId) as {
      id: string;
      role: string;
      content: string;
      timestamp: string;
      context_json: string | null;
      actions_json: string | null;
    }[];

    return rows.map(r => ({
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      timestamp: r.timestamp,
      context: r.context_json ? JSON.parse(r.context_json) as SearchResult[] : undefined,
      actions: r.actions_json ? JSON.parse(r.actions_json) as AgentAction[] : undefined,
    }));
  }

  async approveAction(actionId: string): Promise<ActionResponse> {
    const row = this.db.prepare(
      'SELECT * FROM pending_actions WHERE id = ? AND status = \'pending_approval\''
    ).get(actionId) as {
      id: string;
      action: string;
      payload: string;
      domain: string;
      tier: string;
    } | undefined;

    if (!row) {
      throw new Error(`Action ${actionId} not found or not pending approval`);
    }

    const action = row.action as ActionType;
    const payload = JSON.parse(row.payload) as Record<string, unknown>;

    // Execute via IPC
    const response = await this.ipc.sendAction(action, payload);

    // Update status
    this.db.prepare(
      'UPDATE pending_actions SET status = ?, executed_at = ?, response_json = ? WHERE id = ?'
    ).run(
      response.status === 'success' ? 'executed' : 'failed',
      new Date().toISOString(),
      JSON.stringify(response),
      actionId,
    );

    return response;
  }

  async rejectAction(actionId: string): Promise<void> {
    this.db.prepare(
      'UPDATE pending_actions SET status = \'rejected\' WHERE id = ? AND status = \'pending_approval\''
    ).run(actionId);
  }

  async getPendingActions(): Promise<AgentAction[]> {
    const rows = this.db.prepare(
      'SELECT * FROM pending_actions WHERE status = \'pending_approval\' ORDER BY created_at ASC'
    ).all() as {
      id: string;
      action: string;
      payload: string;
      reasoning: string;
      domain: string;
      tier: string;
      status: string;
      created_at: string;
    }[];

    return rows.map(r => ({
      id: r.id,
      action: r.action as ActionType,
      payload: JSON.parse(r.payload) as Record<string, unknown>,
      reasoning: r.reasoning,
      domain: r.domain as AutonomyDomain,
      tier: r.tier as AgentAction['tier'],
      status: r.status as AgentAction['status'],
      createdAt: r.created_at,
    }));
  }

  // --- Private helpers ---

  private buildMessages(
    message: string,
    context: SearchResult[],
    history: ConversationTurn[],
  ): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add context from knowledge graph
    if (context.length > 0) {
      const contextStr = context.map((r, i) =>
        `[${i + 1}] ${r.document.title} (${r.document.source}): ${r.chunk.content.slice(0, 500)}`
      ).join('\n\n');
      messages.push({
        role: 'system',
        content: `Relevant context from the user's knowledge base:\n${contextStr}`,
      });
    }

    // Add recent conversation history (last 10 turns)
    const recentHistory = history.slice(-10);
    for (const turn of recentHistory) {
      messages.push({
        role: turn.role,
        content: turn.content,
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    return messages;
  }

  private async processToolCalls(
    toolCalls: ToolCall[],
    context: SearchResult[],
  ): Promise<{
    actions: AgentAction[];
    executedResults: Array<{ tool: string; result: unknown }>;
  }> {
    const actions: AgentAction[] = [];
    const executedResults: Array<{ tool: string; result: unknown }> = [];

    for (const tc of toolCalls) {
      // Handle local tools (search_files doesn't go through Gateway)
      if (tc.name === 'search_files') {
        const query = tc.arguments['query'] as string;
        const results = await this.knowledge.search(query, { limit: 5 });
        executedResults.push({
          tool: 'search_files',
          result: results.map(r => ({
            title: r.document.title,
            content: r.chunk.content.slice(0, 500),
            score: r.score,
          })),
        });
        continue;
      }

      // Gateway-routed tools
      const actionType = TOOL_ACTION_MAP[tc.name];
      if (!actionType) continue;

      const domain = this.autonomy.getDomainForAction(actionType);
      const tier = this.autonomy.getDomainTier(domain);
      const decision = this.autonomy.decide(actionType);

      const agentAction: AgentAction = {
        id: nanoid(),
        action: actionType,
        payload: tc.arguments,
        reasoning: `LLM requested ${tc.name} based on conversation context`,
        domain,
        tier,
        status: 'pending_approval',
        createdAt: new Date().toISOString(),
      };

      if (decision === 'auto_approve') {
        // Execute immediately
        try {
          const response = await this.ipc.sendAction(actionType, tc.arguments);
          agentAction.status = response.status === 'success' ? 'executed' : 'failed';
          agentAction.executedAt = new Date().toISOString();
          agentAction.response = response;
          executedResults.push({ tool: tc.name, result: response.data });
        } catch (err) {
          agentAction.status = 'failed';
        }
      } else {
        // Queue for approval
        this.db.prepare(`
          INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?)
        `).run(
          agentAction.id,
          agentAction.action,
          JSON.stringify(agentAction.payload),
          agentAction.reasoning,
          agentAction.domain,
          agentAction.tier,
          agentAction.createdAt,
        );
      }

      actions.push(agentAction);
    }

    return { actions, executedResults };
  }

  private createConversation(): string {
    const id = nanoid();
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)'
    ).run(id, now, now);
    return id;
  }

  private storeTurn(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    context: SearchResult[] | null,
    actions: AgentAction[] | null,
    tokensPrompt: number,
    tokensCompletion: number,
  ): void {
    const id = nanoid();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO conversation_turns (id, conversation_id, role, content, timestamp, context_json, actions_json, tokens_prompt, tokens_completion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      conversationId,
      role,
      content,
      now,
      context ? JSON.stringify(context) : null,
      actions ? JSON.stringify(actions) : null,
      tokensPrompt,
      tokensCompletion,
    );

    // Update conversation timestamp
    this.db.prepare(
      'UPDATE conversations SET updated_at = ? WHERE id = ?'
    ).run(now, conversationId);
  }
}
