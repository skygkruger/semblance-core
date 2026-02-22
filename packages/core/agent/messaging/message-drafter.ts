// Message Drafter — Generates SMS-style messages using the user's style profile.
//
// SMS messages are short (1-3 sentences), casual register, no salutation/signoff.
// Reuses StyleProfile vocabulary and tone but ignores greeting/signoff patterns.
//
// CRITICAL: No network imports. Uses LLM provider passed via constructor.

import type { LLMProvider } from '../../llm/types.js';
import type { StyleProfile } from '../../style/style-profile.js';

export interface DraftMessageRequest {
  /** The user's intent (e.g., "confirm Tuesday pickup") */
  intent: string;
  /** Recipient name for personalization */
  recipientName?: string;
  /** Relationship type for tone adjustment */
  relationship?: string;
  /** Optional style profile for matching user's writing */
  styleProfile?: StyleProfile | null;
}

export interface DraftedMessage {
  /** The drafted message body */
  body: string;
  /** Whether style profile was applied */
  styleApplied: boolean;
}

/**
 * Build an SMS-specific style prompt from the user's style profile.
 * SMS-specific: short, casual, no salutation/signoff.
 */
export function buildSmsStylePrompt(
  profile: StyleProfile | null | undefined,
  recipientName?: string,
  relationship?: string,
): string {
  const parts: string[] = [];

  parts.push('You are drafting a SHORT text message (SMS). Rules:');
  parts.push('- 1-3 sentences maximum');
  parts.push('- Casual, conversational register');
  parts.push('- NO salutation or greeting (no "Hi", "Hey", "Dear")');
  parts.push('- NO signoff (no "Thanks", "Best", "Cheers")');
  parts.push('- Output ONLY the message text, nothing else');

  if (recipientName) {
    parts.push(`- Recipient: ${recipientName}`);
  }

  if (relationship) {
    parts.push(`- Relationship: ${relationship} (adjust formality accordingly)`);
  }

  if (profile?.isActive) {
    // Apply vocabulary and tone from style profile
    if (profile.tone) {
      parts.push(`- Formality level: ${profile.tone.formalityScore}/10`);
      parts.push(`- Warmth level: ${profile.tone.warmthScore}/10`);
    }

    if (profile.vocabulary?.usesContractions) {
      parts.push('- Use contractions naturally');
    }

    if (profile.vocabulary?.commonPhrases && profile.vocabulary.commonPhrases.length > 0) {
      const phrases = profile.vocabulary.commonPhrases.slice(0, 5).join(', ');
      parts.push(`- Common phrases this user uses: ${phrases}`);
    }

    if (profile.vocabulary?.usesEmoji) {
      parts.push('- User occasionally uses emoji — you may include one if natural');
    } else {
      parts.push('- No emoji');
    }

    if (profile.structure?.avgSentenceLength) {
      const target = Math.min(profile.structure.avgSentenceLength, 15);
      parts.push(`- Target sentence length: ~${target} words`);
    }
  } else {
    // No active profile — neutral casual
    parts.push('- Neutral, friendly casual tone');
    parts.push('- Use contractions naturally');
    parts.push('- No emoji');
  }

  return parts.join('\n');
}

export class MessageDrafter {
  private llm: LLMProvider;
  private model: string;

  constructor(config: { llm: LLMProvider; model: string }) {
    this.llm = config.llm;
    this.model = config.model;
  }

  /**
   * Draft a text message based on user intent and optional style profile.
   */
  async draftMessage(request: DraftMessageRequest): Promise<DraftedMessage> {
    const stylePrompt = buildSmsStylePrompt(
      request.styleProfile,
      request.recipientName,
      request.relationship,
    );

    const userPrompt = request.recipientName
      ? `Draft a text message to ${request.recipientName}: ${request.intent}`
      : `Draft a text message: ${request.intent}`;

    try {
      const response = await this.llm.chat({
        model: this.model,
        messages: [
          { role: 'system', content: stylePrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      });

      const body = response.message.content.trim();

      return {
        body,
        styleApplied: !!request.styleProfile?.isActive,
      };
    } catch {
      // LLM failed — return a simple default
      return {
        body: request.intent,
        styleApplied: false,
      };
    }
  }
}
