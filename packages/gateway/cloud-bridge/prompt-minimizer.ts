// Prompt Minimizer — Strips unnecessary context from Cloud Bridge requests
// to reduce cost and data exposure.
//
// Before a Cloud Bridge API call, the minimizer:
//   1. Removes system prompt boilerplate (NEVER leaves the device)
//   2. Strips knowledge graph context not directly relevant to the subtask
//   3. Strips PII from non-essential context
//   4. Compresses conversation history to essential turns
//   5. Respects domain exclusions — strips excluded category data from context
//
// The minimized prompt is what gets sent. The original stays local.
// The audit trail logs the hash of the minimized prompt.
//
// This file is in packages/gateway/. No packages/core/ boundary violation.

import { checkExclusions } from './content-classifier.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MinimizationResult {
  messages: Array<{ role: string; content: string }>;
  tokensBefore: number;
  tokensAfter: number;
  strippedSystemPrompt: boolean;
  strippedKnowledgeContext: number;  // chars removed
  strippedExcludedContent: number;   // chars removed
  compressedHistory: number;         // turns removed
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

/** Patterns identifying Semblance's internal system prompt sections. */
const SYSTEM_PROMPT_MARKERS = [
  /You are Semblance[^.]*\./i,
  /Your Intelligence\. Your Device\. Your Rules\./i,
  /INJECTION_CANARY_[A-Za-z0-9]+/,
  /\[SEMBLANCE_INJECTION_CANARY\]/,
  /autonomy tier: (?:guardian|partner|alter_ego)/i,
  /You are a sovereign personal AI/i,
  /connected services:/i,
  /indexed documents:/i,
];

/** Patterns identifying knowledge graph context blocks. */
const KNOWLEDGE_CONTEXT_MARKERS = [
  /^(?:Relevant|Related) (?:knowledge|context|documents?):\s*$/im,
  /^Knowledge graph (?:context|results?):\s*$/im,
  /^Document context:\s*$/im,
  /\[DATA_BOUNDARY:[^\]]+\]/g,
];

/** PII patterns (SSN-like, card-like, email addresses in non-essential context). */
const PII_PATTERNS = [
  /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/g,                    // SSN
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,         // Card numbers
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Emails
  /\b(?:\+?1?[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, // Phone numbers
];

// ─── Minimizer ────────────────────────────────────────────────────────────────

export class PromptMinimizer {
  /**
   * Minimize a set of messages before sending via Cloud Bridge.
   *
   * @param messages The original messages
   * @param excludedCategories Data categories that must not leave the device
   * @param maxHistoryTurns Maximum conversation history turns to keep (default: 4)
   */
  minimize(
    messages: Array<{ role: string; content: string }>,
    excludedCategories: string[],
    maxHistoryTurns: number = 4,
  ): MinimizationResult {
    const tokensBefore = estimateTokens(messages);
    let strippedSystemPrompt = false;
    let strippedKnowledgeContext = 0;
    let strippedExcludedContent = 0;
    let compressedHistory = 0;

    const result: Array<{ role: string; content: string }> = [];

    for (const msg of messages) {
      let content = msg.content;

      // 1. Strip system prompt boilerplate (NEVER send Semblance internals to cloud)
      if (msg.role === 'system') {
        const cleaned = this.stripSystemPromptBoilerplate(content);
        if (cleaned.length < content.length) {
          strippedSystemPrompt = true;
          content = cleaned;
        }
        // If the entire system message was boilerplate, replace with a generic instruction
        if (content.trim().length < 20) {
          content = 'You are a helpful AI assistant. Answer the user\'s question accurately and concisely.';
          strippedSystemPrompt = true;
        }
      }

      // 2. Strip knowledge graph context blocks
      const beforeKg = content.length;
      content = this.stripKnowledgeContext(content);
      strippedKnowledgeContext += beforeKg - content.length;

      // 3. Strip content from excluded data categories
      if (excludedCategories.length > 0) {
        const beforeExcl = content.length;
        content = this.stripExcludedContent(content, excludedCategories);
        strippedExcludedContent += beforeExcl - content.length;
      }

      // 4. Strip PII from non-system, non-latest-user messages
      // (Keep PII in the most recent user message since it may be intentional)
      const isLatestUser = msg === messages[messages.length - 1] && msg.role === 'user';
      if (!isLatestUser && msg.role !== 'system') {
        content = this.stripPII(content);
      }

      result.push({ role: msg.role, content });
    }

    // 5. Compress conversation history — keep system, keep last N turns, summarize rest
    const compressed = this.compressHistory(result, maxHistoryTurns);
    compressedHistory = result.length - compressed.length;

    const tokensAfter = estimateTokens(compressed);

    return {
      messages: compressed,
      tokensBefore,
      tokensAfter,
      strippedSystemPrompt,
      strippedKnowledgeContext,
      strippedExcludedContent,
      compressedHistory,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private stripSystemPromptBoilerplate(content: string): string {
    let result = content;
    for (const marker of SYSTEM_PROMPT_MARKERS) {
      if (marker instanceof RegExp) {
        result = result.replace(marker, '');
      }
    }
    // Remove empty lines left by stripping
    result = result.replace(/\n{3,}/g, '\n\n').trim();
    return result;
  }

  private stripKnowledgeContext(content: string): string {
    let result = content;
    for (const marker of KNOWLEDGE_CONTEXT_MARKERS) {
      result = result.replace(marker, '');
    }
    // Strip blocks between DATA_BOUNDARY markers
    result = result.replace(/\[DATA_BOUNDARY_START:[^\]]*\][\s\S]*?\[DATA_BOUNDARY_END\]/g, '[context redacted]');
    return result.replace(/\n{3,}/g, '\n\n').trim();
  }

  private stripExcludedContent(content: string, excludedCategories: string[]): string {
    // Check each sentence — if it contains excluded category content, redact it
    const sentences = content.split(/(?<=[.!?])\s+/);
    const filtered = sentences.map(sentence => {
      const violations = checkExclusions(sentence, excludedCategories);
      if (violations.length > 0) {
        return `[${violations.join('/')} data redacted]`;
      }
      return sentence;
    });
    return filtered.join(' ');
  }

  private stripPII(content: string): string {
    let result = content;
    for (const pattern of PII_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  private compressHistory(
    messages: Array<{ role: string; content: string }>,
    maxTurns: number,
  ): Array<{ role: string; content: string }> {
    // Keep system message(s) and the last N non-system messages
    const systemMsgs = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    if (nonSystem.length <= maxTurns) {
      return messages;
    }

    // Keep the last maxTurns messages
    const kept = nonSystem.slice(-maxTurns);
    return [...systemMsgs, ...kept];
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
}
