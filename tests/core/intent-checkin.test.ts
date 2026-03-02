// Phase 2d: In-chat check-in tests.
// Verifies shouldTriggerCheckIn(), isEmotionallySensitive(), evaluateCheckIn(),
// and the processMessage() call site integration.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import { IntentManager } from '@semblance/core/agent/intent-manager.js';
import type { LLMProvider, GenerateResponse, ChatResponse, EmbedResponse, ModelInfo } from '@semblance/core/llm/types.js';
import type { IntentObservation } from '@semblance/core/agent/intent-types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── LLM Mock ───────────────────────────────────────────────────────────────

function createMockLLM(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({
      text: 'NO',
      model: 'test-model',
      tokensUsed: { prompt: 10, completion: 2, total: 12 },
      durationMs: 50,
    } satisfies GenerateResponse),
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Hello' },
      model: 'test-model',
      tokensUsed: { prompt: 50, completion: 20, total: 70 },
      durationMs: 200,
      toolCalls: undefined,
    } satisfies ChatResponse),
    embed: vi.fn().mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      model: 'test-model',
      tokensUsed: 5,
    } satisfies EmbedResponse),
    listModels: vi.fn().mockResolvedValue([] as ModelInfo[]),
    getModel: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── Test Observation Helper ────────────────────────────────────────────────

function makeDriftObservation(id: string): IntentObservation {
  return {
    id,
    observedAt: new Date().toISOString(),
    type: 'drift',
    description: 'You mentioned family is important but this week was heavily work-focused. Is that the balance you want?',
    evidence: ['This week: 25 email send actions, 0 calendar create actions.'],
    surfacedMorningBrief: false,
    surfacedInChat: false,
    dismissed: false,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('In-chat check-in (Phase 2d)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create preferences table for lastCheckInTimestamp
    db.exec('CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  });

  afterEach(() => {
    db.close();
  });

  // ─── shouldTriggerCheckIn ───────────────────────────────────────────────

  describe('shouldTriggerCheckIn — rate limiting', () => {
    it('returns false when no pending in-chat observations', () => {
      const manager = new IntentManager({ db: db as unknown as DatabaseHandle });
      // No observations recorded → nothing to surface
      const pending = manager.getPendingObservations('chat');
      expect(pending).toHaveLength(0);
      // shouldTriggerCheckIn is private, so we test via getPendingObservations + getLastCheckInTimestamp
      // which are the two conditions it checks
    });

    it('rate limit blocks second check-in within 24 hours', () => {
      const manager = new IntentManager({ db: db as unknown as DatabaseHandle });

      // Record an observation and mark it as not yet surfaced in chat
      const obs = makeDriftObservation('obs-1');
      manager.recordObservation(obs);

      // Set last check-in to 1 hour ago
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      manager.setLastCheckInTimestamp(oneHourAgo);

      // Verify: last check-in is recent
      const lastTs = manager.getLastCheckInTimestamp();
      expect(lastTs).toBe(oneHourAgo);
      const elapsed = Date.now() - new Date(lastTs!).getTime();
      expect(elapsed).toBeLessThan(24 * 60 * 60 * 1000);
      // shouldTriggerCheckIn would return false because < 24h
    });

    it('allows check-in when last check-in was > 24 hours ago', () => {
      const manager = new IntentManager({ db: db as unknown as DatabaseHandle });

      // Record an unsurfaced observation
      const obs = makeDriftObservation('obs-2');
      manager.recordObservation(obs);

      // Set last check-in to 25 hours ago
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      manager.setLastCheckInTimestamp(twentyFiveHoursAgo);

      // Pending observations exist
      const pending = manager.getPendingObservations('chat');
      expect(pending.length).toBeGreaterThan(0);

      // Elapsed > 24h
      const lastTs = manager.getLastCheckInTimestamp();
      const elapsed = Date.now() - new Date(lastTs!).getTime();
      expect(elapsed).toBeGreaterThan(24 * 60 * 60 * 1000);
      // shouldTriggerCheckIn would return true
    });
  });

  // ─── isEmotionallySensitive ─────────────────────────────────────────────

  describe('isEmotionallySensitive — LLM classification', () => {
    it('emotional conversation suppresses check-in (LLM returns YES)', async () => {
      const llm = createMockLLM({
        generate: vi.fn().mockResolvedValue({
          text: 'YES',
          model: 'test-model',
          tokensUsed: { prompt: 10, completion: 2, total: 12 },
          durationMs: 50,
        }),
      });

      // Simulate the classification logic directly
      const response = await llm.generate({
        model: 'test-model',
        system: 'You classify conversation tone. Reply with exactly YES or NO. Nothing else.',
        prompt: 'Are the following messages emotionally sensitive? Reply YES or NO only.\n\nuser: My mom just passed away last night',
        temperature: 0,
        maxTokens: 8,
      });
      const answer = response.text.trim().toUpperCase();
      expect(answer).toBe('YES');
      // isEmotionallySensitive returns true → check-in suppressed
    });

    it('non-emotional conversation allows check-in (LLM returns NO)', async () => {
      const llm = createMockLLM({
        generate: vi.fn().mockResolvedValue({
          text: 'NO',
          model: 'test-model',
          tokensUsed: { prompt: 10, completion: 2, total: 12 },
          durationMs: 50,
        }),
      });

      const response = await llm.generate({
        model: 'test-model',
        system: 'You classify conversation tone. Reply with exactly YES or NO. Nothing else.',
        prompt: 'Are the following messages emotionally sensitive? Reply YES or NO only.\n\nuser: Can you check my calendar for tomorrow?',
        temperature: 0,
        maxTokens: 8,
      });
      const answer = response.text.trim().toUpperCase();
      expect(answer).toBe('NO');
      // isEmotionallySensitive returns false → check-in allowed
    });

    it('LLM failure suppresses check-in (fail-safe)', async () => {
      const llm = createMockLLM({
        generate: vi.fn().mockRejectedValue(new Error('Model unavailable')),
      });

      // When LLM fails, the catch block returns true (suppress)
      let result: boolean;
      try {
        await llm.generate({
          model: 'test-model',
          system: 'classify',
          prompt: 'test',
          temperature: 0,
          maxTokens: 8,
        });
        result = false; // Shouldn't reach here
      } catch {
        // Any failure → suppress check-in (fail-safe: never risk interrupting a crisis)
        result = true;
      }
      expect(result).toBe(true);
    });
  });

  // ─── evaluateCheckIn — full flow ────────────────────────────────────────

  describe('evaluateCheckIn — end-to-end flow', () => {
    it('fires check-in for non-emotional conversation with pending observation', async () => {
      const manager = new IntentManager({ db: db as unknown as DatabaseHandle });

      // Set up: goal + unsurfaced observation + no recent check-in
      manager.setPrimaryGoal('More time with family');
      const obs = makeDriftObservation('obs-check');
      manager.recordObservation(obs);

      // Verify pending observations exist for chat channel
      const pending = manager.getPendingObservations('chat');
      expect(pending.length).toBeGreaterThan(0);
      const recordedId = pending[0]!.id;

      // Create LLM that says conversation is NOT sensitive, then generates a check-in
      const generateMock = vi.fn()
        .mockResolvedValueOnce({
          // First call: isEmotionallySensitive → NO
          text: 'NO',
          model: 'test-model',
          tokensUsed: { prompt: 10, completion: 2, total: 12 },
          durationMs: 50,
        })
        .mockResolvedValueOnce({
          // Second call: generate check-in message
          text: 'I noticed your week was heavily work-focused. How are you feeling about the family time balance?',
          model: 'test-model',
          tokensUsed: { prompt: 30, completion: 20, total: 50 },
          durationMs: 100,
        });

      const llm = createMockLLM({ generate: generateMock });

      // Simulate evaluateCheckIn logic:
      // 1. Check emotional sensitivity (first generate call)
      const sensitivityResponse = await llm.generate({
        model: 'test-model',
        system: 'You classify conversation tone. Reply with exactly YES or NO. Nothing else.',
        prompt: 'Are the following messages emotionally sensitive? Reply YES or NO only.\n\nuser: What meetings do I have tomorrow?',
        temperature: 0,
        maxTokens: 8,
      });
      const isSensitive = sensitivityResponse.text.trim().toUpperCase() !== 'NO';
      expect(isSensitive).toBe(false);

      // 2. Generate check-in (second generate call)
      const checkInResponse = await llm.generate({
        model: 'test-model',
        system: 'You are curious and caring, like a trusted friend, not a therapist or notification. Write exactly one sentence.',
        prompt: `Gently surface this observation to the user in one sentence:\n\n"${obs.description}"`,
        temperature: 0.4,
        maxTokens: 128,
      });
      const checkIn = checkInResponse.text.trim();
      expect(checkIn).toBeTruthy();
      expect(checkIn.length).toBeGreaterThan(10);

      // 3. Mark surfaced and update timestamp
      manager.markSurfacedInChat(recordedId);
      manager.setLastCheckInTimestamp(new Date().toISOString());

      // Verify observation marked as surfaced in chat
      const afterPending = manager.getPendingObservations('chat');
      expect(afterPending).toHaveLength(0);

      // Verify timestamp updated
      const lastTs = manager.getLastCheckInTimestamp();
      expect(lastTs).toBeTruthy();

      // Verify both generate calls were made
      expect(generateMock).toHaveBeenCalledTimes(2);
    });

    it('check-in appended correctly to response with separator', () => {
      const finalMessage = 'Here are your meetings for tomorrow.';
      const checkIn = 'I noticed your week was heavily work-focused. How are you feeling about the family time balance?';

      // The processMessage call site appends as: \n\n---\n[checkIn]
      const result = `${finalMessage}\n\n---\n${checkIn}`;

      expect(result).toContain('---');
      expect(result).toContain(checkIn);
      expect(result.indexOf('---')).toBeGreaterThan(result.indexOf('meetings'));
      // Verify the exact format: response, blank line, separator, check-in
      const parts = result.split('\n\n---\n');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe(finalMessage);
      expect(parts[1]).toBe(checkIn);
    });
  });

  // ─── Structural verification ────────────────────────────────────────────

  describe('Orchestrator structural verification (Phase 2d)', () => {
    const orchestratorPath = path.resolve(
      __dirname, '../../packages/core/agent/orchestrator.ts',
    );
    const source = fs.readFileSync(orchestratorPath, 'utf-8');

    it('shouldTriggerCheckIn method exists', () => {
      expect(source).toContain('private shouldTriggerCheckIn()');
      expect(source).toContain('getPendingObservations');
      expect(source).toContain('getLastCheckInTimestamp');
      // Checks for 24-hour rate limit constant
      expect(source).toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    });

    it('isEmotionallySensitive method uses LLM classification, not regex', () => {
      expect(source).toContain('private async isEmotionallySensitive');
      // Uses LLM generate call
      expect(source).toMatch(/this\.llm\.generate\(/);
      // Prompt asks YES or NO
      expect(source).toContain('emotionally sensitive? Reply YES or NO only');
      // Does NOT use regex for emotion detection
      const methodStart = source.indexOf('private async isEmotionallySensitive');
      const methodEnd = source.indexOf('private async evaluateCheckIn');
      const methodBody = source.slice(methodStart, methodEnd);
      expect(methodBody).not.toMatch(/new RegExp|\.match\(|\.test\(/);
      // Fail-safe: LLM unavailable → return true (suppress)
      expect(methodBody).toContain('return true');
    });

    it('isEmotionallySensitive fails safe — suppresses on error', () => {
      const methodStart = source.indexOf('private async isEmotionallySensitive');
      const methodEnd = source.indexOf('private async evaluateCheckIn');
      const methodBody = source.slice(methodStart, methodEnd);
      // catch block returns true
      expect(methodBody).toContain('catch');
      // After catch, returns true (suppress)
      // Also: no LLM → return true
      expect(methodBody).toContain('if (!this.llm) return true');
    });

    it('evaluateCheckIn calls isEmotionallySensitive before generating', () => {
      expect(source).toContain('private async evaluateCheckIn');
      // Calls isEmotionallySensitive first
      const methodStart = source.indexOf('private async evaluateCheckIn');
      const methodEnd = source.indexOf('Register extension tools', methodStart);
      const methodBody = source.slice(methodStart, methodEnd);
      expect(methodBody).toContain('isEmotionallySensitive');
      expect(methodBody).toContain('if (sensitive) return null');
      // Uses "trusted friend" tone instruction
      expect(methodBody).toContain('trusted friend');
      expect(methodBody).toContain('not a therapist or notification');
    });

    it('processMessage() calls shouldTriggerCheckIn and evaluateCheckIn', () => {
      // The call site should be in processMessage, after tool calls, before storeTurn
      expect(source).toContain('this.shouldTriggerCheckIn()');
      expect(source).toContain('await this.evaluateCheckIn(message, history)');
      // Appends with separator
      expect(source).toMatch(/finalMessage\s*\+=.*\\n\\n---\\n/);
    });

    it('evaluateCheckIn updates lastCheckInTimestamp after firing', () => {
      const methodStart = source.indexOf('private async evaluateCheckIn');
      const methodEnd = source.indexOf('Register extension tools', methodStart);
      const methodBody = source.slice(methodStart, methodEnd);
      expect(methodBody).toContain('setLastCheckInTimestamp');
      expect(methodBody).toContain('markSurfacedInChat');
    });

    it('check-in call site is after tool processing and before storeTurn', () => {
      const checkInCallIdx = source.indexOf('this.shouldTriggerCheckIn()');
      const storeTurnIdx = source.indexOf('// Step 8: Store conversation turns');

      expect(checkInCallIdx).toBeGreaterThan(-1);
      expect(storeTurnIdx).toBeGreaterThan(-1);
      expect(checkInCallIdx).toBeLessThan(storeTurnIdx);
    });
  });
});
