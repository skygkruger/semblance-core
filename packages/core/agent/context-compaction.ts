// Context Compaction — Compresses conversation history for local models
// with limited context windows (4K–32K tokens).
//
// Strategy:
//   1. Rolling summary: after N tool calls, summarize history via fast model
//   2. Knowledge graph offload: intermediate results stored as ephemeral nodes
//   3. Priority retention: system prompt, current subtask, recent tool results never compacted
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { LLMProvider, ChatMessage } from '../llm/types.js';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { SessionMemoryStore, CompactionResult } from './orchestrator-v2-types.js';

export interface CompactionConfig {
  /** Number of tool calls between compaction cycles */
  interval: number;
  /** Maximum messages to keep before compaction (recent messages) */
  retainRecentCount: number;
  /** Maximum tokens for the compacted summary */
  maxSummaryTokens: number;
}

const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  interval: 5,
  retainRecentCount: 4,
  maxSummaryTokens: 512,
};

export class ContextCompactionEngine {
  private llm: LLMProvider;
  private knowledge: KnowledgeGraph | null;
  private sessionMemory: SessionMemoryStore;
  private config: CompactionConfig;
  private toolCallsSinceCompaction = 0;
  private totalCompactions = 0;

  constructor(
    llm: LLMProvider,
    knowledge: KnowledgeGraph | null,
    sessionMemory: SessionMemoryStore,
    config?: Partial<CompactionConfig>,
  ) {
    this.llm = llm;
    this.knowledge = knowledge;
    this.sessionMemory = sessionMemory;
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  }

  /** Track a tool call. Returns true if compaction should fire. */
  recordToolCall(): boolean {
    this.toolCallsSinceCompaction++;
    return this.toolCallsSinceCompaction >= this.config.interval;
  }

  /** Reset the tool call counter (called after compaction). */
  resetCounter(): void {
    this.toolCallsSinceCompaction = 0;
  }

  /**
   * Compact a conversation history.
   *
   * Keeps the system prompt (index 0) and the most recent N messages intact.
   * Everything in between is summarized using the fast model.
   *
   * @param messages The full message array (system + conversation)
   * @param sessionId For knowledge graph offload tagging
   * @returns The compacted messages array and compaction metadata
   */
  async compact(
    messages: ChatMessage[],
    sessionId: string,
  ): Promise<{ messages: ChatMessage[]; result: CompactionResult }> {
    const tokensBefore = this.estimateTokens(messages);

    // Nothing to compact if messages are short
    if (messages.length <= this.config.retainRecentCount + 2) {
      return {
        messages,
        result: {
          summary: '',
          messagesCompacted: 0,
          offloadedEntries: 0,
          tokensBefore,
          tokensAfter: tokensBefore,
        },
      };
    }

    // Split: [system] [compactable...] [recent...]
    const systemMessage = messages[0]!;
    const retainStart = messages.length - this.config.retainRecentCount;
    const compactableMessages = messages.slice(1, retainStart);
    const recentMessages = messages.slice(retainStart);

    if (compactableMessages.length === 0) {
      return {
        messages,
        result: {
          summary: '',
          messagesCompacted: 0,
          offloadedEntries: 0,
          tokensBefore,
          tokensAfter: tokensBefore,
        },
      };
    }

    // Generate rolling summary using fast model
    const summary = await this.generateSummary(compactableMessages);

    // Offload session memory ephemeral entries to knowledge graph
    let offloadedEntries = 0;
    if (this.knowledge) {
      const ephemeralEntries = this.sessionMemory.getByPriority('ephemeral');
      for (const entry of ephemeralEntries) {
        try {
          await this.knowledge.indexDocument({
            content: `Session memory (${entry.key}): ${entry.value}`,
            title: `Session memory: ${entry.key}`,
            source: 'conversation' as const,
            mimeType: 'text/plain',
            metadata: {
              sessionId,
              ephemeral: true,
              expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // TTL: 2 hours
            },
          });
          offloadedEntries++;
        } catch {
          // Offload failed — entry stays in session memory
        }
      }
      if (offloadedEntries > 0) {
        this.sessionMemory.clearEphemeral();
      }
    }

    // Build compacted session memory context
    const memorySnapshot = this.sessionMemory.getCompactionSnapshot();
    const memoryContext = memorySnapshot.length > 0
      ? '\n\nSession state:\n' + memorySnapshot.map(e => `- ${e.key}: ${e.value}`).join('\n')
      : '';

    // Reconstruct messages: system + summary + session memory + recent
    const summaryMessage: ChatMessage = {
      role: 'assistant',
      content: `[Conversation summary: ${summary}${memoryContext}]`,
    };

    const compactedMessages = [systemMessage, summaryMessage, ...recentMessages];
    const tokensAfter = this.estimateTokens(compactedMessages);

    this.totalCompactions++;
    this.resetCounter();

    return {
      messages: compactedMessages,
      result: {
        summary,
        messagesCompacted: compactableMessages.length,
        offloadedEntries,
        tokensBefore,
        tokensAfter,
      },
    };
  }

  /**
   * Generate a compressed summary of conversation messages.
   * Uses routedChat with 'classify' task type to hit the fast model if available.
   */
  private async generateSummary(messages: ChatMessage[]): Promise<string> {
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 4000); // Cap input to avoid overwhelming the fast model

    const summaryRequest = {
      model: '', // routedChat/routedGenerate picks the model
      messages: [
        {
          role: 'system' as const,
          content: 'Summarize the following conversation concisely. Preserve: key facts, decisions made, pending actions, user preferences expressed. Drop: greetings, filler, verbose tool outputs. Output only the summary, no preamble.',
        },
        {
          role: 'user' as const,
          content: conversationText,
        },
      ],
      temperature: 0.3,
      maxTokens: this.config.maxSummaryTokens,
    };

    try {
      const response = this.llm.routedChat
        ? await this.llm.routedChat(summaryRequest, 'classify')
        : await this.llm.chat(summaryRequest);
      return response.message.content ?? '';
    } catch {
      // Fallback: mechanical truncation if LLM fails
      return messages
        .map(m => {
          const prefix = m.role === 'user' ? 'User' : 'Assistant';
          const truncated = m.content.slice(0, 200);
          return `${prefix}: ${truncated}${m.content.length > 200 ? '...' : ''}`;
        })
        .join(' | ');
    }
  }

  /** Rough token estimate (~4 chars per token). */
  private estimateTokens(messages: ChatMessage[]): number {
    return Math.ceil(
      messages.reduce((sum, m) => sum + m.content.length, 0) / 4,
    );
  }

  /** Get compaction stats. */
  getStats(): { totalCompactions: number; toolCallsSinceCompaction: number } {
    return {
      totalCompactions: this.totalCompactions,
      toolCallsSinceCompaction: this.toolCallsSinceCompaction,
    };
  }
}
