// Orchestrator — The main reasoning loop. Heart of Semblance.
// User message → knowledge search → LLM prompt → tool calls → autonomy → IPC → response.

import type { DatabaseHandle } from '../platform/types.js';
import { getPlatform } from '../platform/index.js';
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
import type { SubagentStreamEvent } from './orchestrator-v2-types.js';
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
import type { StyleAdapter, StyleScore, DraftContext } from '../style/style-adapter.js';
import { ipAdapters } from '../extensions/ip-adapter-registry.js';
import type { DocumentContextManager } from './document-context.js';
import type { ContactResolver } from '../knowledge/contacts/contact-resolver.js';
import type { ResolvedContactResult } from '../knowledge/contacts/contact-types.js';
import type { MessageDrafter } from './messaging/message-drafter.js';
import type { ExtensionTool, ToolHandler } from '../extensions/types.js';
import { BoundaryEnforcer, type EscalationBoundary } from './escalation-boundaries.js';
import { sanitizeRetrievedContent, stripInjectionPatterns, wrapInDataBoundary, INJECTION_CANARY } from './content-sanitizer.js';
import type { IntentManager } from './intent-manager.js';
import type { AlterEgoGuardrails } from './alter-ego-guardrails.js';
import { AdaptiveContextBudget } from './context-budget.js';
import type { AlterEgoStore } from './alter-ego-store.js';
import { ACTION_RISK_MAP } from './autonomy.js';
import type { VaultChatGrounding, VaultChatChunk } from './context/vault-chat-grounding.js';
import { extractVaultSourceCitations } from './context/citation-validator.js';

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

/** @internal Exported for CoordinatorAgent tool metadata sharing. */
export const BASE_TOOLS: ToolDefinition[] = [
  {
    name: 'search_files',
    description: 'Searches indexed local files, documents, and notes. Faster than search_emails for file-specific queries.',
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
    description: 'Returns the user\'s recent inbox — sender, subject, date, AI priority. For searching specific emails, use search_emails instead.',
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
    description: 'Finds emails matching a query — by keyword, sender, date, or meaning. Works across all indexed email accounts.',
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
    description: 'Sends an email. For Partner tier, prefer draft_email unless the user said "send it".',
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
    description: 'Saves a draft without sending. Safe at any autonomy tier. Default for composing email unless the user says "send".',
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
    description: 'Create a new calendar event with full details. Set reminders, add attendees, specify location. When the user says "put X on my calendar" or "schedule Y", use this tool.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title/summary' },
        startTime: { type: 'string', description: 'ISO 8601 start time (e.g. 2026-03-25T14:00:00-05:00)' },
        endTime: { type: 'string', description: 'ISO 8601 end time (e.g. 2026-03-25T15:00:00-05:00)' },
        description: { type: 'string', description: 'Event description or agenda' },
        location: { type: 'string', description: 'Physical or virtual location' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
        reminders: { type: 'array', items: { type: 'number' }, description: 'Reminder times in minutes before the event (e.g. [10, 30] for 10-min and 30-min reminders)' },
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
    description: 'Creates a reminder with a time, date, or trigger. Parses natural language — "3pm tomorrow", "in two hours" all work.',
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
    description: 'Returns current web results. For time-sensitive or public-knowledge queries where local data won\'t help. For full content, use deep_search_web.',
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
    description: 'Searches the web and reads the top results. Returns full content for synthesis — better than search_web when the user needs an answer, not just links.',
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
    description: 'Returns current conditions and forecast for a location. Defaults to current location. Call when weather is relevant — not just when asked, but when it informs a decision.',
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
    name: 'list_cloud_files',
    description: 'List files from the user\'s connected cloud storage (Google Drive) that have been indexed locally. Use when the user asks what files they have in Drive. Returns files from the local knowledge index — no live cloud API call.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search query to filter files (default: list all)' },
        limit: { type: 'number', description: 'Maximum number of files to return (default 50)' },
      },
    },
  },
  {
    name: 'list_indexed_documents',
    description: 'List all documents that have been indexed into the knowledge base. Returns file names, paths, types, and when they were indexed. Use when the user asks what files or documents you have access to, what has been indexed, or what is in a folder.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Filter by source type: local_file, email, calendar, cloud_storage, etc. (optional)' },
        limit: { type: 'number', description: 'Maximum number of documents to return (default 50)' },
      },
    },
  },
  {
    name: 'read_document',
    description: 'Read the full content of an indexed document by its title or filename. Use when the user asks you to read, summarize, or explain a specific document that has been indexed. Returns the complete document content.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The document title or filename to read' },
        documentId: { type: 'string', description: 'The document ID (if known from list_indexed_documents)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_contact',
    description: 'Add a new contact to the user\'s LOCAL address book stored on-device. This is separate from Google Contacts or cloud contacts. IMPORTANT: Before calling this tool, you MUST ask the user for the contact details (name, email, phone) if they have not provided them. Do NOT create a contact with just a name — always confirm the details first.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full display name of the contact' },
        email: { type: 'string', description: 'Email address (optional)' },
        phone: { type: 'string', description: 'Phone number (optional)' },
        organization: { type: 'string', description: 'Company or organization (optional)' },
        jobTitle: { type: 'string', description: 'Job title (optional)' },
      },
      required: ['name'],
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
    description: 'Finds contacts by name, email, or phone across all accounts. Use before send_email to resolve a name to an address.',
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
  // Sprint WIRE: federated search + form automation
  {
    name: 'search_all_devices',
    description: 'Searches documents across all paired devices simultaneously and merges results. Each result tagged with its source device.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Optional: filter to email, documents, or calendar' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fill_web_form',
    description: 'Fills a web form in the currently open browser using data from the knowledge graph. Always shows a preview before filling.',
    parameters: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'Fields to fill — each with selector and value',
          items: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] },
        },
        confirmBeforeFilling: { type: 'boolean', description: 'Show preview and wait for confirmation (default: true)' },
      },
      required: ['fields'],
    },
  },
  // ─── Vision Tool ──────────────────────────────────────────────────────
  {
    name: 'analyze_image',
    description: 'Analyze an image using the local vision model (Moondream2). Use when the user asks about an image, screenshot, or photo that has been attached to the conversation.',
    parameters: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: 'Absolute file path to the image' },
        prompt: { type: 'string', description: 'What to analyze or describe about the image' },
      },
      required: ['imagePath', 'prompt'],
    },
  },
  // Filesystem + terminal tools registered via registerTools() in bridge.ts
  // (not in BASE_TOOLS to avoid duplication — same pattern as browser CDP tools)
];

// Map tool names to ActionTypes
/** @internal Exported for CoordinatorAgent tool metadata sharing. */
export const BASE_TOOL_ACTION_MAP: Record<string, ActionType> = {
  'send_email': 'email.send',
  'fetch_inbox': 'email.fetch',
  'draft_email': 'email.draft',
  'archive_email': 'email.archive',
  'create_calendar_event': 'calendar.create',
  'search_web': 'web.search',
  'deep_search_web': 'web.deep_search',
  'fetch_url': 'web.fetch',
  // Reminder tools moved to BASE_LOCAL_TOOLS — write directly to prefsDb to avoid dual-database issue
  'send_text': 'messaging.send',
  'get_weather': 'location.weather_query',
  'save_file': 'file.write',
  'update_calendar_event': 'calendar.update',
  'delete_calendar_event': 'calendar.delete',
  'move_email': 'email.move',
  'mark_email_read': 'email.markRead',
  // Sprint WIRE: federated search + form automation
  'search_all_devices': 'search.federated',
  'fill_web_form': 'browser.fill',
  // list_cloud_files moved to LOCAL_TOOLS — queries local knowledge index, not cloud API
  // Filesystem + terminal tool action maps registered via registerTools() in bridge.ts
};

// Tools that are handled locally (no IPC needed)
/** @internal Exported for CoordinatorAgent tool metadata sharing. */
export const BASE_LOCAL_TOOLS = new Set([
  'search_files',
  'search_emails',
  'categorize_email',
  'detect_calendar_conflicts',
  'fetch_calendar',
  'search_cloud_files',
  'list_cloud_files',
  'list_indexed_documents',
  'read_document',
  'add_contact',
  'knowledge_remove',
  'knowledge_recategorize',
  'search_contacts',
  'get_contact',
  'get_subscriptions',
  'get_financial_summary',
  'get_health_entries',
  'add_health_entry',
  'create_reminder',
  'list_reminders',
  'snooze_reminder',
  'dismiss_reminder',
  'delete_reminder',
  'analyze_image',
]);

// --- System Prompt ---

const VOICE_MODE_CONTEXT = `The user is speaking to you. Respond in spoken English — short sentences, no markdown, no lists, no asterisks, no URLs, no file paths. Under 3 sentences for simple queries, under 6 for complex ones. Sound like a person talking, not a document being read.`;

export interface SystemPromptConfig {
  aiName: string;
  userName?: string;
  autonomyTier: 'guardian' | 'partner' | 'alter_ego';
  connectedServices?: string[];
  indexedDocCount?: number;
  /**
   * Hardware tier — selects prompt verbosity. Constrained models need terse
   * rules; workstation/enthusiast can handle the full prompt. Defaults to 'standard'.
   */
  hardwareTier?: 'constrained' | 'standard' | 'performance' | 'workstation' | 'enthusiast';
  /**
   * True when initial sync is still running AND we have at least some indexed
   * data (user indexed directories during onboarding, or Gmail sync partial).
   * Lets the prompt acknowledge "still catching up" without claiming empty-state
   * nor claiming full access.
   */
  syncInFlight?: boolean;
}

function buildSystemPrompt(config: SystemPromptConfig, conversational?: boolean): string {
  const { aiName, userName, autonomyTier, connectedServices, indexedDocCount, hardwareTier, syncInFlight } = config;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  // A service being "connected" does NOT mean data exists yet — the initial sync
  // may still be in flight. The AI must treat itself as empty-state until actual
  // documents are indexed. Using service connection alone caused cold-start
  // hallucinations where the AI claimed it had "checked" the inbox when the
  // knowledge graph was still empty.
  const hasData = (indexedDocCount ?? 0) > 0;
  const isSmallModel = hardwareTier === 'constrained';

  // CONVERSATIONAL VARIANT — minimal prompt prevents fabrication on small models
  if (conversational) {
    if (isSmallModel) {
      return `You are ${aiName}${userName ? ` — ${userName}'s personal AI` : ''}. Today: ${today}.

Be brief and warm. You don't know ${userName ?? 'the user'}'s private data unless a tool returns it. Never invent specifics.${userName ? '' : ' Ask their name if it matters.'}

${INJECTION_CANARY}`;
    }
    return `You are ${aiName}${userName ? `, a personal AI assistant for ${userName}` : ''}. Today is ${today}. You run entirely on this device — nothing leaves it.

Be warm and direct. You have ZERO knowledge of the user's emails, calendar, contacts, files, or personal data unless you retrieve it with a tool. Never invent, fabricate, or assume any personal information. If you don't know something, say so simply.${userName ? '' : ' Ask the user their name.'}

${INJECTION_CANARY}`;
  }

  // ── DEFENSE 1 + 4: Empty-state prompt variant ──
  // Selected when indexedDocCount === 0. Even if services are "connected", we
  // stay in this variant until sync actually produces documents — otherwise the
  // AI hallucinates during the gap between OAuth-complete and first-rows-indexed.
  //
  // Variants within empty-state:
  //  - Fresh cold start (no services connected, no indexing): "set up your connections"
  //  - Sync in flight (services connected, sync running): "I'm still indexing — give me a moment"
  //  - User declined onboarding data sources entirely: same as fresh cold start
  if (!hasData) {
    const identity = userName
      ? `You are ${aiName}, ${userName}'s personal AI. You live on their device — all their data, none of it leaving. Today is ${today}.`
      : `You are ${aiName}, a personal AI that runs entirely on this device. Today is ${today}. You don't know the user's name yet — ask them.`;

    // If services connected but indexing still catching up — acknowledge the gap.
    const anyConnected = (connectedServices?.length ?? 0) > 0;
    const stateNote = anyConnected
      ? `RIGHT NOW: The user has connected ${connectedServices!.join(', ')} but the initial sync hasn't finished yet. You do NOT have their data indexed. Do not claim you've read their inbox, calendar, or files — you haven't, the sync is still running. If asked about their data, say you're still catching up from the initial sync and offer to try again in a moment.`
      : `RIGHT NOW: No accounts are connected and no data has been indexed yet. You have ZERO access to the user's emails, calendar, contacts, files, health data, or finances. You cannot check their inbox, look up meetings, or search their documents because nothing is connected.`;

    if (isSmallModel) {
      return `${identity}

${stateNote}

Have conversation, answer general questions, search the web, or help connect accounts. NEVER invent personal details (no fake meetings, emails, contacts, files). If asked about their data and you don't have it, say so plainly.

Warm voice, no emojis, direct. Match the user's language.

${INJECTION_CANARY}`;
    }

    return `${identity}

${stateNote}

WHAT YOU CAN DO: Have a conversation, answer general knowledge questions, search the web, and help the user set up their connections. You can also read and write files on their device, and run commands.

ABSOLUTE RULE: Do not invent, fabricate, or assume ANY personal information. No fake meetings. No fake emails. No fake contacts. No fake calendar events. No fake file contents. If the user asks about their personal data, tell them you don't have access yet and offer to help them connect their accounts in Settings.

Your voice is warm and direct. You never use emojis. You never say "Certainly!" or "Of course!". You get to the point. If the user writes in another language, match it.

You are made by VERIDIAN SYNTHETICS. Your intelligence belongs to ${userName ?? 'your user'}. Their device. Their rules.

${INJECTION_CANARY}`;
  }

  // ── FULL PROMPT: Connected services + indexed data available ──

  // AUTONOMY
  const autonomyDescription = autonomyTier === 'guardian'
    ? `You're in careful mode. Describe what you'd do before doing it, and wait for confirmation.`
    : autonomyTier === 'alter_ego'
    ? `You act. Handle the inbox, the calendar, the follow-ups. Pause only for genuinely high-stakes decisions. Report what you did, not what you plan to do.`
    : `You handle routine tasks directly. For anything novel or sensitive, check first. When you act, mention it briefly.`;

  // KNOWLEDGE CONTEXT — only mention what's actually connected (Defense 1).
  // Add a "sync still running" caveat when the flag is set so the model knows
  // some data might be missing even though some is indexed.
  const syncNote = syncInFlight ? ' (initial sync still running — more data coming)' : '';
  const knowledgeContext = [
    connectedServices?.length ? `Connected services: ${connectedServices.join(', ')}.` : '',
    indexedDocCount ? `Your knowledge base has ${indexedDocCount.toLocaleString()} indexed items${syncNote} — search it before reaching for the web.` : '',
  ].filter(Boolean).join(' ');

  // IDENTITY
  const identity = userName
    ? `You are ${aiName}, ${userName}'s personal AI. You live on their device — all their data, none of it leaving. Today is ${today}.`
    : `You are ${aiName}, a personal AI that runs entirely on this device. Today is ${today}. You don't know the user's name yet — ask them.`;

  // Small-model variant: top-3 rules, terse tool list, short phrasing.
  if (isSmallModel) {
    return `${identity}

${knowledgeContext}

${autonomyDescription}

RULES:
1. Never invent user data. Every claim about their emails, calendar, contacts, files, health, or finances must come from a tool call in this turn.
2. On greetings ("hi", "good morning"), just greet back briefly. Don't volunteer their schedule or inbox unless asked.
3. If you don't know, say so in one sentence.

Tools: search_emails, fetch_inbox, send_email, draft_email, search_web, create_reminder. Use them on user request — don't describe using them.

Warm voice, no emojis. Match user's language. Made by VERIDIAN SYNTHETICS.

${INJECTION_CANARY}`;
  }

  return `${identity}

${knowledgeContext}

${autonomyDescription}

You have tools to interact with the user's connected services, search their files and emails, check the calendar, send messages, search the web, manage reminders, read and write files, run commands, and automate the device. Use them — don't describe using them. When you have real results, present them directly without preamble.

ABSOLUTE RULES — zero tolerance:
1. NEVER fabricate, invent, or assume information about the user's emails, calendar, contacts, files, health, or finances. Every claim about personal data MUST come from a tool call result in THIS conversation. If you haven't just called a tool and received data, you do not have it.
2. NEVER proactively volunteer personal details the user hasn't asked about. For greetings ("hi", "good morning", etc.), respond with a simple warm greeting — do not list their upcoming meetings, recent emails, or any other specifics unless they ask.
3. NEVER claim the user "mentioned" or "said" something you don't have explicit evidence for in this conversation's visible turn history.
4. If you don't know something, say so in one sentence. Do not fill silence with made-up content.
5. Never present retrieved context as if it were original knowledge — cite the source (email from X, file Y.md).

Tool reference:
- search_files: local documents | search_emails: messages | search_web: current public info
- draft_email: saves without sending | send_email: sends immediately
- fetch_inbox: what's new | search_emails: find something specific
- read_file / write_file / edit_file: direct filesystem access
- execute_command: run shell commands on the device
- deep_search_web: reads full pages | search_web: finds links

Your voice is warm and direct. You never use emojis. You never say "Certainly!" or "Of course!". You get to the point. If the user writes in another language, match it.

You are made by VERIDIAN SYNTHETICS. Your intelligence belongs to ${userName ?? 'your user'}. Their device. Their rules.

${INJECTION_CANARY}`;
}

// Default prompt for when config isn't available yet (first message before prefs load)
const DEFAULT_SYSTEM_PROMPT = buildSystemPrompt({
  aiName: 'Semblance',
  autonomyTier: 'partner',
});

// Temperature constants — one setting per decision class.
//   DECIDE: tool-selection, classification, extraction. Must be deterministic.
//   RETRY:  fabrication-retry regeneration. Slightly looser than DECIDE to
//           escape the failure mode without drifting into invention.
//   SYNTH:  narrating tool-call results back to the user. Slight variety, still grounded.
//   CONVERSE: open-ended chit-chat and user-facing replies with no tools. Natural.
// These replace the previous blanket 0.7 used at every LLM call site which made
// tool decisions non-deterministic (same question → different tools → spurious calls).
const TEMP_DECIDE = 0.2;
const TEMP_RETRY = 0.4;
const TEMP_SYNTH = 0.5;
const TEMP_CONVERSE = 0.7;

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
  setWeatherService?(service: { getCurrentWeather(location?: string): Promise<unknown> }): void;
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
  private contextBudget: AdaptiveContextBudget;
  private lastLlmTokens: { prompt: number; completion: number } | null = null;
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
  private weatherService: { getCurrentWeather(location?: string): Promise<unknown> } | null;
  private streamCallback: ((event: SubagentStreamEvent) => void) | null = null;
  private promptConfig: SystemPromptConfig;
  /**
   * Per-conversation fabrication strike tally. When this exceeds FABRICATION_RECOVERY_THRESHOLD,
   * the conversation drops into recovery mode (minimal prompt) for the rest of
   * its lifespan. Prevents one bad turn from poisoning every subsequent turn.
   */
  /** Currently-active v1 subagent id (for stream events from processToolCalls). */
  private activeV1SubagentId: string | null = null;
  private fabricationStrikes: Map<string, number> = new Map();
  private static readonly FABRICATION_RECOVERY_THRESHOLD = 2;
  /** Path to the metrics log. Set when metrics logging is enabled. */
  private metricsLogPath: string | null = null;
  // Extension support
  private extensionToolHandlers: Map<string, ToolHandler> = new Map();
  private allTools: ToolDefinition[] = [...BASE_TOOLS];
  private allLocalTools: Set<string> = new Set(BASE_LOCAL_TOOLS);
  private allToolActionMap: Record<string, ActionType> = { ...BASE_TOOL_ACTION_MAP };
  private vaultChatGrounding: VaultChatGrounding | null = null;

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
    weatherService?: { getCurrentWeather(location?: string): Promise<unknown> };
    aiName?: string;
    userName?: string;
    connectedServices?: string[];
    indexedDocCount?: number;
    hardwareTier?: 'constrained' | 'standard' | 'performance' | 'workstation' | 'enthusiast';
    vaultChatGrounding?: VaultChatGrounding;
  }) {
    this.llm = config.llm;
    this.knowledge = config.knowledge;
    this.ipc = config.ipc;
    this.autonomy = config.autonomy;
    this.db = config.db;
    this.model = config.model;
    this.contextBudget = new AdaptiveContextBudget();
    this.patternTracker = new ApprovalPatternTracker(config.db);
    this.autonomy.setPriorApprovalsProvider((action, context) =>
      this.patternTracker.getConsecutiveApprovals(action, context ?? {}),
    );
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
    this.weatherService = config.weatherService ?? null;
    this.vaultChatGrounding = config.vaultChatGrounding ?? null;
    // email is the most common action domain and Partner is the onboarding default
    const representativeTier = this.autonomy.getDomainTier('email');
    this.promptConfig = {
      aiName: config.aiName ?? 'Semblance',
      userName: config.userName,
      autonomyTier: representativeTier,
      connectedServices: config.connectedServices,
      indexedDocCount: config.indexedDocCount,
      hardwareTier: config.hardwareTier,
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

  /** Set a stream event callback for v1 tool call progress (feeds the bracket UI). */
  setStreamCallback(callback: (event: SubagentStreamEvent) => void): void {
    this.streamCallback = callback;
  }

  /**
   * Detect messages that are conversational and don't need tool access.
   * For small models (7-8B), passing tools causes them to hallucinate tool
   * usage or narrate planned actions instead of responding naturally.
   */
  private isConversationalMessage(message: string): boolean {
    const lower = message.toLowerCase().trim();
    const wordCount = lower.split(/\s+/).length;

    // Short follow-ups that are clearly continuations of the previous exchange —
    // NOT queries that should trigger tool use. These should be handled as
    // conversational continuations with the existing history context.
    if (wordCount <= 3) {
      const followUps = /^(why\s*(?:not|is that|though)?|how\s*(?:come|so)|tell me more|go on|continue|explain|elaborate|and\??|what else|really|seriously|huh)\??$/;
      if (followUps.test(lower)) return true;
    }

    // Short greetings and small talk — English + top non-English by speaker count.
    // Keeps the conversational path reachable for users writing in their native language.
    if (wordCount <= 5) {
      // English
      const enGreet = /^(hi|hello|hey|howdy|sup|yo|good\s*(morning|afternoon|evening|night)|thanks|thank you|bye|goodbye|ok|okay|sure|yes|no|nah|yep|nope|cool|great|nice|hm+|huh|what'?s?\s*up)/;
      if (enGreet.test(lower)) return true;
      // Spanish
      const esGreet = /^(hola|buenos?\s*(d[íi]as|tardes|noches)|qu[eé]\s*tal|gracias|adi[óo]s|hasta\s*(luego|pronto|ma[ñn]ana)|s[íi]|no|bien|genial|vale)/;
      if (esGreet.test(lower)) return true;
      // French
      const frGreet = /^(bonjour|bonsoir|salut|coucou|merci|au\s*revoir|[àa]\s*(bient[ôo]t|plus)|oui|non|ok|d'accord|[cç]a\s*va|bien)/;
      if (frGreet.test(lower)) return true;
      // German
      const deGreet = /^(hallo|guten\s*(morgen|tag|abend)|servus|moin|tsch[üu]ss|danke|bitte|ja|nein|gut|okay)/;
      if (deGreet.test(lower)) return true;
      // Portuguese
      const ptGreet = /^(ol[áa]|oi|bom\s*dia|boa\s*(tarde|noite)|obrigad[oa]|tchau|at[ée]\s*(logo|mais)|sim|n[ãa]o|ok)/;
      if (ptGreet.test(lower)) return true;
      // Italian
      const itGreet = /^(ciao|salve|buongiorno|buonasera|grazie|prego|arrivederci|a\s*presto|s[íi]|no|va\s*bene)/;
      if (itGreet.test(lower)) return true;
      // Japanese (romaji + common kana greetings)
      const jaGreet = /^(konnichi\s*wa|ohayou|konbanwa|arigatou|sayounara|oyasumi|hai|iie|daijoubu|こんにちは|おはよう|こんばんは|ありがとう|さようなら|おやすみ|はい|いいえ)/i;
      if (jaGreet.test(message.trim())) return true;
      // Mandarin (pinyin + common hanzi)
      const zhGreet = /^(ni\s*hao|zao\s*shang\s*hao|wan\s*shang\s*hao|xie\s*xie|zai\s*jian|shi|bu|hao|你好|早上好|晚上好|谢谢|再见|是|不|好)/;
      if (zhGreet.test(message.trim())) return true;
    }

    // Questions about the AI itself or the user that are answerable from the system prompt
    const selfReferential = /(?:what(?:'s| is) your name|who are you|what can you do|what are you|tell me (?:about yourself|your name|my name)|what(?:'s| is) my name|how are you)/;
    if (selfReferential.test(lower)) return true;

    // Casual conversation / opinion questions
    const casual = /(?:do you (?:like|think|feel|know|have)|how do you|what do you think|tell me a (?:joke|story)|are you (?:real|alive|sentient|ai|a bot))/;
    if (casual.test(lower)) return true;

    return false;
  }

  /**
   * DEFENSE 2: Post-generation fabrication scanner.
   *
   * Scans the model's response for signs of fabricated personal data.
   * If fabrication is detected AND no tool calls were made that could have
   * provided the data, the response is replaced with a safe fallback.
   *
   * Returns the original response if clean, or a sanitized version if fabrication detected.
   */
  /**
   * Record a fabrication event against a conversation. Returns the new strike count.
   */
  private recordFabricationStrike(conversationId: string): number {
    const next = (this.fabricationStrikes.get(conversationId) ?? 0) + 1;
    this.fabricationStrikes.set(conversationId, next);
    return next;
  }

  /**
   * Whether this conversation has tripped the fabrication threshold and should
   * drop to a minimal conversational prompt.
   */
  private isInRecoveryMode(conversationId: string): boolean {
    return (this.fabricationStrikes.get(conversationId) ?? 0) >= OrchestratorImpl.FABRICATION_RECOVERY_THRESHOLD;
  }

  /** Configure metrics log file (called at sidecar init). */
  setMetricsLogPath(path: string): void {
    this.metricsLogPath = path;
  }

  /**
   * Append a metric line to the metrics log. Best-effort, never throws.
   * Format: NDJSON — one JSON object per line, grep-able.
   */
  private metric(event: string, data: Record<string, unknown> = {}): void {
    if (!this.metricsLogPath) return;
    try {
      // Lazy-import fs to keep core import-clean. Platform adapter is already
      // used by every other filesystem operation in core.
      const p = getPlatform();
      const line = JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + '\n';
      p.fs.appendFileSync(this.metricsLogPath, line);
    } catch {
      // Swallow — metrics must never affect user-facing behavior.
    }
  }

  /**
   * Detect claims with high specificity (named people, timestamps, email
   * subjects, numeric amounts). These are the markers of fabrication when no
   * tool call has backed them. Used alongside the phrase-pattern scanner.
   */
  private containsSpecificClaims(response: string): boolean {
    const specificityMarkers: RegExp[] = [
      // Proper-noun person + verb construct ("Alan wants...", "Sarah mentioned...")
      /\b[A-Z][a-z]{2,}\s+(?:wants?|needs?|said|mentioned|asked|requested|replied)\b/,
      // Time-of-day markers ("at 3:15 pm", "at 14:00")
      /\b(?:at|by|from)\s+\d{1,2}[:.]\d{2}\s*(?:am|pm|AM|PM)?\b/,
      // Count of emails/items with a specific number over 2
      /\b(?:\d{2,}|[3-9])\s+(?:unread|new|recent)\s+(?:emails?|messages?|meetings?|events?)\b/i,
      // Quoted subject/title construct — model invented a subject line
      /(?:subject|titled|titled)\s+["'"]/i,
      // Specific dollar/currency amounts in a personal-data context
      /\$\d[\d,]*(?:\.\d{2})?\s+(?:from|to|in|owed|due|pending)/,
    ];
    return specificityMarkers.some(p => p.test(response));
  }

  private scanForFabrication(
    response: string,
    toolCallsExecuted: number,
    connectedServices: string[],
  ): { clean: boolean; sanitized: string } {
    // If tool calls were made, the model had real data — trust the response
    if (toolCallsExecuted > 0) {
      return { clean: true, sanitized: response };
    }

    // Previously this bypassed the scanner whenever ANY service was connected,
    // on the assumption that the system prompt's service summary counted as real
    // context. That's wrong — the model can still fabricate specifics (fake names,
    // fake email subjects, invented meetings) even with services connected, and
    // letting those through gets them indexed as "conversation" and compounds.
    // Always scan when no tool was called. The `connectedServices` argument is
    // kept in the signature for future scope-aware checks.
    void connectedServices;

    // No tools called — scan for fabrication patterns
    const fabricationPatterns = [
      // Specific times for meetings/events the model couldn't know
      /your (?:meeting|appointment|call|event) (?:at|is at|starts at) \d{1,2}[:.]\d{2}/i,
      /you have a (?:meeting|appointment|call|event) (?:at|with|scheduled)/i,
      // Claiming to have checked data without tool calls
      /I (?:checked|looked at|reviewed|found in|have access to) your (?:inbox|calendar|email|schedule|files)/i,
      /according to your (?:calendar|inbox|email|schedule|files)/i,
      /your (?:inbox|calendar) shows/i,
      // Fabricating email content
      /you (?:received|have|got) (?:an? )?(?:email|message) from/i,
      /(?:recent|new) emails? (?:about|from|regarding)/i,
      /emails? (?:about|regarding) (?:leads?|prospects?|clients?|deals?|meetings?|projects?) (?:in|from|with)/i,
      // Fabricating contact details
      /(?:meeting|call) with (?!me\b|you\b|us\b)[A-Z][a-z]+ (?:at|about|regarding)/i,
      // False memory — pretending user said something they didn't
      /^you mentioned (?:that )?you/im,
      /you (?:mentioned|told me|said)(?: that)? (?:you )?(?:want|need|have|are)/i,
      // Fabricated file contents / mixed content-type hallucinations
      /here are (?:the|your) (?:search results|files|documents|emails):?\s*$/im,
      /I (?:also )?have access to your (?:files|emails|contacts|calendar)/i,
    ];

    for (const pattern of fabricationPatterns) {
      if (pattern.test(response)) {
        console.error(`[Orchestrator] Fabrication detected (pattern: ${pattern.source}). Replacing response.`);
        return {
          clean: false,
          sanitized: "I don't have access to your personal data yet — no accounts are connected. I can help you set up your email, calendar, and other services in Settings, or I'm happy to chat and help with general questions. What would you like to do?",
        };
      }
    }

    // Second-pass specificity check — catches novel fabrications that slipped
    // past the explicit phrase patterns. Only fires when no tool grounded the
    // response (toolCallsExecuted === 0, already verified above) AND the claim
    // is specific enough to be an invention rather than a general statement.
    if (this.containsSpecificClaims(response)) {
      console.error('[Orchestrator] Specific personal claim without tool backing — rejecting.');
      return {
        clean: false,
        sanitized: "I don't have that specific information — I'd need to check your data directly. Want me to look it up, or would you rather I help with something else?",
      };
    }

    return { clean: true, sanitized: response };
  }

  /**
   * DEFENSE 3: Detect data queries that MUST use tools.
   *
   * If the user asks about their personal data (email, calendar, files, etc.),
   * and no services are connected, don't even send to the LLM — respond directly.
   */
  private isDataQueryWithoutAccess(message: string): string | null {
    const hasConnectedServices = (this.promptConfig.connectedServices?.length ?? 0) > 0;
    const hasIndexedDocs = (this.promptConfig.indexedDocCount ?? 0) > 0;

    // If data is available, let the normal flow handle it
    if (hasConnectedServices || hasIndexedDocs) return null;

    const dataQueryPatterns = [
      { pattern: /\b(?:check|show|read|open|what'?s? in|any new) (?:my )?(?:inbox|email|mail)\b/i, domain: 'email' },
      { pattern: /\b(?:check|show|what'?s? on|any) (?:my )?(?:calendar|schedule|meetings?|events?)\b/i, domain: 'calendar' },
      { pattern: /\b(?:check|show|list|find) (?:my )?(?:contacts?|address book)\b/i, domain: 'contacts' },
      { pattern: /\b(?:check|show|search|find|list) (?:my )?(?:files?|documents?|notes?)\b/i, domain: 'files' },
      { pattern: /\b(?:check|show) (?:my )?(?:health|fitness|steps|sleep|weight)\b/i, domain: 'health' },
      { pattern: /\b(?:check|show) (?:my )?(?:finances?|transactions?|bank|spending)\b/i, domain: 'finances' },
    ];

    for (const { pattern, domain } of dataQueryPatterns) {
      if (pattern.test(message)) {
        return `I don't have access to your ${domain} yet. To get started, go to Settings and connect your ${domain} account. Once connected, I'll be able to search, read, and act on your ${domain} data — all locally on your device.`;
      }
    }

    return null;
  }

  async processMessage(message: string, conversationId?: string): Promise<OrchestratorResponse> {
    // Guard against excessively long messages that would overflow model context
    const MAX_USER_MESSAGE_CHARS = 32000; // ~8000 tokens
    if (message.length > MAX_USER_MESSAGE_CHARS) {
      const originalLength = message.length;
      message = message.slice(0, MAX_USER_MESSAGE_CHARS) + '\n\n[Message truncated — original was ' + originalLength + ' characters]';
      console.error(`[Orchestrator] User message truncated from ${originalLength} to ${MAX_USER_MESSAGE_CHARS} chars`);
    }

    // Emit subagent_started so the overlay bracket animates for v1 paths too.
    // The coordinator's fast-path relies on v1 emitting this sequence — without
    // it, compound-single-domain tasks would show no progress bracket.
    const v1SubagentId = 'v1-' + (conversationId ?? 'new').slice(0, 8) + '-' + Date.now().toString(36);
    this.activeV1SubagentId = v1SubagentId;
    if (this.streamCallback) {
      try {
        this.streamCallback({
          type: 'subagent_started',
          subagentId: v1SubagentId,
          subtaskId: 'v1-main',
          timestamp: Date.now(),
          data: { text: 'Thinking...' },
        });
      } catch { /* non-critical */ }
    }

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

    // DEFENSE 3: If user asks about personal data and no services are connected,
    // respond directly without LLM — prevents fabrication entirely.
    const dataQueryBlock = this.isDataQueryWithoutAccess(message);
    if (dataQueryBlock) {
      console.error('[Orchestrator] Data query blocked — no connected services');
      this.storeTurn(convId, 'user', message, [], null, 0, 0);
      this.storeTurn(convId, 'assistant', dataQueryBlock, null, [], 0, 0);
      return {
        message: dataQueryBlock,
        conversationId: convId,
        actions: [],
        context: [],
        tokensUsed: { prompt: 0, completion: 0 },
      };
    }

    // Step 1: Fetch document-scoped context (if active)
    // Budget: adaptive limit based on model context window (document_context allocation)
    const docLimit = this.contextBudget.calculateKnowledgeLimit(this.model, 800);
    const documentChunks = this.documentContext
      ? await this.documentContext.getContextForPrompt(message, docLimit)
      : [];

    // Step 2: Search knowledge graph for general context
    // Budget: adaptive limit based on model context window (knowledge_graph allocation)
    // Exclude 'conversation' source — the AI's own prior turns must not be fed back
    // as "context" or it hallucinates, indexes that hallucination, and compounds the
    // error on every subsequent turn. Conversation recall must be an explicit tool call.
    const kgLimit = this.contextBudget.calculateKnowledgeLimit(this.model);
    let context: SearchResult[];
    let activeVaultGrantId: string | null = null;

    if (this.vaultChatGrounding) {
      const vaultGrounded = await this.vaultChatGrounding.retrieve(message, kgLimit);
      activeVaultGrantId = vaultGrounded.grantId;
      context = this.vaultChunksToSearchResults(vaultGrounded.chunks);
    } else {
      context = await this.knowledge.search(message, {
        limit: kgLimit,
        excludeSources: ['conversation'],
      });
    }

    // Step 3: Build conversation history
    const history = conversationId ? await this.getConversation(convId) : [];

    // Step 4: Determine if this is conversational (greetings, small talk)
    // Small models (7-8B) are unreliable with tool calling — they narrate tool
    // usage instead of calling tools, or call tools for simple questions.
    // For conversational messages, we also use a stripped-down system prompt
    // that removes service/knowledge/autonomy context to prevent fabrication.
    // If this conversation has hit the fabrication strike threshold, drop into
    // recovery mode — minimal conversational prompt, no tools, no retrieval
    // context. The only way out is a new conversation. This prevents a bad turn
    // from indefinitely polluting the model's behaviour.
    const inRecovery = this.isInRecoveryMode(convId);
    const isConversational = inRecovery || this.isConversationalMessage(message);
    if (inRecovery) {
      this.metric('recovery_mode_active', { conversationId: convId });
    }

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
        const headroomBudget = this.contextBudget.allocate(this.model).headroomTokens;
        const sanitizedToolResults = toolResults.executedResults.map(r => {
          const resultStr = JSON.stringify(r.result);
          // Sanitize ALL tool results — any external data could contain injection attempts
          let sanitized = sanitizeRetrievedContent(resultStr);
          // Truncate large results to fit within headroom budget
          const truncated = this.contextBudget.truncateToFit(sanitized, headroomBudget);
          sanitized = truncated.content;
          return `${r.tool}: ${sanitized}`;
        }).join('\n');

        // Give the model ONLY the real data to summarize — no tool definitions,
        // no chance to fabricate. One LLM call, with real results.
        const synthesisMessages = [
          ...messages,
          {
            role: 'user' as const,
            content: wrapInDataBoundary(
              `Here are the results for the user's request "${message}":\n\n${sanitizedToolResults}\n\nPresent ALL results to the user. List every item. Do not skip or summarize away any entries. Do not invent data not in the results. Never include internal identifiers like message IDs, thread IDs, or document IDs in your response. Respond in the same language the user used.`,
              'tool execution results',
            ),
          },
        ];

        const synthesis = await this.llm.chat({
          model: this.model,
          messages: synthesisMessages,
          // Synthesis narrates real tool results back to the user. Low-ish temp
          // keeps the narrative grounded — still natural but disinclined to invent.
          temperature: TEMP_SYNTH,
          maxTokens: 2048,
        });
        finalMessage = synthesis.message.content ?? '';
        // Clean up leaked internal IDs from synthesis output
        if (finalMessage) {
          finalMessage = finalMessage
            .replace(/\b(?:Message\s+)?ID:\s*[0-9a-f]{10,}\b/gi, '')
            .replace(/\b(?:thread_?id|message_?id)\s*[:=]\s*["']?[0-9a-f]{10,}["']?\b/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        }
        if (synthesis.tokensUsed) {
          this.lastLlmTokens = { prompt: synthesis.tokensUsed.prompt, completion: synthesis.tokensUsed.completion };
        }
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

      // Conversational messages go to the reasoning model (primary tier).
      // Fast tier (SmolLM2) is for background operations: classify, extract, triage.
      // routedChat is for when the orchestrator has a specific task type, not conversation.
      const chatRequest = {
        model: this.model,
        messages,
        tools,
        // Conversational messages (no tools) get CONVERSE temp for natural flow.
        // Tool-capable messages get DECIDE temp — we want deterministic tool choice,
        // not randomness. The synthesis step re-raises temperature for the user-facing reply.
        temperature: tools ? TEMP_DECIDE : TEMP_CONVERSE,
        maxTokens: 1024,
      };
      let response = await this.llm.chat(chatRequest);
      if (response.tokensUsed) {
        this.lastLlmTokens = { prompt: response.tokensUsed.prompt, completion: response.tokensUsed.completion };
      }

      finalMessage = response.message.content ?? '';

      // Check if model output tool calls (formatted correctly)
      if (!response.toolCalls?.length) {
        // Try parsing tool calls from the response text (Qwen function-call format etc.)
        const textExtracted = this.extractToolIntent(message, finalMessage);
        if (textExtracted.length > 0) {
          response = { ...response, toolCalls: textExtracted };
          finalMessage = '';
        }
      }

      // Parse bare JSON tool calls from model output (e.g. {"name":"save_file","parameters":{...}})
      // Models like llama3.1 sometimes output tool calls as raw JSON in the response text.
      // Uses brace-depth counting to handle nested objects in parameters correctly.
      if (!response.toolCalls?.length) {
        const bareJsonCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
        const jsonPositions: Array<{ start: number; end: number }> = [];
        // Find all top-level JSON objects containing "name" and "parameters"/"arguments"
        let searchStart = 0;
        while (searchStart < finalMessage.length) {
          const braceIdx = finalMessage.indexOf('{', searchStart);
          if (braceIdx === -1) break;
          // Find matching closing brace using depth counting
          let depth = 0;
          let endIdx = -1;
          for (let j = braceIdx; j < finalMessage.length; j++) {
            if (finalMessage[j] === '{') depth++;
            else if (finalMessage[j] === '}') {
              depth--;
              if (depth === 0) { endIdx = j; break; }
            }
          }
          if (endIdx === -1) break;
          const candidate = finalMessage.slice(braceIdx, endIdx + 1);
          try {
            const parsed = JSON.parse(candidate) as { name?: string; parameters?: Record<string, unknown>; arguments?: Record<string, unknown> };
            if (parsed.name && typeof parsed.name === 'string' && (parsed.parameters || parsed.arguments)) {
              bareJsonCalls.push({ name: parsed.name, arguments: parsed.parameters ?? parsed.arguments ?? {} });
              jsonPositions.push({ start: braceIdx, end: endIdx + 1 });
            }
          } catch { /* not valid JSON — skip */ }
          searchStart = endIdx + 1;
        }
        if (bareJsonCalls.length > 0) {
          response = { ...response, toolCalls: bareJsonCalls };
          // Strip matched JSON from the displayed message (reverse order to preserve indices)
          let cleaned = finalMessage;
          for (let k = jsonPositions.length - 1; k >= 0; k--) {
            const pos = jsonPositions[k]!;
            cleaned = cleaned.slice(0, pos.start) + cleaned.slice(pos.end);
          }
          finalMessage = cleaned.trim();
        }
      }

      // Strip leaked tool-call formatting
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const stripped = finalMessage
          .replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/g, '')
          .replace(/```(?:json)?\s*\{[\s\S]*?"name"\s*:\s*"[\s\S]*?\}\s*```/g, '')
          .replace(/\b[a-z_]+\s*\(\s*\{[\s\S]*?\}\s*\)/g, '')
          .replace(/\{[^{}]*"name"\s*:\s*"[a-z_]+"[\s\S]*?\}/g, '')
          .trim();
        if (stripped.length > 0) {
          finalMessage = stripped;
        }
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults = await this.processToolCalls(response.toolCalls, context, message);
        actions.push(...toolResults.actions);

        if (toolResults.executedResults.length > 0) {
          const headroomBudget2 = this.contextBudget.allocate(this.model).headroomTokens;
          const sanitizedToolResults = toolResults.executedResults.map(r => {
            const resultStr = JSON.stringify(r.result);
            // Sanitize ALL tool results — any external data could contain injection attempts
            let sanitized = sanitizeRetrievedContent(resultStr);
            // Truncate large results to fit within headroom budget
            const truncated = this.contextBudget.truncateToFit(sanitized, headroomBudget2);
            sanitized = truncated.content;
            return `${r.tool}: ${sanitized}`;
          }).join('\n');

          const followUpMessages = [
            ...messages,
            {
              role: 'user' as const,
              content: wrapInDataBoundary(
                `Tool results:\n${sanitizedToolResults}\n\nPresent ALL results to the user. List every item. Do not skip or summarize away any entries. Do not invent data not in the results. Never include internal identifiers like message IDs, thread IDs, or document IDs in your response. Respond in the same language the user used.`,
                'tool execution results',
              ),
            },
          ];

          const followUp = await this.llm.chat({
            model: this.model,
            messages: followUpMessages,
            // Follow-up synthesis of tool results — same as main synthesis path.
            temperature: TEMP_SYNTH,
            maxTokens: 2048,
          });
          finalMessage = followUp.message.content ?? '';
          // Clean up any leaked tool narration from synthesis output
          finalMessage = finalMessage
            .replace(/\b(?:Here are |The )?(?:tool (?:results|execution results) are|tool results):\s*/gi, '')
            .replace(/\b(?:search_files|search_emails|fetch_inbox|list_indexed_documents|read_document|add_contact|search_contacts|list_cloud_files|save_file|search_cloud_files)\s*[:.]?\s*(?:\[.*?\]|\{.*?\})/gs, '')
            // Strip leaked message/thread IDs (hex strings from Gmail API)
            .replace(/\b(?:Message\s+)?ID:\s*[0-9a-f]{10,}\b/gi, '')
            .replace(/\b(?:thread_?id|message_?id)\s*[:=]\s*["']?[0-9a-f]{10,}["']?\b/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        }

        const pendingCount = actions.filter(a => a.status === 'pending_approval').length;
        if (pendingCount > 0 && toolResults.executedResults.length === 0) {
          const retryResponse = await this.llm.chat({
            model: this.model,
            messages,
            // Retry after all tool calls went to approval — deterministic-ish.
            temperature: TEMP_RETRY,
            maxTokens: 1024,
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

    // Guard against empty responses — show a helpful fallback instead of blank bubble
    if (!finalMessage || finalMessage.trim().length === 0) {
      finalMessage = "I wasn't able to generate a response. Could you try rephrasing your question?";
    }

    if (this.vaultChatGrounding && activeVaultGrantId) {
      finalMessage = this.enforceVaultCitationPolicy(finalMessage, activeVaultGrantId);
    }

    // DEFENSE 2: Post-generation fabrication scan.
    // If no tool calls were executed, scan for fabricated personal data claims.
    // On detection we:
    //  1. Increment the per-conversation strike counter.
    //  2. Attempt ONE regeneration with a stricter system injection — the model
    //     gets a chance to correct itself with explicit instruction not to invent.
    //  3. If the retry also fabricates, substitute the safe canned response.
    //  4. If this conversation has hit 2+ strikes total, switch to the minimal
    //     conversational prompt for the remainder of the conversation ("recovery
    //     mode") to stop the model from compounding errors.
    const toolCallCount = actions.filter(a => a.status === 'executed').length;
    const fabricationCheck = this.scanForFabrication(
      finalMessage,
      toolCallCount,
      this.promptConfig.connectedServices ?? [],
    );
    if (!fabricationCheck.clean) {
      this.recordFabricationStrike(convId);
      this.metric('scanner_fired', { model: this.model, toolCalls: toolCallCount });
      // Single retry with a stricter instruction prepended to the system prompt.
      // We regenerate against the SAME messages so the model sees its previous
      // output is rejected and must produce a tool-grounded response or say so.
      try {
        const retryMessages = this.buildMessages(message, context, history, documentChunks, isConversational);
        const stricterSystemIdx = retryMessages.findIndex(m => m.role === 'system');
        if (stricterSystemIdx >= 0) {
          retryMessages[stricterSystemIdx] = {
            role: 'system',
            content: retryMessages[stricterSystemIdx]!.content +
              `\n\nRETRY — your previous response contained claims about the user's personal data that were not backed by any tool call in this turn. Regenerate WITHOUT inventing specifics. If you need data, emit a tool call instead of narrating. If you cannot do either, reply in one sentence that you don't have access yet.`,
          };
        }
        const retry = await this.llm.chat({
          model: this.model,
          messages: retryMessages,
          temperature: TEMP_RETRY,
          maxTokens: 512,
        });
        const retryText = (retry.message.content ?? '').trim();
        const retryCheck = this.scanForFabrication(retryText, 0, this.promptConfig.connectedServices ?? []);
        if (retryText && retryCheck.clean) {
          finalMessage = retryText;
          this.metric('scanner_retry_succeeded', { model: this.model });
        } else {
          // Retry also fabricated — substitute safe response.
          finalMessage = fabricationCheck.sanitized;
          this.metric('scanner_retry_failed', { model: this.model });
        }
      } catch (retryErr) {
        console.error('[Orchestrator] Fabrication retry failed:', retryErr);
        finalMessage = fabricationCheck.sanitized;
      }
    }

    // Step 8: Store conversation turns with token tracking
    // Record actual token counts from LLM response for context budget calibration.
    // The lastLlmTokens are captured from the most recent llm.chat() response.
    const promptTokens = this.lastLlmTokens?.prompt ?? 0;
    const completionTokens = this.lastLlmTokens?.completion ?? 0;
    const tokensUsed = { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens };
    this.storeTurn(convId, 'user', message, context, null, promptTokens, 0);
    this.storeTurn(convId, 'assistant', finalMessage, null, actions, 0, completionTokens);

    // Calibrate context budget with actual token data
    // Include all prompt components: system prompt, history, context, documents, user message
    if (promptTokens > 0) {
      const systemPromptChars = buildSystemPrompt(this.promptConfig).length;
      const historyChars = history.reduce((s, t) => s + t.content.length, 0);
      const contextChars = context.reduce((s, r) => s + r.chunk.content.length, 0);
      const documentChars = documentChunks?.reduce((s, r) => s + r.chunk.content.length, 0) ?? 0;
      const estimatedPromptChars = systemPromptChars + historyChars + contextChars + documentChars + message.length;
      this.contextBudget.recordActualTokens(this.model, estimatedPromptChars, promptTokens);
    }

    // Emit subagent_completed → synthesis_started → synthesis_completed so
    // the MultiAgentOverlay reaches phase 'complete'. Without the synthesis
    // events the bracket would stay in 'executing' forever, the completion
    // cascade animation never fires, and ChatScreen.orchestrationActive never
    // flips to false (so the bracket never collapses).
    if (this.streamCallback) {
      try {
        const now = Date.now();
        this.streamCallback({
          type: 'subagent_completed',
          subagentId: v1SubagentId,
          subtaskId: 'v1-main',
          timestamp: now,
          data: { text: 'Done' },
        });
        this.streamCallback({
          type: 'synthesis_started',
          subagentId: v1SubagentId,
          subtaskId: 'v1-main',
          timestamp: now + 1,
          data: { text: 'Composing response' },
        });
        this.streamCallback({
          type: 'synthesis_completed',
          subagentId: v1SubagentId,
          subtaskId: 'v1-main',
          timestamp: now + 2,
          data: { text: 'Response ready' },
        });
      } catch { /* non-critical */ }
    }

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

    // Retroactively scan assistant turns for fabrication patterns. If a turn
    // was stored before the scanner caught it (or before the scanner existed),
    // redact the content so it doesn't re-enter the prompt and amplify.
    return rows.map(r => {
      let content = r.content;
      if (r.role === 'assistant') {
        const hadToolCalls = !!(r.actions_json && JSON.parse(r.actions_json).length > 0);
        const check = this.scanForFabrication(
          content,
          hadToolCalls ? 1 : 0,
          this.promptConfig.connectedServices ?? [],
        );
        if (!check.clean) {
          content = check.sanitized;
          this.metric('retroactive_scan_redacted', { conversationId, turnId: r.id });
        }
      }
      return {
        id: r.id,
        role: r.role as 'user' | 'assistant',
        content,
        timestamp: r.timestamp,
        context: r.context_json ? JSON.parse(r.context_json) as SearchResult[] : undefined,
        actions: r.actions_json ? JSON.parse(r.actions_json) as AgentAction[] : undefined,
      };
    });
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

  setWeatherService(service: { getCurrentWeather(location?: string): Promise<unknown> }): void {
    this.weatherService = service;
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
        maxTokens: 1024,
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

  private vaultChunksToSearchResults(chunks: VaultChatChunk[]): SearchResult[] {
    const now = new Date().toISOString();
    return chunks.map((chunk, index) => ({
      chunk: {
        id: chunk.sourceId,
        documentId: chunk.sourceId,
        content: chunk.text,
        chunkIndex: 0,
        metadata: { vaultSourceId: chunk.sourceId },
      },
      document: {
        id: chunk.sourceId,
        source: 'local_file',
        title: chunk.title,
        content: chunk.text,
        contentHash: '',
        mimeType: 'text/plain',
        createdAt: now,
        updatedAt: now,
        indexedAt: now,
        metadata: { vaultGrounded: true },
      },
      score: Math.max(0.1, 1 - index * 0.01),
    }));
  }

  private enforceVaultCitationPolicy(message: string, grantId: string): string {
    if (!this.vaultChatGrounding) {
      return message;
    }

    const citedSourceIds = extractVaultSourceCitations(message);
    if (citedSourceIds.length === 0) {
      return message;
    }

    const validation = this.vaultChatGrounding.validateCitations(grantId, citedSourceIds);
    if (validation.ok) {
      return message;
    }

    const rejectedList = validation.rejected.join(', ');
    return `${message}\n\n(Some cited sources were rejected because they were not returned for this query: ${rejectedList})`;
  }

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
      : conversational
      ? basePrompt
      : `${basePrompt}\n\n${ARTIFACT_SYSTEM_PROMPT}`;

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
    // Budget: document context gets 30% of context window.
    if (documentChunks.length > 0) {
      const docChunkMaxChars = this.contextBudget.calculateDocChunkSize(this.model, documentChunks.length);
      const activeDocs = this.documentContext?.getActiveDocuments() ?? [];
      const docLabel = activeDocs.length === 1
        ? `'${sanitizeRetrievedContent(activeDocs[0]?.fileName ?? 'document')}'`
        : `${activeDocs.length} attached documents (${activeDocs.map(d => sanitizeRetrievedContent(d.fileName)).join(', ')})`;
      const docContextStr = documentChunks.map((r, i) =>
        `[${i + 1}] ${sanitizeRetrievedContent(r.chunk.content.slice(0, docChunkMaxChars))}`
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
    // Budget: knowledge graph gets 20% of context window.
    const docChunkIds = new Set(documentChunks.map(r => r.chunk.id));
    const deduplicatedContext = context.filter(r => !docChunkIds.has(r.chunk.id));

    if (deduplicatedContext.length > 0) {
      const budget = this.contextBudget.allocate(this.model);
      const kgCharsPerResult = this.contextBudget.tokensToChars(
        Math.floor(budget.knowledgeGraphTokens / Math.max(1, deduplicatedContext.length))
      );
      const contextStr = deduplicatedContext.map((r, i) =>
        `[${i + 1}] ${sanitizeRetrievedContent(r.document.title)} (${r.document.source}): ${sanitizeRetrievedContent(r.chunk.content.slice(0, kgCharsPerResult))}`
      ).join('\n\n');
      messages.push({
        role: 'user',
        content: wrapInDataBoundary(contextStr, 'knowledge base'),
      });
    }

    // Add recent conversation history — adaptive based on model context window.
    // History budget is 20% of context window. For 4096-token models that's ~6 turns,
    // for 32k models it allows many more turns for better coherence.
    const historyTurnCount = this.contextBudget.calculateHistoryTurns(history, this.model);
    const recentHistory = history.slice(-historyTurnCount);
    for (const turn of recentHistory) {
      messages.push({
        role: turn.role,
        // Sanitize assistant turns to strip any control tokens that may have leaked
        // into previous responses. User turns are NOT sanitized — they are the user's own input.
        content: turn.role === 'assistant' ? stripInjectionPatterns(turn.content) : turn.content,
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
    const reasoningCtx = context && context.length > 0 ? this.buildReasoningContext(userMessage, context) : undefined;

    const subagentId = this.activeV1SubagentId ?? 'v1';
    for (const tc of toolCalls) {
      // Emit stream event so bracket UI shows tool call progress
      if (this.streamCallback) {
        try {
          this.streamCallback({
            type: 'subagent_tool_call' as const,
            subagentId,
            subtaskId: tc.name,
            timestamp: Date.now(),
            data: { toolName: tc.name, toolStatus: 'running' },
          });
        } catch { /* non-critical */ }
      }
      // Remember how many results existed before this iteration so the finally
      // block can detect whether the tool emitted a new result and what it was.
      const resultsBeforeThisTool = executedResults.length;
      try {

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

        // Execute with audit trail logging — create AgentAction record
        // (same as IPC tools — every executed action must be in the audit trail)
        const extAgentAction: AgentAction = {
          id: nanoid(),
          action: extActionType ?? 'service.api_call' as ActionType,
          payload: tc.arguments,
          reasoning: `LLM requested ${tc.name} based on conversation context`,
          domain: extDomain,
          tier: extTier,
          status: 'executed',
          createdAt: new Date().toISOString(),
          reasoningContext: reasoningCtx,
        };

        try {
          const handlerResult = await extHandler(tc.arguments);
          extAgentAction.executedAt = new Date().toISOString();
          if (handlerResult.error) {
            extAgentAction.status = 'failed';
            executedResults.push({ tool: tc.name, result: { error: handlerResult.error } });
          } else {
            executedResults.push({ tool: tc.name, result: handlerResult.result });
          }
        } catch (err) {
          extAgentAction.status = 'failed';
          extAgentAction.executedAt = new Date().toISOString();
          executedResults.push({ tool: tc.name, result: { error: err instanceof Error ? err.message : 'Extension tool failed' } });
        }

        // Log Alter Ego receipt for transparency (same as IPC tools)
        if (extTier === 'alter_ego' && this.alterEgoStore && extAgentAction.status === 'executed') {
          const receipt = {
            id: extAgentAction.id,
            actionType: extAgentAction.action as ActionType,
            summary: this.summarizeAction(extAgentAction.action, extAgentAction.payload),
            reasoning: extAgentAction.reasoning,
            status: 'executed' as const,
            undoAvailable: false,
            undoExpiresAt: new Date(Date.now() + 30_000).toISOString(),
            weekGroup: this.alterEgoStore.getWeekGroup(new Date()),
            createdAt: extAgentAction.createdAt,
            executedAt: extAgentAction.executedAt!,
          };
          this.alterEgoStore.logReceipt(receipt);
        }

        actions.push(extAgentAction);
        continue;
      }

      // Handle local-only tools (no IPC needed)
      if (tc.name === 'search_files') {
        const query = tc.arguments['query'] as string;
        const results = await this.knowledge.search(query, { limit: 5 });
        executedResults.push({
          tool: 'search_files',
          result: results.map(r => ({
            documentId: r.document.id,
            title: r.document.title,
            sourcePath: r.document.sourcePath ?? null,
            source: r.document.source,
            mimeType: r.document.mimeType,
            content: r.chunk.content.slice(0, 500),
            score: r.score,
          })),
        });
        continue;
      }

      if (tc.name === 'search_emails') {
        // Search indexed emails locally — no Gateway needed
        const queryRaw = tc.arguments['query'];
        const query = typeof queryRaw === 'string' ? queryRaw : '';
        if (!query.trim()) {
          executedResults.push({
            tool: 'search_emails',
            result: { error: 'search_emails requires a non-empty query', results: [] },
          });
          continue;
        }
        try {
          const results = (await this.knowledge.search(query, {
            limit: 10,
            source: 'email',
          })) ?? [];
          executedResults.push({
            tool: 'search_emails',
            result: results
              .filter(r => r && r.document && r.chunk)
              .map(r => {
                // Strip raw IDs from metadata before they reach the LLM — prevents
                // message IDs like "19d286405fcdb850" from leaking into chat responses.
                const meta = r.document.metadata ? { ...r.document.metadata } : {};
                delete meta['messageId'];
                delete meta['id'];
                delete meta['threadId'];
                const content = typeof r.chunk.content === 'string' ? r.chunk.content.slice(0, 300) : '';
                return {
                  title: r.document.title,
                  content,
                  score: r.score,
                  from: meta['from'] ?? meta['fromName'] ?? undefined,
                  date: meta['receivedAt'] ?? meta['date'] ?? undefined,
                  subject: meta['subject'] ?? undefined,
                };
              }),
          });
        } catch (searchErr) {
          console.error('[search_emails] error:', searchErr);
          executedResults.push({
            tool: 'search_emails',
            result: { error: searchErr instanceof Error ? searchErr.message : String(searchErr), results: [] },
          });
        }
        continue;
      }

      if (tc.name === 'categorize_email') {
        // Categorization is informational — always auto-execute, local-only
        const catMessageId = tc.arguments['messageId'] as string;
        const catCategories = tc.arguments['categories'] as string[];
        const catPriority = tc.arguments['priority'] as string;

        // Persist categorization to knowledge graph metadata
        try {
          this.db.prepare(
            `UPDATE indexed_emails SET priority = ?, categories = ? WHERE message_id = ?`
          ).run(catPriority, JSON.stringify(catCategories ?? []), catMessageId);
        } catch { /* table may not exist or messageId not found — non-fatal */ }

        executedResults.push({
          tool: 'categorize_email',
          result: {
            messageId: catMessageId,
            categories: catCategories,
            priority: catPriority,
            persisted: true,
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

      if (tc.name === 'fetch_calendar') {
        // Query locally indexed calendar events (populated by Google Calendar REST API sync)
        const daysAhead = (tc.arguments['daysAhead'] as number) ?? 7;
        try {
          const calResults = await this.knowledge.search('calendar event meeting', {
            limit: 20,
            source: 'calendar',
          });
          // Also query the indexed_calendar_events table directly for structured data
          const cutoff = new Date().toISOString();
          const future = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
          let events: Array<{ title: string; startTime: string; endTime: string; location?: string; attendees?: string }> = [];
          try {
            events = this.db.prepare(
              `SELECT title, start_time as startTime, end_time as endTime, location, attendees
               FROM indexed_calendar_events
               WHERE start_time >= ? AND start_time <= ?
               ORDER BY start_time ASC LIMIT 20`
            ).all(cutoff, future) as typeof events;
          } catch {
            // Table may not exist yet — use knowledge graph results as fallback
          }
          executedResults.push({
            tool: 'fetch_calendar',
            result: events.length > 0
              ? { events, source: 'local_index' }
              : calResults.length > 0
              ? { events: calResults.map(r => ({ title: r.document.title, metadata: r.document.metadata })), source: 'knowledge_graph' }
              : { events: [], message: 'No calendar events found. Connect Google Calendar in Settings → Connections.' },
          });
        } catch {
          executedResults.push({
            tool: 'fetch_calendar',
            result: { events: [], message: 'No calendar events available. Connect Google Calendar in Settings → Connections.' },
          });
        }
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

      // Fix #4: list_cloud_files queries local knowledge index instead of live cloud API
      if (tc.name === 'list_cloud_files') {
        const query = (tc.arguments['query'] as string) || '*';
        const limit = (tc.arguments['limit'] as number) ?? 50;
        try {
          const docs = await this.knowledge.listDocuments({
            source: 'cloud_storage' as import('../knowledge/types.js').DocumentSource,
            limit,
          });
          // If a query was provided, filter by title match
          const filtered = query === '*'
            ? docs
            : docs.filter(d => d.title.toLowerCase().includes(query.toLowerCase()));
          executedResults.push({
            tool: 'list_cloud_files',
            result: filtered.map(d => ({
              id: d.sourcePath ?? d.id,
              name: d.title,
              mimeType: d.mimeType,
              source: d.source,
              indexedAt: d.indexedAt,
              metadata: d.metadata,
            })),
          });
        } catch (err) {
          executedResults.push({
            tool: 'list_cloud_files',
            result: `No cloud files indexed yet. The user needs to connect Google Drive first.`,
          });
        }
        continue;
      }

      if (tc.name === 'list_indexed_documents') {
        const source = tc.arguments['source'] as string | undefined;
        const limit = (tc.arguments['limit'] as number) ?? 50;
        try {
          const docs = await this.knowledge.listDocuments({
            source: source as import('../knowledge/types.js').DocumentSource | undefined,
            limit,
          });
          // Hide conversation chunks from user-facing document listings — they are
          // indexed for AI recall only, not as "documents". Only surface them if the
          // caller explicitly asks for source='conversation'.
          const visibleDocs = source === 'conversation'
            ? docs
            : docs.filter(d => d.source !== 'conversation');
          executedResults.push({
            tool: 'list_indexed_documents',
            result: visibleDocs.map(d => ({
              id: d.id,
              title: d.title,
              source: d.source,
              sourcePath: d.sourcePath ?? null,
              mimeType: d.mimeType,
              indexedAt: d.indexedAt,
            })),
          });
        } catch {
          executedResults.push({ tool: 'list_indexed_documents', result: { error: 'Could not list documents' } });
        }
        continue;
      }

      if (tc.name === 'read_document') {
        const title = tc.arguments['title'] as string;
        const docId = tc.arguments['documentId'] as string | undefined;
        try {
          // Strategy: search for the document title to find its chunks, then
          // gather all chunks belonging to the same documentId, sorted by chunkIndex.
          const searchResults = await this.knowledge.search(title, { limit: 20 });
          // Find the target document — match by ID or best title match
          let targetDocId = docId;
          if (!targetDocId) {
            const titleLower = title.toLowerCase();
            const match = searchResults.find(r =>
              r.document.title.toLowerCase().includes(titleLower) ||
              titleLower.includes(r.document.title.toLowerCase())
            );
            targetDocId = match?.document.id;
          }
          if (!targetDocId) {
            // Fallback: just use the top result's document
            targetDocId = searchResults[0]?.document.id;
          }
          if (targetDocId) {
            // Collect all chunks for this document from search results
            const docChunks = searchResults
              .filter(r => r.document.id === targetDocId)
              .sort((a, b) => a.chunk.chunkIndex - b.chunk.chunkIndex);
            const doc = docChunks[0]?.document;
            // If we don't have enough chunks, do a second search with the document title
            let allContent = docChunks.map(c => c.chunk.content).join('\n');
            if (docChunks.length <= 2 && doc) {
              const moreResults = await this.knowledge.search(doc.title, { limit: 30 });
              const moreChunks = moreResults
                .filter(r => r.document.id === targetDocId)
                .sort((a, b) => a.chunk.chunkIndex - b.chunk.chunkIndex);
              if (moreChunks.length > docChunks.length) {
                allContent = moreChunks.map(c => c.chunk.content).join('\n');
              }
            }
            executedResults.push({
              tool: 'read_document',
              result: {
                title: doc?.title ?? title,
                source: doc?.source,
                sourcePath: doc?.sourcePath,
                content: allContent.slice(0, 6000), // Cap at 6000 chars for context window
                totalLength: allContent.length,
              },
            });
          } else {
            executedResults.push({
              tool: 'read_document',
              result: { error: `No document found matching "${title}". Use list_indexed_documents to see available files.` },
            });
          }
        } catch (err) {
          executedResults.push({ tool: 'read_document', result: { error: `Failed to read document: ${err instanceof Error ? err.message : String(err)}` } });
        }
        continue;
      }

      if (tc.name === 'add_contact') {
        const name = tc.arguments['name'] as string;
        const email = tc.arguments['email'] as string | undefined;
        const phone = tc.arguments['phone'] as string | undefined;
        const org = tc.arguments['organization'] as string | undefined;
        const jobTitle = tc.arguments['jobTitle'] as string | undefined;
        try {
          const id = `ct_${Date.now()}`;
          const now = new Date().toISOString();
          this.db.prepare(`
            INSERT OR IGNORE INTO contacts (
              id, display_name, given_name, family_name,
              emails, phones, organization, job_title,
              source, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
          `).run(
            id, name, name.split(' ')[0] ?? name, name.split(' ').slice(1).join(' ') || null,
            JSON.stringify(email ? [email] : []),
            JSON.stringify(phone ? [phone] : []),
            org ?? null, jobTitle ?? null,
            now, now,
          );
          executedResults.push({
            tool: 'add_contact',
            result: { success: true, id, name, email, phone },
          });
        } catch (err) {
          // Table might not exist — create it
          try {
            this.db.exec(`
              CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY, device_contact_id TEXT UNIQUE,
                display_name TEXT NOT NULL, given_name TEXT, family_name TEXT,
                emails TEXT NOT NULL DEFAULT '[]', phones TEXT NOT NULL DEFAULT '[]',
                organization TEXT, job_title TEXT, birthday TEXT, addresses TEXT DEFAULT '[]',
                relationship_type TEXT DEFAULT 'unknown', communication_frequency TEXT DEFAULT '{}',
                last_contact_date TEXT, first_contact_date TEXT, interaction_count INTEGER DEFAULT 0,
                tags TEXT DEFAULT '[]', email_entity_ids TEXT DEFAULT '[]',
                calendar_entity_ids TEXT DEFAULT '[]', document_entity_ids TEXT DEFAULT '[]',
                source TEXT DEFAULT 'device', merged_from TEXT DEFAULT '[]',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
              )
            `);
            const id = `ct_${Date.now()}`;
            const now = new Date().toISOString();
            this.db.prepare(`
              INSERT INTO contacts (id, display_name, emails, phones, organization, job_title, source, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)
            `).run(id, name, JSON.stringify(email ? [email] : []), JSON.stringify(phone ? [phone] : []), org ?? null, jobTitle ?? null, now, now);
            executedResults.push({ tool: 'add_contact', result: { success: true, id, name, email, phone } });
          } catch (err2) {
            executedResults.push({ tool: 'add_contact', result: { error: `Failed to add contact: ${err2 instanceof Error ? err2.message : String(err2)}` } });
          }
        }
        continue;
      }

      // --- Vision tool (local, routes to vision provider) ---

      if (tc.name === 'analyze_image') {
        const imagePath = tc.arguments['imagePath'] as string;
        const prompt = (tc.arguments['prompt'] as string) ?? 'Describe this image in detail.';
        try {
          if (this.llm.routedChat) {
            const response = await this.llm.routedChat({
              model: '',
              messages: [{ role: 'user', content: `[Image: ${imagePath}]\n${prompt}` }],
            }, 'vision_fast');
            executedResults.push({
              tool: 'analyze_image',
              result: { description: response.message.content, model: response.model },
            });
          } else {
            executedResults.push({
              tool: 'analyze_image',
              result: { error: 'Vision model not available. Download Moondream2 in Settings → AI Engine.' },
            });
          }
        } catch (err) {
          executedResults.push({
            tool: 'analyze_image',
            result: { error: err instanceof Error ? err.message : 'Vision analysis failed' },
          });
        }
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
          // Ensure table exists
          this.db.exec(`CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY, device_contact_id TEXT UNIQUE,
            display_name TEXT NOT NULL, given_name TEXT, family_name TEXT,
            emails TEXT NOT NULL DEFAULT '[]', phones TEXT NOT NULL DEFAULT '[]',
            organization TEXT, job_title TEXT, birthday TEXT, addresses TEXT DEFAULT '[]',
            relationship_type TEXT DEFAULT 'unknown', communication_frequency TEXT DEFAULT '{}',
            last_contact_date TEXT, first_contact_date TEXT, interaction_count INTEGER DEFAULT 0,
            tags TEXT DEFAULT '[]', email_entity_ids TEXT DEFAULT '[]',
            calendar_entity_ids TEXT DEFAULT '[]', document_entity_ids TEXT DEFAULT '[]',
            source TEXT DEFAULT 'device', merged_from TEXT DEFAULT '[]',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )`);
          const rows = query
            ? this.db.prepare(
                `SELECT id, display_name, emails, phones, organization, relationship_type, birthday, source
                 FROM contacts
                 WHERE LOWER(display_name) LIKE ? OR LOWER(emails) LIKE ? OR LOWER(organization) LIKE ? OR LOWER(phones) LIKE ?
                 ORDER BY interaction_count DESC LIMIT 10`
              ).all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`) as Array<{
                id: string; display_name: string; emails: string; phones: string;
                organization: string | null; relationship_type: string; birthday: string | null; source: string;
              }>
            : this.db.prepare(
                `SELECT id, display_name, emails, phones, organization, relationship_type, birthday, source
                 FROM contacts ORDER BY display_name ASC LIMIT 50`
              ).all() as Array<{
                id: string; display_name: string; emails: string; phones: string;
                organization: string | null; relationship_type: string; birthday: string | null; source: string;
              }>;
          if (rows.length === 0) {
            executedResults.push({ tool: 'search_contacts', result: { contacts: [], message: 'No contacts found. The user can add contacts using the add_contact tool or import from Google Contacts in Settings > Connections.' } });
          } else {
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
                source: r.source ?? 'device',
              })),
            });
          }
        } catch (err) {
          executedResults.push({ tool: 'search_contacts', result: { error: `Contact search failed: ${err instanceof Error ? err.message : String(err)}` } });
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

      // --- Cross-device search: requires Compute Mesh pairing ---
      if (tc.name === 'search_all_devices') {
        executedResults.push({
          tool: 'search_all_devices',
          result: { results: [], message: 'Cross-device search requires paired devices. Set up the Compute Mesh in Settings to enable this.' },
        });
        continue;
      }

      // --- Web form filling: requires browser integration ---
      if (tc.name === 'fill_web_form') {
        executedResults.push({
          tool: 'fill_web_form',
          result: { success: false, message: 'Web form filling requires a connected browser. Open Settings \u2192 Browser Integration to connect.' },
        });
        continue;
      }

      // Calendar write operations (create/update/delete) flow through Gateway → CalendarAdapter → Google Calendar REST API

      // --- Weather: handled locally via weatherService injected at construction ---
      if (tc.name === 'get_weather') {
        if (this.weatherService) {
          try {
            const location = tc.arguments['location'] as string | undefined;
            const weatherResult = await this.weatherService.getCurrentWeather(location);
            executedResults.push({
              tool: 'get_weather',
              result: weatherResult ?? { message: 'Weather data not available. Configure a default city in Settings > Location.' },
            });
          } catch (err) {
            executedResults.push({
              tool: 'get_weather',
              result: { error: err instanceof Error ? err.message : 'Weather lookup failed' },
            });
          }
        } else {
          executedResults.push({
            tool: 'get_weather',
            result: { message: 'Weather service not available. Configure a default city in Settings > Location.' },
          });
        }
        continue;
      }

      // --- SMS send: graceful failure until messaging adapter is wired ---
      if (tc.name === 'send_text') {
        executedResults.push({
          tool: 'send_text',
          result: {
            success: false,
            message: 'Text messaging will be supported in a future update. For now, please send the message manually.',
            draftedBody: tc.arguments['body'] as string | undefined,
            phone: tc.arguments['phone'] as string | undefined,
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

      // --- Reminder tools: handled locally to write directly to prefsDb (core.db) ---
      // This ensures reminders created by the AI are visible in the UI which reads from the same DB.
      if (tc.name === 'create_reminder') {
        const text = tc.arguments['text'] as string;
        const dueAt = tc.arguments['dueAt'] as string ?? new Date(Date.now() + 3600000).toISOString();
        const recurrence = tc.arguments['recurrence'] as string | undefined;
        try {
          // Schema must match ReminderStore (packages/core/knowledge/reminder-store.ts).
          this.db.exec(`CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY, text TEXT NOT NULL, due_at TEXT NOT NULL,
            recurrence TEXT NOT NULL DEFAULT 'none', status TEXT NOT NULL DEFAULT 'pending',
            snoozed_until TEXT, source TEXT NOT NULL DEFAULT 'chat',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )`);
          const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const nowIso = new Date().toISOString();
          this.db.prepare(
            'INSERT INTO reminders (id, text, due_at, recurrence, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(id, text, dueAt, recurrence ?? 'none', 'pending', 'ai', nowIso, nowIso);
          executedResults.push({
            tool: 'create_reminder',
            result: { success: true, id, text, dueAt, recurrence },
          });
        } catch (err) {
          executedResults.push({
            tool: 'create_reminder',
            result: { error: `Failed to create reminder: ${err instanceof Error ? err.message : String(err)}` },
          });
        }
        continue;
      }

      if (tc.name === 'list_reminders') {
        try {
          this.db.exec(`CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY, text TEXT NOT NULL, due_at TEXT NOT NULL,
            recurrence TEXT NOT NULL DEFAULT 'none', status TEXT NOT NULL DEFAULT 'pending',
            snoozed_until TEXT, source TEXT NOT NULL DEFAULT 'chat',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )`);
          const reminders = this.db.prepare(
            "SELECT * FROM reminders WHERE status IN ('pending', 'snoozed') ORDER BY due_at ASC LIMIT 50"
          ).all() as Array<{ id: string; text: string; due_at: string; recurrence: string | null; status: string; source: string }>;
          executedResults.push({
            tool: 'list_reminders',
            result: reminders.map(r => ({
              id: r.id, text: r.text, dueAt: r.due_at,
              recurrence: r.recurrence, status: r.status, source: r.source ?? 'user',
            })),
          });
        } catch (err) {
          executedResults.push({
            tool: 'list_reminders',
            result: { error: `Failed to list reminders: ${err instanceof Error ? err.message : String(err)}` },
          });
        }
        continue;
      }

      if (tc.name === 'snooze_reminder') {
        const reminderId = tc.arguments['id'] as string;
        const duration = tc.arguments['duration'] as string ?? '15min';
        const now = Date.now();
        let newDueAt: string;

        const durationMatch = duration.match(/^(\d+)\s*(min|minute|m|hr|hour|h|day|d)s?$/i);
        if (durationMatch) {
          const amount = parseInt(durationMatch[1]!, 10);
          const unit = durationMatch[2]!.toLowerCase();
          const ms = unit.startsWith('h') ? amount * 3600000
                   : unit.startsWith('d') ? amount * 86400000
                   : amount * 60000;
          newDueAt = new Date(now + ms).toISOString();
        } else if (duration.toLowerCase() === 'tomorrow') {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          newDueAt = tomorrow.toISOString();
        } else {
          newDueAt = new Date(now + 15 * 60000).toISOString();
        }

        try {
          this.db.prepare('UPDATE reminders SET status = ?, due_at = ? WHERE id = ?')
            .run('snoozed', newDueAt, reminderId);
          executedResults.push({
            tool: 'snooze_reminder',
            result: { success: true, id: reminderId, snoozedUntil: newDueAt },
          });
        } catch (err) {
          executedResults.push({
            tool: 'snooze_reminder',
            result: { error: `Failed to snooze reminder: ${err instanceof Error ? err.message : String(err)}` },
          });
        }
        continue;
      }

      if (tc.name === 'dismiss_reminder') {
        const reminderId = tc.arguments['id'] as string;
        try {
          this.db.prepare('UPDATE reminders SET status = ? WHERE id = ?')
            .run('dismissed', reminderId);
          executedResults.push({
            tool: 'dismiss_reminder',
            result: { success: true, id: reminderId },
          });
        } catch (err) {
          executedResults.push({
            tool: 'dismiss_reminder',
            result: { error: `Failed to dismiss reminder: ${err instanceof Error ? err.message : String(err)}` },
          });
        }
        continue;
      }

      if (tc.name === 'delete_reminder') {
        const reminderId = tc.arguments['id'] as string;
        try {
          this.db.prepare('DELETE FROM reminders WHERE id = ?').run(reminderId);
          executedResults.push({
            tool: 'delete_reminder',
            result: { success: true, id: reminderId },
          });
        } catch (err) {
          executedResults.push({
            tool: 'delete_reminder',
            result: { error: `Failed to delete reminder: ${err instanceof Error ? err.message : String(err)}` },
          });
        }
        continue;
      }

      // Gateway-routed tools
      const actionType = this.allToolActionMap[tc.name];
      if (!actionType) {
        executedResults.push({
          tool: tc.name,
          result: { error: `Tool "${tc.name}" is not available. This capability may not be implemented yet.` },
        });
        continue;
      }

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
        : this.autonomy.decide(actionType, tc.arguments);

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
      } finally {
        // Always emit a tool_result so the UI card leaves its 'active' state,
        // even when a branch `continue`s without falling through. If no result
        // was pushed during this iteration (e.g., approval-queued action), we
        // still emit so the spinner resolves.
        if (this.streamCallback) {
          try {
            const produced = executedResults.slice(resultsBeforeThisTool);
            const last = produced[produced.length - 1];
            const hadError = !!last && typeof last.result === 'object' && last.result !== null
              && 'error' in (last.result as Record<string, unknown>);
            const summary = last
              ? (typeof last.result === 'string'
                  ? last.result.slice(0, 200)
                  : JSON.stringify(last.result ?? {}).slice(0, 200))
              : 'completed';
            this.streamCallback({
              type: 'subagent_tool_result' as const,
              subagentId,
              subtaskId: tc.name,
              timestamp: Date.now(),
              data: {
                toolName: tc.name,
                toolStatus: hadError ? 'error' : 'success',
                toolResult: summary,
              },
            });
          } catch { /* non-critical */ }
        }
      }
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

    const style = ipAdapters.styleAdapter;
    if (!style) {
      // No style adapter loaded (free tier) — return original body unstyled
      return { body: args['body'] as string, styleScore: null };
    }

    const stylePrompt = profile.isActive
      ? style.buildStylePrompt(profile, draftContext)
      : style.buildInactiveStylePrompt();

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
        const retryHint = style.buildRetryPrompt(weakDimensions, profile);
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
          // Email drafting — natural voice, but more focused than pure chat.
          temperature: TEMP_SYNTH,
        });

        const generatedBody = response.message.content.trim();

        if (profile.isActive) {
          const score = style.scoreDraft(generatedBody, profile);

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
