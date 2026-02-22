// Tests for Step 10 Commit 9 — Reminder Manager
// Natural language parsing, snooze calculation, IPC integration.

import { describe, it, expect, vi } from 'vitest';
import {
  parseReminder,
  calculateSnoozeTime,
} from '@semblance/core/agent/reminder-manager.js';
import type { ParsedReminder, SnoozeDuration } from '@semblance/core/agent/reminder-manager.js';

function mockLLM(response: string) {
  return {
    chat: vi.fn().mockResolvedValue({ content: response }),
    generate: vi.fn(),
    embed: vi.fn(),
    listModels: vi.fn(),
  };
}

const NOW = new Date('2026-02-22T12:00:00.000Z');

describe('parseReminder: natural language parsing', () => {
  it('parses "remind me to call the dentist at 3pm tomorrow"', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'call the dentist',
      dueAt: '2026-02-23T15:00:00.000Z',
      recurrence: 'none',
    }));
    const result = await parseReminder('remind me to call the dentist at 3pm tomorrow', llm, NOW);
    expect(result.text).toBe('call the dentist');
    expect(result.dueAt).toBe('2026-02-23T15:00:00.000Z');
    expect(result.recurrence).toBe('none');
  });

  it('parses "every Monday at 9am, remind me about team standup"', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'team standup',
      dueAt: '2026-02-23T09:00:00.000Z',
      recurrence: 'weekly',
    }));
    const result = await parseReminder('every Monday at 9am, remind me about team standup', llm, NOW);
    expect(result.text).toBe('team standup');
    expect(result.recurrence).toBe('weekly');
  });

  it('parses "in 2 hours remind me to take medicine"', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'take medicine',
      dueAt: '2026-02-22T14:00:00.000Z',
      recurrence: 'none',
    }));
    const result = await parseReminder('in 2 hours remind me to take medicine', llm, NOW);
    expect(result.text).toBe('take medicine');
    expect(result.dueAt).toBe('2026-02-22T14:00:00.000Z');
  });

  it('parses "daily at 9am: check email"', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'check email',
      dueAt: '2026-02-23T09:00:00.000Z',
      recurrence: 'daily',
    }));
    const result = await parseReminder('daily at 9am: check email', llm, NOW);
    expect(result.recurrence).toBe('daily');
  });

  it('parses relative time: "next Tuesday at 2pm"', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'meeting with Sarah',
      dueAt: '2026-02-24T14:00:00.000Z',
      recurrence: 'none',
    }));
    const result = await parseReminder('next Tuesday at 2pm meeting with Sarah', llm, NOW);
    expect(result.text).toBe('meeting with Sarah');
  });

  it('parses absolute date: "March 15"', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'tax deadline',
      dueAt: '2026-03-15T09:00:00.000Z',
      recurrence: 'none',
    }));
    const result = await parseReminder('March 15 tax deadline', llm, NOW);
    expect(result.text).toBe('tax deadline');
    expect(result.dueAt).toContain('2026-03-15');
  });

  it('parses monthly recurrence', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'pay rent',
      dueAt: '2026-03-01T09:00:00.000Z',
      recurrence: 'monthly',
    }));
    const result = await parseReminder('remind me to pay rent on the 1st of every month', llm, NOW);
    expect(result.recurrence).toBe('monthly');
  });

  it('handles LLM JSON wrapped in code block', async () => {
    const llm = mockLLM('```json\n{"text":"buy groceries","dueAt":"2026-02-22T18:00:00.000Z","recurrence":"none"}\n```');
    const result = await parseReminder('buy groceries at 6pm', llm, NOW);
    expect(result.text).toBe('buy groceries');
  });

  it('falls back to full text with 1hr due on LLM error', async () => {
    const llm = {
      chat: vi.fn().mockRejectedValue(new Error('LLM failed')),
      generate: vi.fn(),
      embed: vi.fn(),
      listModels: vi.fn(),
    };
    const result = await parseReminder('call the dentist', llm, NOW);
    expect(result.text).toBe('call the dentist');
    expect(result.recurrence).toBe('none');
    // Due in ~1 hour from NOW
    const due = new Date(result.dueAt);
    expect(due.getTime()).toBeGreaterThan(NOW.getTime());
    expect(due.getTime()).toBeLessThanOrEqual(NOW.getTime() + 61 * 60 * 1000);
  });

  it('falls back on invalid JSON from LLM', async () => {
    const llm = mockLLM('I think you should set a reminder for 3pm');
    const result = await parseReminder('3pm reminder', llm, NOW);
    expect(result.text).toBe('3pm reminder'); // Falls back to raw input
  });
});

describe('calculateSnoozeTime', () => {
  const baseTime = new Date('2026-02-22T10:00:00.000Z');

  it('15min adds 15 minutes', () => {
    const result = calculateSnoozeTime('15min', baseTime);
    expect(result).toBe('2026-02-22T10:15:00.000Z');
  });

  it('1hr adds 1 hour', () => {
    const result = calculateSnoozeTime('1hr', baseTime);
    expect(result).toBe('2026-02-22T11:00:00.000Z');
  });

  it('3hr adds 3 hours', () => {
    const result = calculateSnoozeTime('3hr', baseTime);
    expect(result).toBe('2026-02-22T13:00:00.000Z');
  });

  it('tomorrow sets to 9am next day', () => {
    const result = calculateSnoozeTime('tomorrow', baseTime);
    const parsed = new Date(result);
    expect(parsed.getDate()).toBe(23);
    expect(parsed.getHours()).toBe(9);
    expect(parsed.getMinutes()).toBe(0);
  });
});
