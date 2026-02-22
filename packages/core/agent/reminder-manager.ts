// Reminder Manager — Natural language parsing and lifecycle management.
// Provides orchestrator tools: create_reminder, list_reminders, snooze_reminder, dismiss_reminder.

import type { LLMProvider, ChatMessage } from '../llm/types.js';
import type { IPCClient } from './ipc-client.js';
import type { ReminderCreatePayload, ReminderUpdatePayload, ReminderListPayload, ActionResponse } from '../types/ipc.js';

export interface ParsedReminder {
  text: string;
  dueAt: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
}

export type SnoozeDuration = '15min' | '1hr' | '3hr' | 'tomorrow';

/**
 * Parse natural language reminder text into structured data using LLM.
 */
export async function parseReminder(
  naturalLanguage: string,
  llm: LLMProvider,
  now?: Date,
): Promise<ParsedReminder> {
  const currentTime = now ?? new Date();
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a reminder parser. Extract structured reminder data from natural language.
Current date/time: ${currentTime.toISOString()}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "text": "the action to remind about",
  "dueAt": "ISO 8601 datetime",
  "recurrence": "none" | "daily" | "weekly" | "monthly"
}

Examples:
- "remind me to call the dentist at 3pm tomorrow" → {"text": "call the dentist", "dueAt": "...", "recurrence": "none"}
- "every Monday at 9am, remind me about team standup" → {"text": "team standup", "dueAt": "...", "recurrence": "weekly"}
- "in 2 hours remind me to take medicine" → {"text": "take medicine", "dueAt": "...", "recurrence": "none"}
- "daily at 9am: check email" → {"text": "check email", "dueAt": "...", "recurrence": "daily"}`,
    },
    { role: 'user', content: naturalLanguage },
  ];

  try {
    const response = await llm.chat(messages);
    const jsonStr = response.content.trim()
      .replace(/^```json?\s*/, '')
      .replace(/```\s*$/, '');
    const parsed = JSON.parse(jsonStr) as ParsedReminder;
    // Validate required fields
    if (!parsed.text || !parsed.dueAt) {
      throw new Error('Missing required fields');
    }
    // Validate recurrence
    if (!['none', 'daily', 'weekly', 'monthly'].includes(parsed.recurrence ?? 'none')) {
      parsed.recurrence = 'none';
    }
    return parsed;
  } catch {
    // Fallback: use the full text as the reminder, due in 1 hour
    const fallbackTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
    return {
      text: naturalLanguage,
      dueAt: fallbackTime.toISOString(),
      recurrence: 'none',
    };
  }
}

/**
 * Calculate snooze target time from duration.
 */
export function calculateSnoozeTime(duration: SnoozeDuration, from?: Date): string {
  const now = from ?? new Date();
  switch (duration) {
    case '15min':
      return new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    case '1hr':
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    case '3hr':
      return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
    case 'tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow.toISOString();
    }
  }
}

/**
 * Create a reminder — parse natural language or use structured input.
 */
export async function createReminder(
  input: string | ReminderCreatePayload,
  llm: LLMProvider,
  ipcClient: IPCClient,
  source: 'chat' | 'quick-capture' | 'proactive' = 'chat',
): Promise<ActionResponse> {
  let payload: ReminderCreatePayload;

  if (typeof input === 'string') {
    const parsed = await parseReminder(input, llm);
    payload = {
      text: parsed.text,
      dueAt: parsed.dueAt,
      recurrence: parsed.recurrence,
      source,
    };
  } else {
    payload = input;
  }

  return ipcClient.send('reminder.create', payload);
}

/**
 * List reminders via IPC.
 */
export async function listReminders(
  ipcClient: IPCClient,
  status?: 'pending' | 'fired' | 'dismissed' | 'snoozed' | 'all',
): Promise<ActionResponse> {
  const payload: ReminderListPayload = { status: status ?? 'all' };
  return ipcClient.send('reminder.list', payload);
}

/**
 * Snooze a reminder for a specified duration.
 */
export async function snoozeReminder(
  id: string,
  duration: SnoozeDuration,
  ipcClient: IPCClient,
): Promise<ActionResponse> {
  const snoozedUntil = calculateSnoozeTime(duration);
  const payload: ReminderUpdatePayload = {
    id,
    status: 'snoozed',
    snoozedUntil,
  };
  return ipcClient.send('reminder.update', payload);
}

/**
 * Dismiss a reminder.
 */
export async function dismissReminder(
  id: string,
  ipcClient: IPCClient,
): Promise<ActionResponse> {
  const payload: ReminderUpdatePayload = {
    id,
    status: 'dismissed',
  };
  return ipcClient.send('reminder.update', payload);
}
