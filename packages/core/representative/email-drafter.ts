// Representative Email Drafter — Generates style-matched emails using the user's
// communication style profile. Retries up to 3 times when style score is below threshold.
// Reuses the retry pattern from OrchestratorImpl.applyStyleToDraft().
// CRITICAL: This file is in packages/core/. No network imports.

import type { LLMProvider, ChatMessage } from '../llm/types.js';
import type {
  StyleProfileProvider,
  KnowledgeProvider,
  DraftEmailRequest,
  RepresentativeDraft,
} from './types.js';

const DEFAULT_SCORE_THRESHOLD = 65;
const MAX_ATTEMPTS = 3;

export class RepresentativeEmailDrafter {
  private llm: LLMProvider;
  private model: string;
  private styleProvider: StyleProfileProvider;
  private knowledgeProvider: KnowledgeProvider;
  private scoreThreshold: number;

  constructor(config: {
    llm: LLMProvider;
    model: string;
    styleProvider: StyleProfileProvider;
    knowledgeProvider: KnowledgeProvider;
    scoreThreshold?: number;
  }) {
    this.llm = config.llm;
    this.model = config.model;
    this.styleProvider = config.styleProvider;
    this.knowledgeProvider = config.knowledgeProvider;
    this.scoreThreshold = config.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  }

  /**
   * Draft an email using the user's style profile.
   * Retries up to 3 times with targeted retry prompts on weak style dimensions.
   */
  async draftEmail(request: DraftEmailRequest): Promise<RepresentativeDraft> {
    // Gather context from knowledge graph
    const contextResults = await this.knowledgeProvider.searchContext(
      `${request.recipientName ?? request.to} ${request.subject} ${request.intent}`,
      3,
    );
    const contextSnippets = contextResults.map(r => r.chunk.content).join('\n---\n');

    // Get style prompt
    const stylePrompt = this.styleProvider.getStylePrompt({
      isReply: !!request.replyToMessageId,
      subject: request.subject,
      recipientName: request.recipientName,
      recipientContext: request.recipientContext,
    });

    let bestDraft: string = '';
    let bestScore = this.styleProvider.getStyleScore('') ?? null;
    let attempts = 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      attempts = attempt + 1;

      const messages: ChatMessage[] = [];

      // System prompt with style instructions
      const systemParts = [
        'You are drafting an email on behalf of the user as their Digital Representative.',
        'Write ONLY the email body — no metadata, no subject line header, no explanations.',
        '',
        stylePrompt,
      ];

      if (contextSnippets) {
        systemParts.push('', 'Relevant context from the user\'s knowledge graph:', contextSnippets);
      }

      messages.push({ role: 'system', content: systemParts.join('\n') });

      // Build user message
      const userParts = [
        `Draft type: ${request.draftType}`,
        `To: ${request.to}`,
        `Subject: ${request.subject}`,
        `Intent: ${request.intent}`,
      ];

      if (request.recipientName) {
        userParts.push(`Recipient name: ${request.recipientName}`);
      }
      if (request.additionalContext) {
        userParts.push(`Additional context: ${request.additionalContext}`);
      }

      // Add retry instructions for subsequent attempts
      if (attempt > 0 && bestScore) {
        const weakDims = Object.entries(bestScore.breakdown)
          .map(([name, score]) => ({ name, score }))
          .filter(d => d.score < 70);

        const retryPrompt = this.styleProvider.getRetryPrompt(weakDims);
        if (retryPrompt) {
          userParts.push('', retryPrompt);
        }
        userParts.push('', `Previous draft (score ${bestScore.overall}/100):\n${bestDraft}`);
        userParts.push('', 'Please rewrite this draft to better match the user\'s style.');
      }

      messages.push({ role: 'user', content: userParts.join('\n') });

      const response = await this.llm.chat({
        model: this.model,
        messages,
        temperature: 0.7,
        maxTokens: 1024,
      });

      const draftText = response.message.content.trim();
      const score = this.styleProvider.getStyleScore(draftText);

      // Keep the best draft
      if (!bestScore || (score && score.overall > (bestScore?.overall ?? 0))) {
        bestDraft = draftText;
        bestScore = score;
      }

      // If score is above threshold (or no style profile active), accept
      if (!score || score.overall >= this.scoreThreshold) {
        break;
      }
    }

    return {
      to: request.to,
      subject: request.subject,
      body: bestDraft,
      draftType: request.draftType,
      styleScore: bestScore,
      attempts,
      replyToMessageId: request.replyToMessageId,
    };
  }
}
