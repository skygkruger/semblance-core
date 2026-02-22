// Orchestrator — The main reasoning loop. Heart of Semblance.
// User message → knowledge search → LLM prompt → tool calls → autonomy → IPC → response.

import type { DatabaseHandle } from '../platform/types.js';
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
import { ApprovalPatternTracker, type ApprovalPattern } from './approval-patterns.js';
import type { StyleProfileStore, StyleProfile } from '../style/style-profile.js';
import { buildStylePrompt, buildInactiveStylePrompt, buildRetryPrompt, type DraftContext } from '../style/style-injector.js';
import { scoreDraft, type StyleScore } from '../style/style-scorer.js';

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
    name: 'fetch_inbox',
    description: 'Fetch recent emails from the user\'s inbox. Returns a summary of unread and recent messages with sender, subject, date, and AI-assigned priority.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max messages to return (default 20)' },
        unreadOnly: { type: 'boolean', description: 'Only return unread messages (default false)' },
        folder: { type: 'string', description: 'IMAP folder (default INBOX)' },
      },
    },
  },
  {
    name: 'search_emails',
    description: 'Search the user\'s indexed emails by keyword, sender, date range, or semantic meaning.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (natural language or keyword)' },
        from: { type: 'string', description: 'Filter by sender email or name' },
        dateAfter: { type: 'string', description: 'ISO date — only emails after this date' },
        dateBefore: { type: 'string', description: 'ISO date — only emails before this date' },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email on behalf of the user. In Guardian mode, this shows a preview and waits for approval. In Partner mode, routine responses are sent automatically; novel emails require approval. In Alter Ego mode, all emails are sent automatically.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Email body (plain text)' },
        replyToMessageId: { type: 'string', description: 'Message-ID to reply to (for threading)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'draft_email',
    description: 'Save an email draft without sending. Always available regardless of autonomy tier.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' } },
        cc: { type: 'array', items: { type: 'string' } },
        subject: { type: 'string' },
        body: { type: 'string' },
        replyToMessageId: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'archive_email',
    description: 'Archive one or more emails (move from INBOX to Archive/All Mail). In Partner mode, archiving routine emails is automatic.',
    parameters: {
      type: 'object',
      properties: {
        messageIds: { type: 'array', items: { type: 'string' }, description: 'Message IDs to archive' },
      },
      required: ['messageIds'],
    },
  },
  {
    name: 'categorize_email',
    description: 'Apply AI-determined categories and priority to emails. Always automatic — categorization is informational, not an action.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Category labels' },
        priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      },
      required: ['messageId', 'categories', 'priority'],
    },
  },
  {
    name: 'fetch_calendar',
    description: 'Fetch upcoming calendar events.',
    parameters: {
      type: 'object',
      properties: {
        daysAhead: { type: 'number', description: 'Number of days ahead to retrieve (default 7)' },
        includeAllDay: { type: 'boolean', description: 'Include all-day events (default true)' },
      },
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new calendar event. In Guardian mode, shows preview and waits. In Partner mode, routine scheduling is automatic. In Alter Ego mode, all scheduling is automatic.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startTime: { type: 'string', description: 'ISO 8601 start time' },
        endTime: { type: 'string', description: 'ISO 8601 end time' },
        description: { type: 'string' },
        location: { type: 'string' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
      },
      required: ['title', 'startTime', 'endTime'],
    },
  },
  {
    name: 'detect_calendar_conflicts',
    description: 'Check for scheduling conflicts with existing events. Returns conflicting events if any.',
    parameters: {
      type: 'object',
      properties: {
        startTime: { type: 'string' },
        endTime: { type: 'string' },
      },
      required: ['startTime', 'endTime'],
    },
  },
  {
    name: 'create_reminder',
    description: 'Create a reminder from natural language or structured input. In Guardian mode, shows preview and waits for approval. In Partner and Alter Ego mode, creates immediately.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Reminder text (natural language or structured)' },
        dueAt: { type: 'string', description: 'ISO 8601 due date/time (optional if using natural language parsing)' },
        recurrence: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly'], description: 'Recurrence pattern' },
      },
      required: ['text'],
    },
  },
  {
    name: 'list_reminders',
    description: 'List the user\'s reminders. Available in all autonomy tiers.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'fired', 'dismissed', 'snoozed', 'all'], description: 'Filter by status (default: all)' },
      },
    },
  },
  {
    name: 'snooze_reminder',
    description: 'Snooze a reminder for a specified duration. Available in all autonomy tiers.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Reminder ID' },
        duration: { type: 'string', enum: ['15min', '1hr', '3hr', 'tomorrow'], description: 'Snooze duration' },
      },
      required: ['id', 'duration'],
    },
  },
  {
    name: 'dismiss_reminder',
    description: 'Dismiss a reminder. Available in all autonomy tiers.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Reminder ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_web',
    description: 'Search the web for current information. Use for weather, news, prices, general knowledge, or any query the user\'s local data cannot answer. Available in all autonomy tiers (informational, not an action).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        count: { type: 'number', description: 'Number of results (default 5, max 20)' },
        freshness: { type: 'string', enum: ['day', 'week', 'month'], description: 'Recency filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch and extract content from a URL. Use when the user shares a link or asks to summarize an article. Available in all autonomy tiers (informational).',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        maxContentLength: { type: 'number', description: 'Max characters to return (default 50000)' },
      },
      required: ['url'],
    },
  },
];

// Map tool names to ActionTypes
const TOOL_ACTION_MAP: Record<string, ActionType> = {
  'send_email': 'email.send',
  'fetch_inbox': 'email.fetch',
  'draft_email': 'email.draft',
  'archive_email': 'email.archive',
  'fetch_calendar': 'calendar.fetch',
  'create_calendar_event': 'calendar.create',
  'search_web': 'web.search',
  'fetch_url': 'web.fetch',
  'create_reminder': 'reminder.create',
  'list_reminders': 'reminder.list',
  'snooze_reminder': 'reminder.update',
  'dismiss_reminder': 'reminder.update',
};

// Tools that are handled locally (no IPC needed)
const LOCAL_TOOLS = new Set([
  'search_files',
  'search_emails',
  'categorize_email',
  'detect_calendar_conflicts',
]);

// --- System Prompt ---

const SYSTEM_PROMPT = `You are Semblance, the user's personal AI. You run entirely on their device — their data never leaves their machine.

You have access to their local files, documents, emails, and calendar through secure tools. You can search, send emails, manage their calendar, and take autonomous actions based on their configured autonomy tier.

Core principles:
- You are helpful, warm, proactive, and concise
- You respect the user's privacy absolutely — all processing happens locally
- When you need information, search the user's knowledge base and indexed emails first
- When taking actions (sending emails, creating events), explain what you plan to do and why
- Be transparent about what data you're accessing and what actions you're taking
- Bias toward action — do things on the user's behalf, don't just show information

Available tools:
- search_files: Search the user's local documents and files
- fetch_inbox: Fetch recent emails with AI-assigned priority
- search_emails: Search indexed emails by keyword, sender, or date
- send_email: Send an email (autonomy tier determines if approval is needed)
- draft_email: Save an email draft (always available)
- archive_email: Archive emails from inbox
- categorize_email: Apply AI categories and priority to emails
- fetch_calendar: View upcoming calendar events
- create_calendar_event: Schedule a new event (checks for conflicts first)
- detect_calendar_conflicts: Check for scheduling conflicts

Always use tools when the user's request involves their data or external actions. Respond conversationally when the user just wants to chat.`;

// --- Orchestrator Interface ---

export interface Orchestrator {
  processMessage(message: string, conversationId?: string): Promise<OrchestratorResponse>;
  getConversation(conversationId: string): Promise<ConversationTurn[]>;
  approveAction(actionId: string): Promise<ActionResponse>;
  rejectAction(actionId: string): Promise<void>;
  getPendingActions(): Promise<AgentAction[]>;
  getApprovalCount(actionType: ActionType, payload: Record<string, unknown>): number;
  getApprovalThreshold(actionType: ActionType, payload: Record<string, unknown>): number;
  getApprovalPatterns(): ApprovalPattern[];
  /** The autonomy manager — exposed for escalation engine */
  readonly autonomy: AutonomyManager;
}

export interface OrchestratorResponse {
  message: string;
  conversationId: string;
  actions: AgentAction[];
  context: SearchResult[];
  tokensUsed: { prompt: number; completion: number };
  styleScore?: StyleScore;
}

// --- Implementation ---

export class OrchestratorImpl implements Orchestrator {
  private llm: LLMProvider;
  private knowledge: KnowledgeGraph;
  private ipc: IPCClient;
  readonly autonomy: AutonomyManager;
  private db: DatabaseHandle;
  private model: string;
  private patternTracker: ApprovalPatternTracker;
  private styleProfileStore: StyleProfileStore | null;
  private styleScoreThreshold: number;
  private lastStyleScore: StyleScore | null = null;

  constructor(config: {
    llm: LLMProvider;
    knowledge: KnowledgeGraph;
    ipc: IPCClient;
    autonomy: AutonomyManager;
    db: DatabaseHandle;
    model: string;
    styleProfileStore?: StyleProfileStore;
    styleScoreThreshold?: number;
  }) {
    this.llm = config.llm;
    this.knowledge = config.knowledge;
    this.ipc = config.ipc;
    this.autonomy = config.autonomy;
    this.db = config.db;
    this.model = config.model;
    this.patternTracker = new ApprovalPatternTracker(config.db);
    this.styleProfileStore = config.styleProfileStore ?? null;
    this.styleScoreThreshold = config.styleScoreThreshold ?? 70;
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
    this.lastStyleScore = null;

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
      styleScore: this.lastStyleScore ?? undefined,
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

    // Track approval pattern (foundation for Step 7 autonomy escalation)
    if (response.status === 'success') {
      this.patternTracker.recordApproval(action, payload);
    }

    return response;
  }

  async rejectAction(actionId: string): Promise<void> {
    // Get action details before rejecting (for pattern tracking)
    const row = this.db.prepare(
      'SELECT action, payload FROM pending_actions WHERE id = ? AND status = \'pending_approval\''
    ).get(actionId) as { action: string; payload: string } | undefined;

    this.db.prepare(
      'UPDATE pending_actions SET status = \'rejected\' WHERE id = ? AND status = \'pending_approval\''
    ).run(actionId);

    // Track rejection pattern (resets consecutive approvals)
    if (row) {
      const action = row.action as ActionType;
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      this.patternTracker.recordRejection(action, payload);
    }
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

  getApprovalCount(actionType: ActionType, payload: Record<string, unknown>): number {
    return this.patternTracker.getConsecutiveApprovals(actionType, payload);
  }

  getApprovalThreshold(actionType: ActionType, payload: Record<string, unknown>): number {
    return this.patternTracker.getThreshold(actionType, payload);
  }

  getApprovalPatterns(): ApprovalPattern[] {
    return this.patternTracker.getAllPatterns();
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
      // Handle local-only tools (no IPC needed)
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

      if (tc.name === 'search_emails') {
        // Search indexed emails locally — no Gateway needed
        const results = await this.knowledge.search(tc.arguments['query'] as string, {
          limit: 10,
          source: 'email',
        });
        executedResults.push({
          tool: 'search_emails',
          result: results.map(r => ({
            title: r.document.title,
            content: r.chunk.content.slice(0, 300),
            score: r.score,
            metadata: r.document.metadata,
          })),
        });
        continue;
      }

      if (tc.name === 'categorize_email') {
        // Categorization is informational — always auto-execute, local-only
        executedResults.push({
          tool: 'categorize_email',
          result: {
            messageId: tc.arguments['messageId'],
            categories: tc.arguments['categories'],
            priority: tc.arguments['priority'],
          },
        });
        continue;
      }

      if (tc.name === 'detect_calendar_conflicts') {
        // Conflict detection is read-only local query
        const conflicts = await this.knowledge.search(
          `calendar event ${tc.arguments['startTime']} ${tc.arguments['endTime']}`,
          { limit: 10, source: 'calendar' },
        );
        executedResults.push({
          tool: 'detect_calendar_conflicts',
          result: {
            conflicts: conflicts.map(c => ({
              title: c.document.title,
              metadata: c.document.metadata,
            })),
            hasConflicts: conflicts.length > 0,
          },
        });
        continue;
      }

      // --- Style-enhanced drafting for email tools ---
      if ((tc.name === 'draft_email' || tc.name === 'send_email') && tc.arguments['body']) {
        const styled = await this.applyStyleToDraft(tc.arguments);
        tc.arguments['body'] = styled.body;
        if (styled.styleScore) {
          this.lastStyleScore = styled.styleScore;
        }
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
        } catch {
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

  /**
   * Apply style profile to an email draft. If profile is active, regenerates
   * the body using style injection and scores the result. Retries up to 2 times
   * if below threshold.
   */
  private async applyStyleToDraft(
    args: Record<string, unknown>,
  ): Promise<{ body: string; styleScore: StyleScore | null }> {
    if (!this.styleProfileStore) {
      return { body: args['body'] as string, styleScore: null };
    }

    const profile = this.styleProfileStore.getActiveProfile();
    if (!profile) {
      return { body: args['body'] as string, styleScore: null };
    }

    const draftContext: DraftContext = {
      recipientEmail: Array.isArray(args['to']) ? (args['to'] as string[])[0] : undefined,
      recipientName: undefined,
      isReply: !!args['replyToMessageId'],
      subject: (args['subject'] as string) ?? '',
    };

    const stylePrompt = profile.isActive
      ? buildStylePrompt(profile, draftContext)
      : buildInactiveStylePrompt();

    const originalBody = args['body'] as string;
    let bestBody = originalBody;
    let bestScore: StyleScore | null = null;

    // Generate styled draft with up to 2 retries
    const maxAttempts = profile.isActive ? 3 : 1; // Only retry with active profile

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let prompt = `${stylePrompt}\n\nDraft this email:\nTo: ${Array.isArray(args['to']) ? (args['to'] as string[]).join(', ') : ''}\nSubject: ${args['subject'] ?? ''}\n\nOriginal draft intent:\n${originalBody}`;

      if (attempt > 0 && bestScore && profile.isActive) {
        const weakDimensions = Object.entries(bestScore.breakdown)
          .map(([name, score]) => ({ name, score }))
          .sort((a, b) => a.score - b.score);
        const retryHint = buildRetryPrompt(weakDimensions, profile);
        if (retryHint) {
          prompt += `\n\n${retryHint}`;
        }
      }

      try {
        const response = await this.llm.chat({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are drafting an email. Output ONLY the email body text, nothing else.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        });

        const generatedBody = response.message.content.trim();

        if (profile.isActive) {
          const score = scoreDraft(generatedBody, profile);

          if (!bestScore || score.overall > bestScore.overall) {
            bestBody = generatedBody;
            bestScore = score;
          }

          if (score.overall >= this.styleScoreThreshold) {
            break; // Good enough, stop retrying
          }
        } else {
          bestBody = generatedBody;
          break;
        }
      } catch {
        // LLM call failed — keep the original body
        break;
      }
    }

    return { body: bestBody, styleScore: bestScore };
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
