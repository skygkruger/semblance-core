// Style Injector — Produces LLM prompt fragments for style-matched email drafting.
// This is the most important file in Step 11. The quality of the prompt engineering
// determines whether drafts sound like the user or sound like an AI trying to sound like the user.
// CRITICAL: This file is in packages/core/. No network imports.

import type { StyleProfile } from './style-profile.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DraftContext {
  recipientEmail?: string;
  recipientName?: string;
  isReply: boolean;
  subject: string;
  recipientContext?: string; // 'colleague', 'client', 'friend', 'manager', 'report', 'unknown'
}

// ─── Style Prompt Builder ─────────────────────────────────────────────────────

/**
 * Build a style-aware prompt fragment from an active StyleProfile.
 * This fragment is injected into the LLM prompt when drafting emails.
 */
export function buildStylePrompt(profile: StyleProfile, context: DraftContext): string {
  const lines: string[] = [];

  lines.push('Write this email in the user\'s personal writing style.');
  lines.push('');
  lines.push('Their style characteristics:');

  // Greetings
  if (profile.greetings.patterns.length > 0) {
    const greetingDesc = profile.greetings.patterns
      .slice(0, 3)
      .map(p => {
        const pct = Math.round(p.frequency * 100);
        return `"${p.text}" (${pct}%)`;
      })
      .join(' or ');

    const nameNote = profile.greetings.usesRecipientName
      ? `, followed by the recipient's ${profile.greetings.usesNameVariant === 'first' ? 'first name' : 'name'}`
      : '';

    // Apply context variation if available
    const contextVariation = context.recipientContext
      ? profile.contextVariations.find(v => v.context === context.recipientContext)
      : null;

    if (contextVariation && contextVariation.toneNotes) {
      lines.push(`- They typically open with ${greetingDesc}${nameNote}. ${contextVariation.toneNotes}`);
    } else {
      lines.push(`- They typically open with ${greetingDesc}${nameNote}`);
    }
  }

  // Sign-offs
  if (profile.signoffs.patterns.length > 0) {
    const signoffDesc = profile.signoffs.patterns
      .slice(0, 3)
      .map(p => {
        const pct = Math.round(p.frequency * 100);
        return `"${p.text}" (${pct}%)`;
      })
      .join(' or ');

    const nameNote = profile.signoffs.includesName ? ' followed by their name' : '';
    lines.push(`- They sign off with ${signoffDesc}${nameNote}`);
  }

  // Tone
  const formalityLabel = describeFormalityLevel(profile.tone.formalityScore);
  lines.push(`- Their tone is ${formalityLabel} (${profile.tone.formalityScore}/100) and ${describeDirectness(profile.tone.directnessScore)} (${profile.tone.directnessScore}/100)`);

  // Adjust for context
  if (context.recipientContext) {
    const variation = profile.contextVariations.find(v => v.context === context.recipientContext);
    if (variation && variation.formalityDelta !== 0) {
      const adjustedFormality = Math.max(0, Math.min(100, profile.tone.formalityScore + variation.formalityDelta));
      const adjustedLabel = describeFormalityLevel(adjustedFormality);
      lines.push(`- For ${context.recipientContext}s specifically, they tend to be ${adjustedLabel}`);
    }
  }

  // Structure
  if (profile.structure.avgSentenceLength > 0) {
    lines.push(`- Average sentence length: ${profile.structure.avgSentenceLength} words. ${describeEmailLength(profile.structure.avgEmailLength)}`);
  }

  // Contractions
  if (profile.vocabulary.contractionRate > 0) {
    const contractionDesc = profile.vocabulary.contractionRate > 0.7
      ? 'They frequently use contractions (I\'m, don\'t, we\'ll)'
      : profile.vocabulary.contractionRate > 0.3
        ? 'They sometimes use contractions'
        : 'They rarely use contractions';
    lines.push(`- ${contractionDesc} — contraction rate: ${profile.vocabulary.contractionRate}`);
  }

  // Exclamation
  if (profile.vocabulary.exclamationRate > 0) {
    const excDesc = profile.vocabulary.exclamationRate > 0.3
      ? 'They use exclamation marks frequently'
      : profile.vocabulary.exclamationRate > 0.1
        ? `They occasionally use exclamation marks (rate: ${profile.vocabulary.exclamationRate}) — don't overuse them`
        : `They rarely use exclamation marks (rate: ${profile.vocabulary.exclamationRate}) — avoid them`;
    lines.push(`- ${excDesc}`);
  }

  // Common phrases
  if (profile.vocabulary.commonPhrases.length > 0) {
    const phrases = profile.vocabulary.commonPhrases.slice(0, 5).map(p => `"${p}"`).join(', ');
    lines.push(`- Common phrases they use: ${phrases}`);
  }

  // Emoji
  if (profile.vocabulary.usesEmoji) {
    const emojiDesc = profile.vocabulary.emojiFrequency > 0.5
      ? 'They frequently use emoji'
      : 'They occasionally use emoji';
    lines.push(`- ${emojiDesc}`);
  } else {
    lines.push('- They do not use emoji in emails');
  }

  // Lists
  if (profile.structure.usesListsOrBullets && profile.structure.listFrequency > 0.1) {
    lines.push('- They often use bullet points or numbered lists to organize information');
  }

  lines.push('');
  lines.push('The email should read as if the user wrote it naturally, not as if an AI is mimicking them. Match the rhythm and vocabulary, not just the format.');

  return lines.join('\n');
}

/**
 * Build a neutral professional style prompt for when the profile is inactive (< 20 emails).
 * This produces competent, generic professional emails.
 */
export function buildInactiveStylePrompt(): string {
  return `Write this email in a natural, professional tone.

Guidelines:
- Use a friendly but professional greeting (e.g., "Hi [name],")
- Keep sentences concise and clear
- Be direct but polite
- Close with a standard professional sign-off (e.g., "Best," or "Thanks,")
- Avoid overly formal language or corporate jargon
- Sound like a real person, not a template

The email should sound natural and human, not robotic or formulaic.`;
}

/**
 * Build a retry prompt when a draft scored below threshold.
 * Focuses on the weakest dimensions from the score breakdown.
 */
export function buildRetryPrompt(
  weakDimensions: Array<{ name: string; score: number }>,
  profile: StyleProfile,
): string {
  const issues = weakDimensions
    .filter(d => d.score < 70)
    .map(d => {
      switch (d.name) {
        case 'greeting': {
          const topGreeting = profile.greetings.patterns[0];
          return topGreeting
            ? `Use "${topGreeting.text}" as the greeting (the user's most common)`
            : 'Match the user\'s greeting style';
        }
        case 'signoff': {
          const topSignoff = profile.signoffs.patterns[0];
          return topSignoff
            ? `Use "${topSignoff.text}" as the sign-off (the user's most common)`
            : 'Match the user\'s sign-off style';
        }
        case 'sentenceLength':
          return `Keep sentences around ${profile.structure.avgSentenceLength} words on average`;
        case 'formality':
          return `Adjust formality level — the user's style is ${describeFormalityLevel(profile.tone.formalityScore)}`;
        case 'vocabulary':
          return profile.vocabulary.usesContractions
            ? 'Use more contractions to match the user\'s casual writing style'
            : 'Use fewer contractions to match the user\'s formal writing style';
        default:
          return '';
      }
    })
    .filter(s => s.length > 0);

  if (issues.length === 0) return '';

  return `The previous draft didn't match the user's style closely enough. Pay special attention to:\n${issues.map(i => `- ${i}`).join('\n')}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function describeFormalityLevel(score: number): string {
  if (score >= 80) return 'very formal';
  if (score >= 60) return 'moderately formal';
  if (score >= 40) return 'balanced/neutral';
  if (score >= 20) return 'moderately casual';
  return 'very casual';
}

function describeDirectness(score: number): string {
  if (score >= 70) return 'direct';
  if (score >= 40) return 'balanced';
  return 'indirect/hedging';
}

function describeEmailLength(avgWords: number): string {
  if (avgWords === 0) return '';
  if (avgWords < 50) return 'They write concise, short emails.';
  if (avgWords < 150) return 'They write moderate-length emails.';
  return 'They write detailed, longer emails.';
}
