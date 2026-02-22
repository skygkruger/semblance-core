// Quick Capture — Ambient intelligence entry point.
// Captures text, detects time references for auto-reminder creation,
// and links to related context via semantic search.

import type { LLMProvider, ChatMessage } from '../llm/types.js';
import type { KnowledgeGraph, SearchResult } from '../knowledge/index.js';
import type { IPCClient } from './ipc-client.js';
import type { CaptureStore, LinkedContextRef } from '../knowledge/capture-store.js';
import { parseReminder } from './reminder-manager.js';

export interface CaptureResult {
  captureId: string;
  text: string;
  hasReminder: boolean;
  reminderId: string | null;
  reminderDueAt: string | null;
  linkedContext: LinkedContextRef[];
}

/**
 * Detect if text contains a time reference using fast heuristics.
 * Returns true if the text likely contains a temporal expression.
 */
export function hasTimeReference(text: string): boolean {
  const patterns = [
    /\b(at|by)\s+\d{1,2}(:\d{2})?\s*(am|pm)\b/i,
    /\b(tomorrow|tonight|today)\b/i,
    /\b(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b/i,
    /\b(in)\s+\d+\s+(minute|hour|day|week|month)s?\b/i,
    /\b(remind\s+me|reminder|don't forget)\b/i,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i,
    /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
    /\b(morning|afternoon|evening|noon|midnight)\b/i,
    /\b(daily|weekly|monthly|every)\b/i,
    /\b(deadline|due|before|until)\b/i,
  ];

  return patterns.some(p => p.test(text));
}

/**
 * Use LLM to confirm if a capture text contains a time reference
 * and should generate a reminder.
 */
export async function detectTimeWithLLM(
  text: string,
  llm: LLMProvider,
): Promise<boolean> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `Determine if the following text contains a time reference that implies the user wants to be reminded or has a deadline.
Respond with ONLY "yes" or "no".

Examples:
- "call dentist at 3pm tomorrow" → yes
- "interesting article about AI" → no
- "meeting with Sarah next Tuesday" → yes
- "great idea for the project" → no
- "pay rent by the 1st" → yes`,
    },
    { role: 'user', content: text },
  ];

  try {
    const response = await llm.chat({ model: 'default', messages });
    return response.message.content.trim().toLowerCase().startsWith('yes');
  } catch {
    // On LLM error, fall back to heuristic detection
    return hasTimeReference(text);
  }
}

/**
 * Process a quick capture: detect time references, create reminders,
 * and link to related context via semantic search.
 */
export async function processCapture(
  text: string,
  llm: LLMProvider,
  captureStore: CaptureStore,
  knowledgeGraph: KnowledgeGraph | null,
  ipcClient: IPCClient | null,
): Promise<CaptureResult> {
  let reminderId: string | null = null;
  let reminderDueAt: string | null = null;
  let linkedContext: LinkedContextRef[] = [];

  // Step 1: Detect time references and auto-create reminder
  const hasTime = hasTimeReference(text);
  if (hasTime) {
    try {
      const parsed = await parseReminder(text, llm);
      // Create reminder via IPC if available
      if (ipcClient) {
        const response = await ipcClient.sendAction('reminder.create', {
          text: parsed.text,
          dueAt: parsed.dueAt,
          recurrence: parsed.recurrence,
          source: 'quick-capture' as const,
        });
        if (response.status === 'success' && response.data) {
          const data = response.data as { id: string };
          reminderId = data.id;
        }
      }
      reminderDueAt = parsed.dueAt;
    } catch {
      // Reminder creation failed — capture still proceeds
    }
  }

  // Step 2: Find related context via semantic search
  if (knowledgeGraph) {
    try {
      const results = await knowledgeGraph.search(text, { limit: 3 });
      linkedContext = results
        .filter((r: SearchResult) => (r.score ?? 0) >= 0.5)
        .map((r: SearchResult) => ({
          documentId: r.document.id,
          title: r.document.title,
          source: r.document.source,
          score: r.score,
        }));
    } catch {
      // Search failed — capture still proceeds
    }
  }

  // Step 3: Store the capture
  const capture = captureStore.create({
    text,
    reminderId: reminderId ?? undefined,
    linkedContext,
  });

  return {
    captureId: capture.id,
    text,
    hasReminder: reminderId !== null,
    reminderId,
    reminderDueAt,
    linkedContext,
  };
}
