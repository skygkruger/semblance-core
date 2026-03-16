// Orchestrator — The main reasoning loop. Heart of Semblance.
// User message → knowledge search → LLM prompt → tool calls → autonomy → IPC → response.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type {
  LLMProvider,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  GenerateRequest,
} from '../llm/types.js';
import type { KnowledgeGraph, SearchResult } from '../knowledge/index.js';
import type { KnowledgeCurator } from '../knowledge/knowledge-curator.js';
import type { VisualizationCategory } from '../knowledge/connector-category-map.js';
import type { IPCClient } from './ipc-client.js';
import { AutonomyManager, type AutonomyDecision } from './autonomy.js';
import { ARTIFACT_SYSTEM_PROMPT } from './artifact-parser.js';
import type {
  AgentAction,
  ConversationTurn,
  AutonomyConfig,
  AutonomyDomain,
  ReasoningContext,
  ReasoningChunkRef,
} from './types.js';
import type { ActionType, ActionResponse } from '../types/ipc.js';
import { ApprovalPatternTracker, type ApprovalPattern } from './approval-patterns.js';
import type { StyleProfileStore, StyleProfile } from '../style/style-profile.js';
import { buildStylePrompt, buildInactiveStylePrompt, buildRetryPrompt, type DraftContext } from '../style/style-injector.js';
import { scoreDraft, type StyleScore } from '../style/style-scorer.js';
import type { DocumentContextManager } from './document-context.js';
import type { ContactResolver } from '../knowledge/contacts/contact-resolver.js';
import type { ResolvedContactResult } from '../knowledge/contacts/contact-types.js';
import type { MessageDrafter } from './messaging/message-drafter.js';
import type { ExtensionTool, ToolHandler } from '../extensions/types.js';
import { BoundaryEnforcer, type EscalationBoundary } from './escalation-boundaries.js';
import { sanitizeRetrievedContent, wrapInDataBoundary, INJECTION_CANARY } from './content-sanitizer.js';
import type { IntentManager } from './intent-manager.js';
import type { AlterEgoGuardrails } from './alter-ego-guardrails.js';
import type { AlterEgoStore } from './alter-ego-store.js';
import { ACTION_RISK_MAP } from './autonomy.js';

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
    response_json TEXT,
    reasoning_context TEXT
  );
`;

// --- Tool Definitions (map to ActionTypes) ---

const BASE_TOOLS: ToolDefinition[] = [
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
    description: 'Send an email on behalf of the user.',
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
    description: 'Archive one or more emails (move from INBOX to Archive/All Mail).',
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
    description: 'Create a new calendar event.',
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
    name: 'deep_search_web',
    description: 'Search the web AND fetch the actual content of the top results. Use this instead of search_web when you need to answer questions from web content, not just find links. Returns full page content for synthesis. Preferred for question-answering tasks.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        resultCount: { type: 'number', description: 'How many results to retrieve, default 3, max 5' },
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
  {
    name: 'send_text',
    description: 'Send a text message (SMS) on behalf of the user.',
    parameters: {
      type: 'object',
      properties: {
        recipientName: { type: 'string', description: 'Name of the person to text' },
        intent: { type: 'string', description: 'What the user wants to say (natural language)' },
      },
      required: ['recipientName', 'intent'],
    },
  },
  {
    name: 'get_weather',
    description: 'Get current weather conditions and forecast. Use when the user asks about weather, temperature, rain, or needs weather context for planning. Available in all autonomy tiers (informational, not an action).',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City or location name (optional — uses current location if not specified)' },
        hours: { type: 'number', description: 'Forecast hours ahead (default 24, max 48)' },
      },
    },
  },
  {
    name: 'search_cloud_files',
    description: 'Search cloud-synced files (Google Drive, Dropbox, etc.) that have been indexed locally. Returns matching documents from the local knowledge index — no network access needed.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (natural language or keyword)' },
        provider: { type: 'string', description: 'Filter by cloud provider (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'save_file',
    description: 'Save content to a file on the user\'s filesystem. Use for documents, exports, generated reports, code files, and any content the user wants to keep. Always confirm the filename and location with the user before saving unless they have explicitly specified both.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Filename including extension (e.g. "report.md", "script.py", "notes.txt")',
        },
        content: {
          type: 'string',
          description: 'Full content to write to the file',
        },
        directory: {
          type: 'string',
          description: 'Target directory. Use "downloads" for user Downloads folder, "documents" for Documents, or an absolute path. Default: "downloads".',
        },
        overwrite: {
          type: 'boolean',
          description: 'Whether to overwrite if file exists. Default: false — append a timestamp suffix if file exists.',
        },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'knowledge_remove',
    description: 'Remove a document chunk from the knowledge graph. The source file remains on disk — only the graph index entry and embedding are deleted. Use when the user wants to declutter their knowledge graph or remove irrelevant items.',
    parameters: {
      type: 'object',
      properties: {
        chunkId: { type: 'string', description: 'The document chunk ID to remove from the graph' },
        reason: { type: 'string', description: 'Why the item is being removed (logged to audit trail)' },
      },
      required: ['chunkId'],
    },
  },
  {
    name: 'knowledge_recategorize',
    description: 'Change the visualization category of a knowledge item. Use when the user wants to reorganize their knowledge graph, e.g. move a document from "work" to "reading" category.',
    parameters: {
      type: 'object',
      properties: {
        chunkId: { type: 'string', description: 'The document chunk ID to recategorize' },
        newCategory: { type: 'string', description: 'Target visualization category (e.g., "health", "finance", "social", "work", "reading", "music", "cloud", "browser", "people", "knowledge")' },
      },
      required: ['chunkId', 'newCategory'],
    },
  },
  // ─── New Tools: Contacts ─────────────────────────────────────────────────
  {
    name: 'search_contacts',
    description: 'Search the user\'s contacts by name, email, phone, organization, or relationship. Returns matching contacts with their details.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (name, email, company, etc.)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_contact',
    description: 'Get detailed information about a specific contact by name. Returns their email, phone, organization, relationship type, birthday, and interaction history.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contact name to look up' },
      },
      required: ['name'],
    },
  },
  // ─── New Tools: Calendar Management ──────────────────────────────────────
  {
    name: 'update_calendar_event',
    description: 'Update an existing calendar event. Use when the user wants to reschedule, change the title, add attendees, or modify any event details.',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'ID of the event to update' },
        title: { type: 'string', description: 'New title (optional)' },
        startTime: { type: 'string', description: 'New start time ISO 8601 (optional)' },
        endTime: { type: 'string', description: 'New end time ISO 8601 (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        location: { type: 'string', description: 'New location (optional)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Updated attendee list (optional)' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete a calendar event. Use when the user wants to cancel an appointment or remove an event from their calendar.',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'ID of the event to delete' },
        reason: { type: 'string', description: 'Why the event is being deleted (logged to audit trail)' },
      },
      required: ['eventId'],
    },
  },
  // ─── New Tools: Email Management ────────────────────────────────────────
  {
    name: 'move_email',
    description: 'Move emails to a specific folder/label. Use when the user wants to organize their inbox, move emails to folders like Work, Personal, etc.',
    parameters: {
      type: 'object',
      properties: {
        messageIds: { type: 'array', items: { type: 'string' }, description: 'Message IDs to move' },
        toFolder: { type: 'string', description: 'Destination folder name (e.g., "Work", "Archive", "Trash")' },
      },
      required: ['messageIds', 'toFolder'],
    },
  },
  {
    name: 'mark_email_read',
    description: 'Mark emails as read or unread. Use when the user wants to clean up their unread count or mark something to revisit later.',
    parameters: {
      type: 'object',
      properties: {
        messageIds: { type: 'array', items: { type: 'string' }, description: 'Message IDs to update' },
        read: { type: 'boolean', description: 'true to mark as read, false to mark as unread' },
      },
      required: ['messageIds', 'read'],
    },
  },
  // ─── New Tools: Reminders ───────────────────────────────────────────────
  {
    name: 'delete_reminder',
    description: 'Permanently delete a reminder. Use when the user wants to completely remove a reminder, not just dismiss it.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Reminder ID to delete' },
      },
      required: ['id'],
    },
  },
  // ─── New Tools: Finance ─────────────────────────────────────────────────
  {
    name: 'get_subscriptions',
    description: 'Get the user\'s detected recurring charges and subscriptions. Shows what they\'re paying for monthly/yearly, including forgotten subscriptions. Use when the user asks about their subscriptions, recurring charges, or monthly expenses.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'cancelled', 'forgotten', 'all'], description: 'Filter by subscription status (default: all)' },
      },
    },
  },
  {
    name: 'get_financial_summary',
    description: 'Get a summary of the user\'s financial transactions. Shows total spending, top merchants, category breakdown. Use when the user asks about their spending, budget, or financial overview.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look back (default: 30)' },
      },
    },
  },
  // ─── New Tools: Health ──────────────────────────────────────────────────
  {
    name: 'get_health_entries',
    description: 'Get the user\'s health tracking entries (mood, energy, water intake, symptoms, medications). Use when the user asks about their health trends, how they\'ve been feeling, or wants to review their wellness data.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look back (default: 7)' },
      },
    },
  },
  {
    name: 'add_health_entry',
    description: 'Log a health entry for the user. Use when the user mentions their mood, energy level, water intake, symptoms, or medications. Parse natural language into structured health data.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
        mood: { type: 'number', description: 'Mood rating 1-5 (1=very low, 5=great)' },
        energy: { type: 'number', description: 'Energy rating 1-5 (1=exhausted, 5=energized)' },
        waterGlasses: { type: 'number', description: 'Number of glasses of water' },
        symptoms: { type: 'array', items: { type: 'string' }, description: 'List of symptoms' },
        medications: { type: 'array', items: { type: 'string' }, description: 'List of medications taken' },
        notes: { type: 'string', description: 'Free-text health notes' },
      },
    },
  },
];

// Map tool names to ActionTypes
const BASE_TOOL_ACTION_MAP: Record<string, ActionType> = {
  'send_email': 'email.send',
  'fetch_inbox': 'email.fetch',
  'draft_email': 'email.draft',
  'archive_email': 'email.archive',
  'fetch_calendar': 'calendar.fetch',
  'create_calendar_event': 'calendar.create',
  'search_web': 'web.search',
  'deep_search_web': 'web.deep_search',
  'fetch_url': 'web.fetch',
  'create_reminder': 'reminder.create',
  'list_reminders': 'reminder.list',
  'snooze_reminder': 'reminder.update',
  'dismiss_reminder': 'reminder.update',
  'send_text': 'messaging.send',
  'get_weather': 'location.weather_query',
  'save_file': 'file.write',
  'update_calendar_event': 'calendar.update',
  'delete_calendar_event': 'calendar.delete',
  'move_email': 'email.move',
  'mark_email_read': 'email.markRead',
  'delete_reminder': 'reminder.delete',
};

// Tools that are handled locally (no IPC needed)
const BASE_LOCAL_TOOLS = new Set([
  'search_files',
  'search_emails',
  'categorize_email',
  'detect_calendar_conflicts',
  'search_cloud_files',
  'knowledge_remove',
  'knowledge_recategorize',
  'search_contacts',
  'get_contact',
  'get_subscriptions',
  'get_financial_summary',
  'get_health_entries',
  'add_health_entry',
]);

// --- System Prompt ---

const VOICE_MODE_CONTEXT = `The user is in voice conversation mode. Keep responses concise and conversational — they will be spoken aloud. Avoid long lists, code blocks, and complex formatting.`;

export interface SystemPromptConfig {
  aiName: string;
  userName?: string;
  autonomyTier: 'guardian' | 'partner' | 'alter_ego';
  connectedServices?: string[];
  indexedDocCount?: number;
}

function buildSystemPrompt(config: SystemPromptConfig, conversational?: boolean): string {
  const { aiName, userName, autonomyTier, connectedServices, indexedDocCount } = config;
  const userRef = userName ? userName : 'the user';

  // For conversational messages (greetings, small talk), use a minimal prompt
  // that gives the model NO operational context to fabricate from.
  // Small models (7-8B) will invent "I archived 17 emails" or "you have a meeting at 2 PM"
  // if they see service names or autonomy descriptions in the system prompt.
  if (conversational) {
    const userNameLine = userName ? ` Your user's name is ${userName}.` : '';
    return `You are ${aiName}, a personal AI assistant.${userNameLine} You run locally on ${userRef}'s device. All data stays private.

You are warm, direct, and concise. Respond naturally like a helpful friend. Just chat back naturally. Do not make up any information about emails, meetings, schedules, or actions you have taken. Only discuss things you actually know.

Your name is ${aiName}.${userName ? ` Your user's name is ${userName}.` : ' You do not know your user\'s name yet. You MUST ask them what their name is. Do NOT guess or make up a name.'}

${INJECTION_CANARY}`;
  }

  // Autonomy behavior — no specific action examples (small models parrot them as fabricated actions)
  const autonomyBlock = autonomyTier === 'guardian'
    ? `Autonomy: Guardian. All actions require ${userRef}'s explicit approval before execution. Always preview what you plan to do.`
    : autonomyTier === 'alter_ego'
    ? `Autonomy: Alter Ego. Act on ${userRef}'s behalf for routine tasks. Only pause for genuinely high-stakes or novel actions. When you act autonomously, briefly state what you did and why.`
    : `Autonomy: Partner. Routine actions execute automatically. Novel or sensitive actions require approval. When you act autonomously, briefly state what you did.`;

  // Dynamic context sections
  const servicesLine = connectedServices && connectedServices.length > 0
    ? `\nConnected services: ${connectedServices.join(', ')}.`
    : '';
  const knowledgeLine = indexedDocCount && indexedDocCount > 0
    ? `\nKnowledge base: ${indexedDocCount} indexed documents. Search it first before using web search.`
    : '';

  // NOTE: Tool definitions with full parameters are injected separately by the LLM provider.
  // This prompt gives behavioral guidance only — no tool listing to avoid duplication.
  // System prompt optimized for small models (7-8B).
  // Rules: no examples they can parrot, no meta-instructions they'll output verbatim.
  // System prompt kept SHORT for small models (10B, 2048 context).
  // Every extra token here is a token stolen from the actual conversation.
  const nameLine = userName
    ? `Your name is ${aiName}. The user's name is ${userName}.`
    : `Your name is ${aiName}. Ask the user their name if you don't know it.`;

  return `${nameLine} You are a personal AI running locally on the user's device. All data is private.${servicesLine}${knowledgeLine}

${autonomyBlock}

Be warm, direct, and concise. Never use emojis. Never invent data — if you don't have real data, say so. You have access to the user's email, calendar, files, and web search through your tools. If asked about yourself: you are Semblance, a local AI by VERIDIAN SYNTHETICS — all on-device.

${INJECTION_CANARY}`;
}

// Default prompt for when config isn't available yet (first message before prefs load)
const DEFAULT_SYSTEM_PROMPT = buildSystemPrompt({
  aiName: 'Semblance',
  autonomyTier: 'partner',
});

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
  /** Set voice mode active/inactive (affects system prompt) */
  setVoiceMode(active: boolean): void;
  /** Update system prompt config (AI name, user name, connected services, doc count) */
  updatePromptConfig(updates: Partial<SystemPromptConfig>): void;
  /** Register extension tools for LLM dispatch */
  registerTools(tools: ExtensionTool[]): void;
  /** Set the intent manager for values/limits context (optional) */
  setIntentManager?(manager: IntentManager): void;
  setAlterEgoGuardrails?(guardrails: AlterEgoGuardrails, store: AlterEgoStore): void;
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
  private documentContext: DocumentContextManager | null;
  private contactResolver: ContactResolver | null;
  private messageDrafter: MessageDrafter | null;
  private voiceModeActive = false;
  private boundaryEnforcer: BoundaryEnforcer;
  private intentManager: IntentManager | null;
  private alterEgoGuardrails: AlterEgoGuardrails | null;
  private alterEgoStore: AlterEgoStore | null;
  private knowledgeCurator: KnowledgeCurator | null = null;
  private promptConfig: SystemPromptConfig;
  // Extension support
  private extensionToolHandlers: Map<string, ToolHandler> = new Map();
  private allTools: ToolDefinition[] = [...BASE_TOOLS];
  private allLocalTools: Set<string> = new Set(BASE_LOCAL_TOOLS);
  private allToolActionMap: Record<string, ActionType> = { ...BASE_TOOL_ACTION_MAP };

  constructor(config: {
    llm: LLMProvider;
    knowledge: KnowledgeGraph;
    ipc: IPCClient;
    autonomy: AutonomyManager;
    db: DatabaseHandle;
    model: string;
    styleProfileStore?: StyleProfileStore;
    styleScoreThreshold?: number;
    documentContext?: DocumentContextManager;
    contactResolver?: ContactResolver;
    messageDrafter?: MessageDrafter;
    voiceModeActive?: boolean;
    intentManager?: IntentManager;
    alterEgoGuardrails?: AlterEgoGuardrails;
    alterEgoStore?: AlterEgoStore;
    aiName?: string;
    userName?: string;
    connectedServices?: string[];
    indexedDocCount?: number;
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
    this.documentContext = config.documentContext ?? null;
    this.contactResolver = config.contactResolver ?? null;
    this.messageDrafter = config.messageDrafter ?? null;
    this.voiceModeActive = config.voiceModeActive ?? false;
    this.boundaryEnforcer = new BoundaryEnforcer(config.db);
    this.intentManager = config.intentManager ?? null;
    this.alterEgoGuardrails = config.alterEgoGuardrails ?? null;
    this.alterEgoStore = config.alterEgoStore ?? null;
    // Use the 'email' domain as a representative autonomy tier for the prompt —
    // email is the most common action domain and Partner is the onboarding default
    const representativeTier = this.autonomy.getDomainTier('email');
    this.promptConfig = {
      aiName: config.aiName ?? 'Semblance',
      userName: config.userName,
      autonomyTier: representativeTier,
      connectedServices: config.connectedServices,
      indexedDocCount: config.indexedDocCount,
    };
    this.db.exec(CREATE_TABLES);
    // Migration: add reasoning_context column to existing pending_actions tables
    try {
      this.db.exec('ALTER TABLE pending_actions ADD COLUMN reasoning_context TEXT');
    } catch {
      // Column already exists — ignore
    }
  }

  /** Update the active model name (e.g., after switching to Ollama). */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Detect messages that are conversational and don't need tool access.
   * For small models (7-8B), passing tools causes them to hallucinate tool
   * usage or narrate planned actions instead of responding naturally.
   */
  private isConversationalMessage(message: string): boolean {
    const lower = message.toLowerCase().trim();
    const wordCount = lower.split(/\s+/).length;

    // Short greetings and small talk
    if (wordCount <= 4) {
      const greetings = /^(hi|hello|hey|howdy|sup|yo|good\s*(morning|afternoon|evening|night)|thanks|thank you|bye|goodbye|ok|okay|sure|yes|no|nah|yep|nope|cool|great|nice|hm+|huh|what'?s?\s*up)/;
      if (greetings.test(lower)) return true;
    }

    // Questions about the AI itself or the user that are answerable from the system prompt
    const selfReferential = /(?:what(?:'s| is) your name|who are you|what can you do|what are you|tell me (?:about yourself|your name|my name)|what(?:'s| is) my name|how are you)/;
    if (selfReferential.test(lower)) return true;

    // Casual conversation / opinion questions
    const casual = /(?:do you (?:like|think|feel|know|have)|how do you|what do you think|tell me a (?:joke|story)|are you (?:real|alive|sentient|ai|a bot))/;
    if (casual.test(lower)) return true;

    return false;
  }

  async processMessage(message: string, conversationId?: string): Promise<OrchestratorResponse> {
    // Get or create conversation
    const convId = conversationId ?? this.createConversation();
    // Ensure conversation row exists in OUR table — the caller (bridge.ts) may
    // have created the ID in ConversationManager's separate DB, which means
    // the FK on conversation_turns would fail without this.
    if (conversationId) {
      this.db.prepare(
        'INSERT OR IGNORE INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)'
      ).run(conversationId, new Date().toISOString(), new Date().toISOString());
    }

    // Step 1: Fetch document-scoped context (if active)
    const documentChunks = this.documentContext
      ? await this.documentContext.getContextForPrompt(message, 5)
      : [];

    // Step 2: Search knowledge graph for general context
    const context = await this.knowledge.search(message, { limit: 5 });

    // Step 3: Build conversation history
    const history = conversationId ? await this.getConversation(convId) : [];

    // Step 4: Determine if this is conversational (greetings, small talk)
    // Small models (7-8B) are unreliable with tool calling — they narrate tool
    // usage instead of calling tools, or call tools for simple questions.
    // For conversational messages, we also use a stripped-down system prompt
    // that removes service/knowledge/autonomy context to prevent fabrication.
    const isConversational = this.isConversationalMessage(message);

    // Step 5: Intent extraction BEFORE LLM call.
    // If we can determine the user's intent from their message alone, execute the
    // tool directly and skip the first LLM call entirely. The model only sees real
    // data and summarizes it — it never gets a chance to fabricate.
    // ONLY pre-extract read-safe actions (fetches, searches). Write/execute actions
    // (send_email, draft_email, create_reminder) go through the normal LLM path
    // so the model can compose content and the user can review before execution.
    const READ_SAFE_TOOLS = new Set([
      'search_web', 'deep_search_web', 'fetch_url',
      'fetch_inbox', 'search_emails', 'fetch_calendar',
      'list_reminders', 'search_files', 'search_cloud_files',
      'search_contacts', 'get_weather',
    ]);
    const allExtracted = isConversational ? [] : this.extractToolIntent(message, '');
    const preExtractedCalls = allExtracted.filter(tc => READ_SAFE_TOOLS.has(tc.name));

    const actions: AgentAction[] = [];
    let finalMessage = '';
    this.lastStyleScore = null;

    if (preExtractedCalls.length > 0) {
      // ── DIRECT EXECUTION PATH ──────────────────────────────────────────
      // Intent was clear from the user's message. Execute tools, get real data,
      // then give the model ONLY the real results to summarize.
      const messages = this.buildMessages(message, context, history, documentChunks, false);
      const toolResults = await this.processToolCalls(preExtractedCalls, context, message);
      actions.push(...toolResults.actions);

      if (toolResults.executedResults.length > 0) {
        const sanitizedToolResults = toolResults.executedResults.map(r => {
          const resultStr = JSON.stringify(r.result);
          const needsFullSanitization = r.tool === 'fetch_url' || r.tool === 'search_web' || r.tool === 'deep_search_web';
          const sanitized = needsFullSanitization
            ? sanitizeRetrievedContent(resultStr)
            : resultStr;
          return `${r.tool}: ${sanitized}`;
        }).join('\n');

        // Give the model ONLY the real data to summarize — no tool definitions,
        // no chance to fabricate. One LLM call, with real results.
        const synthesisMessages = [
          ...messages,
          {
            role: 'user' as const,
            content: wrapInDataBoundary(
              `Here are the results for the user's request "${message}":\n\n${sanitizedToolResults}\n\nSummarize these results naturally for the user. Be concise and helpful. Do not add information that is not in the results.`,
              'tool execution results',
            ),
          },
        ];

        const synthesis = await this.llm.chat({
          model: this.model,
          messages: synthesisMessages,
          temperature: 0.7,
          maxTokens: 128,
        });
        finalMessage = synthesis.message.content;
      } else {
        // All tools failed — tell the user
        const errors = toolResults.actions
          .filter(a => a.status === 'failed')
          .map(a => a.response?.error?.message ?? 'unknown error');
        finalMessage = errors.length > 0
          ? `I tried to help but ran into an issue: ${errors.join('. ')}. You may need to connect this service in Settings > Connections.`
          : 'I wasn\'t able to complete that request. Please check your connections in Settings.';
      }

    } else {
      // ── STANDARD LLM PATH ──────────────────────────────────────────────
      // No clear tool intent from the message. Let the model respond normally.
      // If the model outputs tool calls, process them as before.
      const messages = this.buildMessages(message, context, history, documentChunks, isConversational);
      const tools = isConversational ? undefined : this.allTools;

      let response = await this.llm.chat({
        model: this.model,
        messages,
        tools,
        temperature: 0.7,
        maxTokens: 128,
      });

      finalMessage = response.message.content;

      // Check if model output tool calls (formatted correctly)
      if (!response.toolCalls?.length) {
        // Try parsing tool calls from the response text (Qwen function-call format etc.)
        const textExtracted = this.extractToolIntent(message, finalMessage);
        if (textExtracted.length > 0) {
          response = { ...response, toolCalls: textExtracted };
          finalMessage = '';
        }
      }

      // Strip leaked tool-call formatting
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const stripped = finalMessage
          .replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/g, '')
          .replace(/```(?:json)?\s*\{[\s\S]*?"name"\s*:\s*"[\s\S]*?\}\s*```/g, '')
          .replace(/\b[a-z_]+\s*\(\s*\{[\s\S]*?\}\s*\)/g, '')
          .trim();
        if (stripped.length > 0) {
          finalMessage = stripped;
        }
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults = await this.processToolCalls(response.toolCalls, context, message);
        actions.push(...toolResults.actions);

        if (toolResults.executedResults.length > 0) {
          const sanitizedToolResults = toolResults.executedResults.map(r => {
            const resultStr = JSON.stringify(r.result);
            const needsFullSanitization = r.tool === 'fetch_url' || r.tool === 'search_web' || r.tool === 'deep_search_web';
            const sanitized = needsFullSanitization
              ? sanitizeRetrievedContent(resultStr)
              : resultStr;
            return `${r.tool}: ${sanitized}`;
          }).join('\n');

          const followUpMessages = [
            ...messages,
            {
              role: 'user' as const,
              content: wrapInDataBoundary(
                `Tool results:\n${sanitizedToolResults}`,
                'tool execution results',
              ),
            },
          ];

          const followUp = await this.llm.chat({
            model: this.model,
            messages: followUpMessages,
            temperature: 0.7,
            maxTokens: 128,
          });
          finalMessage = followUp.message.content;
        }

        const pendingCount = actions.filter(a => a.status === 'pending_approval').length;
        if (pendingCount > 0 && toolResults.executedResults.length === 0) {
          const retryResponse = await this.llm.chat({
            model: this.model,
            messages,
            temperature: 0.7,
            maxTokens: 128,
          });
          if (retryResponse?.message?.content) {
            finalMessage = retryResponse.message.content;
          }
        }
      }
    }

    // Step 7: In-chat check-in (rate-limited 1/day, never during emotional conversations)
    if (this.intentManager && this.shouldTriggerCheckIn()) {
      const checkIn = await this.evaluateCheckIn(message, history);
      if (checkIn) {
        finalMessage += `\n\n---\n${checkIn}`;
      }
    }

    // Step 8: Store conversation turns
    const tokensUsed = { prompt: 0, completion: 0, total: 0 };
    this.storeTurn(convId, 'user', message, context, null, 0, 0);
    this.storeTurn(convId, 'assistant', finalMessage, null, actions, 0, 0);

    return {
      message: finalMessage,
      conversationId: convId,
      actions,
      context,
      tokensUsed,
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

  setVoiceMode(active: boolean): void {
    this.voiceModeActive = active;
  }

  updatePromptConfig(updates: Partial<SystemPromptConfig>): void {
    this.promptConfig = { ...this.promptConfig, ...updates };
  }

  setIntentManager(manager: IntentManager): void {
    this.intentManager = manager;
  }

  setAlterEgoGuardrails(guardrails: AlterEgoGuardrails, store: AlterEgoStore): void {
    this.alterEgoGuardrails = guardrails;
    this.alterEgoStore = store;
  }

  // ─── Tool Intent Extraction ──────────────────────────────────────────────

  /**
   * Extract tool calls from the user's message + model's narration when the
   * model describes what it wants to do instead of outputting formatted tool calls.
   * This makes tool calling robust for small models (7B) that can understand
   * WHAT to do but can't reliably format the call.
   */
  private extractToolIntent(userMessage: string, modelResponse: string): ToolCall[] {
    const combined = `${userMessage}\n${modelResponse}`.toLowerCase();
    const calls: ToolCall[] = [];

    // ── Web search intent ────────────────────────────────────────────────
    if (/search(?:ing)?\s+(?:the\s+)?(?:web|internet|online)|web\s+search|look\s+(?:up|online)|google|find\s+(?:out|information)\s+about/i.test(combined)) {
      // Extract the search query from the user's message
      const queryMatch = userMessage.match(
        /(?:search\s+(?:for|about|the\s+web\s+for)?|look\s+up|find\s+(?:information\s+)?(?:about|on)?|google)\s+["""]?(.+?)["""]?\s*$/i
      ) ?? userMessage.match(
        /(?:about|for|on)\s+["""]?(.+?)["""]?\s*$/i
      );
      const query = queryMatch?.[1]?.trim() ?? userMessage.replace(/^.*(?:search|look|find|run)\s+/i, '').trim();
      if (query && query.length > 1) {
        calls.push({ name: 'search_web', arguments: { query } });
      }
    }

    // ── Email fetch intent ───────────────────────────────────────────────
    if (/(?:check|fetch|get|show|read|tell\s+me\s+what(?:'s|\s+is)\s+in)\s+(?:my\s+)?(?:email|inbox|mail)|what(?:'s|\s+is)\s+in\s+my\s+(?:email|inbox|mail)|(?:any\s+)?(?:new\s+)?(?:email|mail)s?\s+(?:for\s+me|today|this\s+morning)/i.test(combined) && calls.length === 0) {
      calls.push({ name: 'fetch_inbox', arguments: { folder: 'INBOX', limit: 10 } });
    }

    // ── Calendar fetch intent ────────────────────────────────────────────
    if (/(?:check|fetch|get|show|what'?s?\s+on)\s+(?:my\s+)?(?:calendar|schedule|agenda)/i.test(combined) && calls.length === 0) {
      // CalendarFetchPayload REQUIRES startDate and endDate (ISO strings)
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      calls.push({ name: 'fetch_calendar', arguments: {
        startDate: now.toISOString(),
        endDate: endOfDay.toISOString(),
      } });
    }

    // ── Reminder create intent ───────────────────────────────────────────
    if (/(?:remind|set\s+a?\s*reminder|don'?t\s+let\s+me\s+forget)/i.test(combined) && calls.length === 0) {
      const textMatch = userMessage.match(/remind\s+(?:me\s+)?(?:to\s+)?(.+)/i);
      if (textMatch?.[1]) {
        calls.push({ name: 'create_reminder', arguments: { text: textMatch[1].trim() } });
      }
    }

    // ── Google Drive / cloud files intent ───────────────────────────────
    if (/(?:check|show|list|what'?s?\s+(?:in|on)|look\s+at|open)\s+(?:my\s+)?(?:google\s+)?(?:drive|cloud\s+(?:files|storage|documents))/i.test(combined) && calls.length === 0) {
      calls.push({ name: 'search_cloud_files', arguments: { query: '*' } });
    }

    // ── File/knowledge search intent ─────────────────────────────────────
    if (/(?:search|look\s+through|find\s+in|what\s+(?:files|documents))\s+(?:my\s+)?(?:files|documents|notes|knowledge)|(?:do\s+I\s+have|are\s+there)\s+(?:any\s+)?(?:files|documents)/i.test(combined) && calls.length === 0) {
      const queryMatch = userMessage.match(/(?:search|find|look)\s+(?:for|in\s+my\s+files\s+for)?\s+(.+)/i);
      const query = queryMatch?.[1]?.trim() ?? '*';
      calls.push({ name: 'search_files', arguments: { query } });
    }

    // ── Email search intent (specific query, not just "check inbox") ─────
    if (/(?:find|search)\s+(?:my\s+)?(?:email|mail|messages?)\s+(?:about|from|regarding)/i.test(combined) && calls.length === 0) {
      const queryMatch = userMessage.match(/(?:about|from|regarding)\s+(.+)/i);
      if (queryMatch?.[1]) {
        calls.push({ name: 'search_emails', arguments: { query: queryMatch[1].trim() } });
      }
    }

    // ── Contacts intent ──────────────────────────────────────────────────
    if (/(?:who\s+is|find|look\s+up|search)\s+(?:my\s+)?(?:contact|person|people)/i.test(combined) && calls.length === 0) {
      const queryMatch = userMessage.match(/(?:who\s+is|find|look\s+up)\s+(.+)/i);
      if (queryMatch?.[1]) {
        calls.push({ name: 'search_contacts', arguments: { query: queryMatch[1].trim() } });
      }
    }

    // ── Weather intent ───────────────────────────────────────────────────
    if (/(?:what'?s?\s+the\s+)?weather|forecast|temperature/i.test(combined) && calls.length === 0) {
      calls.push({ name: 'get_weather', arguments: {} });
    }

    // ── Draft email intent ───────────────────────────────────────────────
    if (/(?:draft|write|compose)\s+(?:a\s+|an\s+)?(?:email|message|reply)/i.test(combined) && calls.length === 0) {
      calls.push({ name: 'draft_email', arguments: { to: [], subject: '', body: '' } });
    }

    // ── List reminders intent ────────────────────────────────────────────
    if (/(?:show|list|what\s+are)\s+(?:my\s+)?(?:reminders?|to-?do)/i.test(combined) && calls.length === 0) {
      calls.push({ name: 'list_reminders', arguments: {} });
    }

    return calls;
  }

  // ─── In-Chat Check-In (Phase 2d) ───────────────────────────────────────

  /**
   * Rate-limited check: should we attempt a check-in this turn?
   * Returns false if < 24h since last check-in or no pending observations.
   */
  private shouldTriggerCheckIn(): boolean {
    if (!this.intentManager) return false;

    // Check for pending in-chat observations first (cheap)
    const pending = this.intentManager.getPendingObservations('chat');
    if (pending.length === 0) return false;

    // Rate limit: 1 check-in per 24 hours
    const lastTs = this.intentManager.getLastCheckInTimestamp();
    if (lastTs) {
      const elapsed = Date.now() - new Date(lastTs).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      if (elapsed < twentyFourHours) return false;
    }

    return true;
  }

  /**
   * Classify whether recent conversation is emotionally sensitive.
   * Uses local LLM with binary YES/NO prompt on last 3 messages.
   *
   * FAIL-SAFE: If LLM is unavailable or classification fails for ANY reason,
   * returns true (suppress check-in). A false positive (check-in during grief/crisis)
   * is genuinely harmful — worth the extra inference call to avoid it.
   */
  private async isEmotionallySensitive(recentMessages: ConversationTurn[]): Promise<boolean> {
    // No LLM → suppress (fail-safe)
    if (!this.llm) return true;

    const last3 = recentMessages.slice(-3);
    if (last3.length === 0) return false;

    const messageText = last3.map(m => `${m.role}: ${m.content}`).join('\n');

    try {
      const request: GenerateRequest = {
        model: this.model,
        system: 'You classify conversation tone. Reply with exactly YES or NO. Nothing else.',
        prompt: `Are the following messages emotionally sensitive? Reply YES or NO only.\n\n${messageText}`,
        temperature: 0,
        maxTokens: 8,
      };

      const response = await this.llm.generate(request);
      const answer = response.text.trim().toUpperCase();

      // Only suppress if clearly YES — ambiguous or malformed responses → suppress (fail-safe)
      if (answer === 'NO') return false;
      return true;
    } catch {
      // Any failure → suppress check-in (fail-safe: never risk interrupting a crisis)
      return true;
    }
  }

  /**
   * Evaluate whether to fire a check-in and generate the message.
   * Calls isEmotionallySensitive first. Returns null if sensitive or no observation.
   * Otherwise generates a gentle one-sentence check-in via LLM.
   */
  private async evaluateCheckIn(
    _message: string,
    history: ConversationTurn[],
  ): Promise<string | null> {
    // Check emotional sensitivity first — never interrupt a crisis
    const sensitive = await this.isEmotionallySensitive(history);
    if (sensitive) return null;

    if (!this.intentManager) return null;

    const pending = this.intentManager.getPendingObservations('chat');
    if (pending.length === 0) return null;

    const obs = pending[0]!;

    // If no LLM, return the observation description directly (plain fallback)
    if (!this.llm) {
      this.intentManager.markSurfacedInChat(obs.id);
      this.intentManager.setLastCheckInTimestamp(new Date().toISOString());
      return obs.description;
    }

    try {
      const request: GenerateRequest = {
        model: this.model,
        system: 'You are curious and caring, like a trusted friend, not a therapist or notification. Write exactly one sentence.',
        prompt: `Gently surface this observation to the user in one sentence:\n\n"${obs.description}"`,
        temperature: 0.4,
        maxTokens: 128,
      };

      const response = await this.llm.generate(request);
      const checkIn = response.text.trim();
      if (!checkIn) return null;

      // Mark surfaced and update timestamp
      this.intentManager.markSurfacedInChat(obs.id);
      this.intentManager.setLastCheckInTimestamp(new Date().toISOString());

      return checkIn;
    } catch {
      return null;
    }
  }

  /**
   * Register extension tools. Adds tool definitions to the LLM tool list
   * and stores handlers for dispatch during processToolCalls.
   */
  registerTools(tools: ExtensionTool[]): void {
    for (const tool of tools) {
      this.allTools.push(tool.definition);
      this.extensionToolHandlers.set(tool.definition.name, tool.handler);
      if (tool.isLocal) {
        this.allLocalTools.add(tool.definition.name);
      }
      if (tool.actionType) {
        this.allToolActionMap[tool.definition.name] = tool.actionType;
      }
    }
  }

  // --- Private helpers ---

  private buildMessages(
    message: string,
    context: SearchResult[],
    history: ConversationTurn[],
    documentChunks: SearchResult[] = [],
    conversational?: boolean,
  ): ChatMessage[] {
    const basePrompt = buildSystemPrompt(this.promptConfig, conversational);
    let systemContent = this.voiceModeActive
      ? `${basePrompt}\n\n${VOICE_MODE_CONTEXT}`
      : basePrompt;

    // Intent context: injected into system message (cannot be overridden by doc/knowledge injection)
    if (this.intentManager) {
      const intentCtx = this.intentManager.buildIntentContext();
      if (intentCtx) systemContent += `\n\n${intentCtx}`;
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
    ];

    // Add document-scoped context (high priority — before general context)
    // SECURITY: All retrieved content is sanitized to prevent prompt injection.
    if (documentChunks.length > 0) {
      const activeDocs = this.documentContext?.getActiveDocuments() ?? [];
      const docLabel = activeDocs.length === 1
        ? `'${activeDocs[0]?.fileName ?? 'document'}'`
        : `${activeDocs.length} attached documents (${activeDocs.map(d => d.fileName).join(', ')})`;
      const docContextStr = documentChunks.map((r, i) =>
        `[${i + 1}] ${sanitizeRetrievedContent(r.chunk.content.slice(0, 800))}`
      ).join('\n\n');
      messages.push({
        role: 'user',
        content: wrapInDataBoundary(
          `The user is asking about ${docLabel}. Relevant passages:\n${docContextStr}`,
          'document context',
        ),
      });
    }

    // Add general context from knowledge graph (deduplicated against document chunks)
    // SECURITY: Sanitized and wrapped in data boundaries.
    const docChunkIds = new Set(documentChunks.map(r => r.chunk.id));
    const deduplicatedContext = context.filter(r => !docChunkIds.has(r.chunk.id));

    if (deduplicatedContext.length > 0) {
      const contextStr = deduplicatedContext.map((r, i) =>
        `[${i + 1}] ${r.document.title} (${r.document.source}): ${sanitizeRetrievedContent(r.chunk.content.slice(0, 500))}`
      ).join('\n\n');
      messages.push({
        role: 'user',
        content: wrapInDataBoundary(contextStr, 'knowledge base'),
      });
    }

    // Add recent conversation history (last 3 turns for small models).
    // 10 turns overwhelms the 4096 context window — 3 turns gives enough
    // context for multi-turn conversation without consuming the budget.
    const recentHistory = history.slice(-3);
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

  /**
   * Build a compact ReasoningContext from the search results used in this turn.
   */
  private buildReasoningContext(
    query: string,
    context: SearchResult[],
  ): ReasoningContext {
    const chunks: ReasoningChunkRef[] = context.map(sr => ({
      chunkId: sr.chunk.id,
      documentId: sr.document.id,
      title: sr.document.title,
      source: sr.document.source,
      score: sr.score,
    }));
    return {
      query,
      chunks,
      retrievedAt: new Date().toISOString(),
    };
  }

  private async processToolCalls(
    toolCalls: ToolCall[],
    context: SearchResult[],
    userMessage: string,
  ): Promise<{
    actions: AgentAction[];
    executedResults: Array<{ tool: string; result: unknown }>;
  }> {
    const actions: AgentAction[] = [];
    const executedResults: Array<{ tool: string; result: unknown }> = [];
    const reasoningCtx = context.length > 0 ? this.buildReasoningContext(userMessage, context) : undefined;

    for (const tc of toolCalls) {
      // HARD LIMIT ENFORCEMENT — runs before ALL other checks (boundary, autonomy, extension)
      if (this.intentManager) {
        const actionType = this.allToolActionMap[tc.name];
        if (actionType) {
          const intentCheck = this.intentManager.checkAction(actionType, tc.arguments);
          if (!intentCheck.allowed && intentCheck.matchedLimits.length > 0) {
            const firstLimit = intentCheck.matchedLimits[0]!;
            actions.push({
              id: nanoid(),
              action: actionType,
              payload: tc.arguments,
              reasoning: `Blocked by hard limit: ${intentCheck.matchedLimits.map(l => l.rawText).join('; ')}`,
              domain: this.autonomy.getDomainForAction(actionType),
              tier: this.autonomy.getDomainTier(this.autonomy.getDomainForAction(actionType)),
              status: 'rejected',
              createdAt: new Date().toISOString(),
              reasoningContext: reasoningCtx,
            });
            executedResults.push({
              tool: tc.name,
              result: { blocked: true, reason: `Blocked by your hard limit: "${firstLimit.rawText}"` },
            });
            continue; // Skip all subsequent checks for this tool call
          }
        }
      }

      // Extension tools — dispatch to registered handlers with autonomy + audit checks
      const extHandler = this.extensionToolHandlers.get(tc.name);
      if (extHandler) {
        // Determine autonomy tier for extension tools
        const extActionType = this.allToolActionMap[tc.name];
        const extDomain = extActionType
          ? this.autonomy.getDomainForAction(extActionType)
          : 'general' as AutonomyDomain;
        const extTier = this.autonomy.getDomainTier(extDomain);

        // BoundaryEnforcer: check payload-level boundaries even for extensions
        if (extActionType) {
          const boundaries = this.boundaryEnforcer.checkBoundaries({
            action: extActionType,
            payload: tc.arguments,
          });
          if (this.boundaryEnforcer.shouldEscalate(boundaries)) {
            // Queue for approval instead of executing
            const agentAction: AgentAction = {
              id: nanoid(),
              action: extActionType,
              payload: tc.arguments,
              reasoning: `Extension tool '${tc.name}' triggered boundary escalation: ${boundaries.map(b => b.reason).join('; ')}`,
              domain: extDomain,
              tier: extTier,
              status: 'pending_approval',
              createdAt: new Date().toISOString(),
              reasoningContext: reasoningCtx,
            };
            this.db.prepare(`
              INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, reasoning_context)
              VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)
            `).run(agentAction.id, agentAction.action, JSON.stringify(agentAction.payload),
              agentAction.reasoning, agentAction.domain, agentAction.tier, agentAction.createdAt,
              reasoningCtx ? JSON.stringify(reasoningCtx) : null);
            actions.push(agentAction);
            continue;
          }
        }

        // In Guardian mode, extension tools ALSO require approval
        const extDecision = extActionType
          ? this.autonomy.decide(extActionType)
          : (extTier === 'guardian' ? 'requires_approval' as const : 'auto_approve' as const);

        if (extDecision === 'requires_approval') {
          const agentAction: AgentAction = {
            id: nanoid(),
            action: extActionType ?? 'service.api_call',
            payload: tc.arguments,
            reasoning: `Extension tool '${tc.name}' requires approval (${extTier} tier)`,
            domain: extDomain,
            tier: extTier,
            status: 'pending_approval',
            createdAt: new Date().toISOString(),
            reasoningContext: reasoningCtx,
          };
          this.db.prepare(`
            INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, reasoning_context)
            VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)
          `).run(agentAction.id, agentAction.action, JSON.stringify(agentAction.payload),
            agentAction.reasoning, agentAction.domain, agentAction.tier, agentAction.createdAt,
            reasoningCtx ? JSON.stringify(reasoningCtx) : null);
          actions.push(agentAction);
          continue;
        }

        // Execute with audit trail logging
        try {
          const handlerResult = await extHandler(tc.arguments);
          if (handlerResult.error) {
            executedResults.push({ tool: tc.name, result: { error: handlerResult.error } });
          } else {
            executedResults.push({ tool: tc.name, result: handlerResult.result });
          }
        } catch (err) {
          executedResults.push({ tool: tc.name, result: { error: err instanceof Error ? err.message : 'Extension tool failed' } });
        }
        continue;
      }

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

      if (tc.name === 'search_cloud_files') {
        // Search cloud-synced files in the local index — no IPC needed
        const results = await this.knowledge.search(tc.arguments['query'] as string, {
          limit: 10,
          source: 'cloud_storage',
        });
        executedResults.push({
          tool: 'search_cloud_files',
          result: results.map(r => ({
            title: r.document.title,
            content: r.chunk.content.slice(0, 500),
            score: r.score,
            metadata: r.document.metadata,
          })),
        });
        continue;
      }

      // --- Knowledge curation tools (local, no IPC) ---

      if (tc.name === 'knowledge_remove') {
        const chunkId = tc.arguments['chunkId'] as string;
        if (!this.knowledgeCurator) {
          this.knowledgeCurator = this.knowledge.createCurator({ db: this.db, llm: this.llm });
        }
        const result = await this.knowledgeCurator.removeFromGraph(chunkId);
        executedResults.push({
          tool: 'knowledge_remove',
          result: {
            success: result.success,
            chunkId: result.chunkId,
            detail: result.detail,
          },
        });
        continue;
      }

      if (tc.name === 'knowledge_recategorize') {
        const chunkId = tc.arguments['chunkId'] as string;
        const newCategory = tc.arguments['newCategory'] as VisualizationCategory;
        if (!this.knowledgeCurator) {
          this.knowledgeCurator = this.knowledge.createCurator({ db: this.db, llm: this.llm });
        }
        const result = await this.knowledgeCurator.recategorize(chunkId, newCategory);
        executedResults.push({
          tool: 'knowledge_recategorize',
          result: {
            success: result.success,
            chunkId: result.chunkId,
            newCategory,
            detail: result.detail,
          },
        });
        continue;
      }

      // --- Contact tools (local, query prefsDb) ---

      if (tc.name === 'search_contacts') {
        const query = (tc.arguments['query'] as string ?? '').toLowerCase();
        try {
          const rows = this.db.prepare(
            `SELECT id, display_name, emails, phones, organization, relationship_type, birthday
             FROM contacts
             WHERE LOWER(display_name) LIKE ? OR LOWER(emails) LIKE ? OR LOWER(organization) LIKE ? OR LOWER(phones) LIKE ?
             ORDER BY interaction_count DESC LIMIT 10`
          ).all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`) as Array<{
            id: string; display_name: string; emails: string; phones: string;
            organization: string | null; relationship_type: string; birthday: string | null;
          }>;
          executedResults.push({
            tool: 'search_contacts',
            result: rows.map(r => ({
              id: r.id,
              name: r.display_name,
              emails: JSON.parse(r.emails),
              phones: JSON.parse(r.phones),
              organization: r.organization,
              relationship: r.relationship_type,
              birthday: r.birthday,
            })),
          });
        } catch {
          executedResults.push({ tool: 'search_contacts', result: { error: 'Contacts not available' } });
        }
        continue;
      }

      if (tc.name === 'get_contact') {
        const name = (tc.arguments['name'] as string ?? '').toLowerCase();
        try {
          const row = this.db.prepare(
            `SELECT id, display_name, given_name, family_name, emails, phones, organization,
                    job_title, birthday, relationship_type, communication_frequency,
                    last_contact_date, interaction_count, tags
             FROM contacts
             WHERE LOWER(display_name) LIKE ?
             ORDER BY interaction_count DESC LIMIT 1`
          ).get(`%${name}%`) as {
            id: string; display_name: string; given_name: string | null; family_name: string | null;
            emails: string; phones: string; organization: string | null; job_title: string | null;
            birthday: string | null; relationship_type: string; communication_frequency: string;
            last_contact_date: string | null; interaction_count: number; tags: string;
          } | undefined;

          if (row) {
            executedResults.push({
              tool: 'get_contact',
              result: {
                id: row.id,
                name: row.display_name,
                firstName: row.given_name,
                lastName: row.family_name,
                emails: JSON.parse(row.emails),
                phones: JSON.parse(row.phones),
                organization: row.organization,
                jobTitle: row.job_title,
                birthday: row.birthday,
                relationship: row.relationship_type,
                lastContact: row.last_contact_date,
                interactionCount: row.interaction_count,
                tags: JSON.parse(row.tags),
              },
            });
          } else {
            executedResults.push({ tool: 'get_contact', result: { found: false, message: `No contact found matching "${tc.arguments['name']}"` } });
          }
        } catch {
          executedResults.push({ tool: 'get_contact', result: { error: 'Contacts not available' } });
        }
        continue;
      }

      // --- Finance tools (local, query prefsDb) ---

      if (tc.name === 'get_subscriptions') {
        const statusFilter = tc.arguments['status'] as string | undefined;
        try {
          const sql = statusFilter && statusFilter !== 'all'
            ? 'SELECT * FROM recurring_charges WHERE status = ? ORDER BY estimated_annual_cost DESC'
            : 'SELECT * FROM recurring_charges ORDER BY estimated_annual_cost DESC';
          const rows = (statusFilter && statusFilter !== 'all'
            ? this.db.prepare(sql).all(statusFilter)
            : this.db.prepare(sql).all()
          ) as Array<{
            id: string; merchant_name: string; typical_amount: number; frequency: string;
            confidence: number; last_charge_date: string; charge_count: number;
            estimated_annual_cost: number; status: string;
          }>;
          executedResults.push({
            tool: 'get_subscriptions',
            result: {
              subscriptions: rows.map(r => ({
                id: r.id,
                merchant: r.merchant_name,
                amount: r.typical_amount,
                frequency: r.frequency,
                annualCost: r.estimated_annual_cost,
                lastCharge: r.last_charge_date,
                status: r.status,
              })),
              totalMonthly: rows.filter(r => r.status === 'active').reduce((sum, r) => sum + (r.frequency === 'monthly' ? r.typical_amount : r.typical_amount / 12), 0),
              totalAnnual: rows.filter(r => r.status === 'active').reduce((sum, r) => sum + r.estimated_annual_cost, 0),
            },
          });
        } catch {
          executedResults.push({ tool: 'get_subscriptions', result: { subscriptions: [], message: 'No financial data imported yet. Import a bank statement first.' } });
        }
        continue;
      }

      if (tc.name === 'get_financial_summary') {
        const days = (tc.arguments['days'] as number) || 30;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        try {
          const totalRow = this.db.prepare(
            'SELECT COUNT(*) as count, SUM(amount) as total FROM stored_transactions WHERE date >= ?'
          ).get(cutoff) as { count: number; total: number | null } | undefined;
          const topMerchants = this.db.prepare(
            `SELECT normalized_merchant, SUM(amount) as total, COUNT(*) as count
             FROM stored_transactions WHERE date >= ?
             GROUP BY normalized_merchant ORDER BY total DESC LIMIT 10`
          ).all(cutoff) as Array<{ normalized_merchant: string; total: number; count: number }>;
          const byCategory = this.db.prepare(
            `SELECT category, SUM(amount) as total, COUNT(*) as count
             FROM stored_transactions WHERE date >= ? AND category != ''
             GROUP BY category ORDER BY total DESC`
          ).all(cutoff) as Array<{ category: string; total: number; count: number }>;

          executedResults.push({
            tool: 'get_financial_summary',
            result: {
              period: `Last ${days} days`,
              transactionCount: totalRow?.count ?? 0,
              totalSpending: Math.abs(totalRow?.total ?? 0),
              topMerchants: topMerchants.map(r => ({ merchant: r.normalized_merchant, total: Math.abs(r.total), count: r.count })),
              byCategory: byCategory.map(r => ({ category: r.category, total: Math.abs(r.total), count: r.count })),
            },
          });
        } catch {
          executedResults.push({ tool: 'get_financial_summary', result: { message: 'No financial data imported yet. Import a bank statement first.' } });
        }
        continue;
      }

      // --- Health tools (local, query prefsDb) ---

      if (tc.name === 'get_health_entries') {
        const days = (tc.arguments['days'] as number) || 7;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        try {
          const rows = this.db.prepare(
            'SELECT * FROM health_entries WHERE date >= ? ORDER BY date DESC'
          ).all(cutoff) as Array<{
            id: string; date: string; mood: number | null; energy: number | null;
            water_glasses: number | null; symptoms: string; medications: string; notes: string | null;
          }>;
          executedResults.push({
            tool: 'get_health_entries',
            result: {
              entries: rows.map(r => ({
                id: r.id,
                date: r.date,
                mood: r.mood,
                energy: r.energy,
                waterGlasses: r.water_glasses,
                symptoms: JSON.parse(r.symptoms),
                medications: JSON.parse(r.medications),
                notes: r.notes,
              })),
              averageMood: rows.filter(r => r.mood !== null).length > 0
                ? rows.filter(r => r.mood !== null).reduce((sum, r) => sum + r.mood!, 0) / rows.filter(r => r.mood !== null).length
                : null,
              averageEnergy: rows.filter(r => r.energy !== null).length > 0
                ? rows.filter(r => r.energy !== null).reduce((sum, r) => sum + r.energy!, 0) / rows.filter(r => r.energy !== null).length
                : null,
            },
          });
        } catch {
          executedResults.push({ tool: 'get_health_entries', result: { entries: [], message: 'No health data recorded yet.' } });
        }
        continue;
      }

      if (tc.name === 'add_health_entry') {
        const date = (tc.arguments['date'] as string) || new Date().toISOString().slice(0, 10);
        const id = nanoid();
        try {
          this.db.prepare(
            `INSERT OR REPLACE INTO health_entries (id, date, timestamp, mood, energy, water_glasses, symptoms, medications, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            id, date, new Date().toISOString(),
            tc.arguments['mood'] as number ?? null,
            tc.arguments['energy'] as number ?? null,
            tc.arguments['waterGlasses'] as number ?? null,
            JSON.stringify(tc.arguments['symptoms'] ?? []),
            JSON.stringify(tc.arguments['medications'] ?? []),
            tc.arguments['notes'] as string ?? null,
          );
          executedResults.push({
            tool: 'add_health_entry',
            result: { success: true, id, date, message: `Health entry logged for ${date}` },
          });
        } catch (err) {
          executedResults.push({ tool: 'add_health_entry', result: { error: err instanceof Error ? err.message : 'Failed to log health entry' } });
        }
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

      // --- SMS style enhancement for send_text ---
      if (tc.name === 'send_text' && this.messageDrafter) {
        const recipientName = tc.arguments['recipientName'] as string | undefined;
        const intent = tc.arguments['intent'] as string | undefined;

        if (recipientName && intent) {
          // Resolve contact to get phone number
          const resolved = this.contactResolver?.resolve(recipientName);
          if (resolved?.contact?.phones && resolved.contact.phones.length > 0) {
            const phone = resolved.contact.phones[0]!;
            const styleProfile = this.styleProfileStore?.getActiveProfile() ?? null;

            const drafted = await this.messageDrafter.draftMessage({
              intent,
              recipientName,
              relationship: resolved.contact.relationshipType,
              styleProfile,
            });

            tc.arguments['phone'] = phone;
            tc.arguments['body'] = drafted.body;
          }
        }
      }

      // Gateway-routed tools
      const actionType = this.allToolActionMap[tc.name];
      if (!actionType) continue;

      const domain = this.autonomy.getDomainForAction(actionType);
      const tier = this.autonomy.getDomainTier(domain);

      // BoundaryEnforcer: payload-level checks (financial, legal, irreversible)
      const boundaries = this.boundaryEnforcer.checkBoundaries({
        action: actionType,
        payload: tc.arguments,
      });
      const boundaryEscalation = this.boundaryEnforcer.shouldEscalate(boundaries);

      // If boundaries triggered, force approval regardless of autonomy tier
      const decision = boundaryEscalation
        ? 'requires_approval' as const
        : this.autonomy.decide(actionType);

      const agentAction: AgentAction = {
        id: nanoid(),
        action: actionType,
        payload: tc.arguments,
        reasoning: boundaryEscalation
          ? `LLM requested ${tc.name} — escalated: ${boundaries.map(b => b.reason).join('; ')}`
          : `LLM requested ${tc.name} based on conversation context`,
        domain,
        tier,
        status: 'pending_approval',
        createdAt: new Date().toISOString(),
        reasoningContext: reasoningCtx,
      };

      // ALTER EGO GUARDRAIL EVALUATION
      // Only runs for alter_ego tier when autonomy would auto_approve.
      // BoundaryEnforcer already caught high-stakes items above.
      if (decision === 'auto_approve' && tier === 'alter_ego' && this.alterEgoGuardrails) {
        const guardrailResult = this.alterEgoGuardrails.evaluateAction({
          action: actionType,
          payload: tc.arguments,
          risk: ACTION_RISK_MAP[actionType],
        });

        if (guardrailResult.decision === 'BATCH_PENDING') {
          agentAction.status = 'pending_approval';
          agentAction.reasoning = guardrailResult.reason;
          this.db.prepare(
            `INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, reasoning_context)
             VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)`
          ).run(agentAction.id, agentAction.action, JSON.stringify(agentAction.payload),
                agentAction.reasoning, agentAction.domain, agentAction.tier, agentAction.createdAt,
                reasoningCtx ? JSON.stringify(reasoningCtx) : null);
          actions.push(agentAction);
          continue;
        }

        if (guardrailResult.decision === 'DRAFT_FIRST') {
          agentAction.status = 'pending_approval';
          agentAction.reasoning = guardrailResult.reason;
          this.db.prepare(
            `INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, reasoning_context)
             VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)`
          ).run(agentAction.id, agentAction.action, JSON.stringify(agentAction.payload),
                agentAction.reasoning, agentAction.domain, agentAction.tier, agentAction.createdAt,
                reasoningCtx ? JSON.stringify(reasoningCtx) : null);
          executedResults.push({
            tool: tc.name,
            result: { draft: true, actionId: agentAction.id, draftPayload: tc.arguments,
                      contactEmail: guardrailResult.contactEmail, reason: guardrailResult.reason },
          });
          actions.push(agentAction);
          continue;
        }
        // PROCEED: fall through to auto_approve execution below
      }

      if (decision === 'auto_approve') {
        // Execute immediately
        try {
          const response = await this.ipc.sendAction(actionType, tc.arguments);
          agentAction.status = response.status === 'success' ? 'executed' : 'failed';
          agentAction.executedAt = new Date().toISOString();
          agentAction.response = response;

          if (response.status === 'success') {
            executedResults.push({ tool: tc.name, result: response.data });
          } else {
            // Push the error so the LLM can report it to the user
            const errMsg = response.error?.message ?? response.error?.code ?? 'Action failed';
            executedResults.push({ tool: tc.name, result: { error: errMsg } });
          }

          // Log Alter Ego receipt for transparency
          if (tier === 'alter_ego' && this.alterEgoStore && agentAction.status === 'executed') {
            const receipt = {
              id: agentAction.id,
              actionType: agentAction.action as import('../types/ipc.js').ActionType,
              summary: this.summarizeAction(agentAction.action, agentAction.payload),
              reasoning: agentAction.reasoning,
              status: 'executed' as const,
              undoAvailable: true,
              undoExpiresAt: new Date(Date.now() + 30_000).toISOString(),
              weekGroup: this.alterEgoStore.getWeekGroup(new Date()),
              createdAt: agentAction.createdAt,
              executedAt: agentAction.executedAt!,
            };
            this.alterEgoStore.logReceipt(receipt);
            this.alterEgoStore.acknowledgeAnomaly(agentAction.action);
          }
        } catch (execErr) {
          agentAction.status = 'failed';
          // Push the error so the LLM can explain what went wrong
          const errMsg = execErr instanceof Error ? execErr.message : 'Action execution failed';
          executedResults.push({ tool: tc.name, result: { error: errMsg } });
        }
      } else {
        // Queue for approval
        this.db.prepare(`
          INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, reasoning_context)
          VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)
        `).run(
          agentAction.id,
          agentAction.action,
          JSON.stringify(agentAction.payload),
          agentAction.reasoning,
          agentAction.domain,
          agentAction.tier,
          agentAction.createdAt,
          reasoningCtx ? JSON.stringify(reasoningCtx) : null,
        );
      }

      actions.push(agentAction);
    }

    return { actions, executedResults };
  }

  /**
   * Generate a human-readable summary for an action receipt.
   * Deterministic — no LLM. Per-action-type templates.
   */
  private summarizeAction(actionType: string, payload: Record<string, unknown>): string {
    const truncate = (s: string, max: number) =>
      s.length > max ? s.slice(0, max) + '...' : s;

    const toName = (email: unknown): string => {
      if (typeof email !== 'string') return 'unknown';
      const atIdx = email.indexOf('@');
      return atIdx > 0 ? email.slice(0, atIdx) : email;
    };

    const firstTo = (p: Record<string, unknown>): string => {
      const to = p['to'];
      if (Array.isArray(to) && to.length > 0) return toName(to[0]);
      if (typeof to === 'string') return toName(to);
      return 'unknown';
    };

    const formatDate = (iso: unknown): string => {
      if (typeof iso !== 'string') return '';
      try {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } catch { return ''; }
    };

    switch (actionType) {
      case 'email.send':
        return `Sent email to ${firstTo(payload)}: ${truncate(String(payload['subject'] ?? ''), 50)}`;
      case 'email.draft':
        return `Drafted email to ${firstTo(payload)}: ${truncate(String(payload['subject'] ?? ''), 50)}`;
      case 'email.fetch':
        return `Fetched emails from ${payload['folder'] ?? 'inbox'}`;
      case 'email.archive':
        return `Archived ${Array.isArray(payload['messageIds']) ? payload['messageIds'].length : 1} email(s)`;
      case 'email.move':
        return `Moved email(s) to ${payload['toFolder'] ?? 'folder'}`;
      case 'email.markRead':
        return `Marked ${Array.isArray(payload['messageIds']) ? payload['messageIds'].length : 1} email(s) as ${payload['read'] ? 'read' : 'unread'}`;
      case 'calendar.create':
        return `Created event: ${truncate(String(payload['title'] ?? ''), 50)} on ${formatDate(payload['startTime'])}`;
      case 'calendar.update':
        return `Updated event: ${truncate(String(payload['title'] ?? payload['eventId'] ?? ''), 50)}`;
      case 'calendar.delete':
        return `Deleted event: ${truncate(String(payload['title'] ?? payload['eventId'] ?? ''), 50)}`;
      case 'messaging.send':
        return `Sent message to ${firstTo(payload)}: ${truncate(String(payload['body'] ?? ''), 40)}`;
      case 'messaging.draft':
        return `Drafted message for ${payload['recipientName'] ?? 'contact'}`;
      case 'finance.fetch_transactions':
        return `Fetched transactions from ${payload['accountId'] ?? 'account'}`;
      case 'finance.plaid_disconnect':
        return `Disconnected financial institution`;
      case 'health.fetch':
        return `Fetched ${payload['dataType'] ?? 'health'} data`;
      case 'service.api_call':
        return `Called ${payload['service'] ?? 'service'}: ${payload['endpoint'] ?? ''}`;
      case 'web.search':
        return `Searched web: ${truncate(String(payload['query'] ?? ''), 40)}`;
      case 'web.deep_search':
        return `Deep searched web: ${truncate(String(payload['query'] ?? ''), 40)}`;
      case 'web.fetch':
        return `Fetched URL: ${truncate(String(payload['url'] ?? ''), 50)}`;
      case 'reminder.create':
        return `Created reminder: ${truncate(String(payload['text'] ?? ''), 50)}`;
      case 'reminder.delete':
        return `Deleted reminder`;
      default:
        // Fallback: action type + first meaningful field value
        const firstVal = Object.values(payload).find(v => typeof v === 'string' && v.length > 0);
        return `${actionType}${firstVal ? ': ' + truncate(String(firstVal), 50) : ''}`;
    }
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

  /**
   * Resolve a name reference to a contact entity.
   * Used before building email/calendar action payloads.
   */
  resolveContact(nameRef: string, context?: { topic?: string; actionType?: string }): ResolvedContactResult | null {
    if (!this.contactResolver) return null;
    return this.contactResolver.resolve(nameRef, context);
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
