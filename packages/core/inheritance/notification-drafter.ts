// Notification Drafter — Template interpolation from StyleProfile patterns.
// NO LLM at draft time. Degrades gracefully to generic template if no profile.
// CRITICAL: No networking imports.

import type { StyleProfile } from '../style/style-profile.js';
import type { NotificationDraftInput, NotificationDraft } from './types.js';

/**
 * Drafts notification messages using the user's StyleProfile patterns.
 * Pure template interpolation — no LLM involvement.
 */
export class NotificationDrafter {
  private profile: StyleProfile | null;

  constructor(profile: StyleProfile | null) {
    this.profile = profile;
  }

  /**
   * Draft a notification subject and body.
   */
  draft(input: NotificationDraftInput): NotificationDraft {
    // Use existing template if provided
    if (input.templateSubject && input.templateBody) {
      return {
        subject: this.applyContractions(this.interpolate(input.templateSubject, input)),
        body: this.applyContractions(this.interpolate(input.templateBody, input)),
      };
    }

    // Build from scratch using style profile
    const greeting = this.buildGreeting(input.recipientName);
    const signoff = this.buildSignoff(input.senderName);
    const body = this.buildBody(greeting, input.purpose, signoff);
    const subject = `A message from ${input.senderName}`;

    return {
      subject: this.applyContractions(subject),
      body: this.applyContractions(body),
    };
  }

  private buildGreeting(recipientName: string): string {
    if (!this.profile) {
      return `Dear ${recipientName},`;
    }

    const greetings = this.profile.greetings;
    if (greetings.patterns.length === 0) {
      return `Dear ${recipientName},`;
    }

    // Use the most frequent greeting pattern
    const pattern = greetings.patterns[0]!.text;

    if (greetings.usesRecipientName && recipientName) {
      // If pattern already contains a placeholder-like text, replace it
      // Otherwise append the name
      if (pattern.endsWith(',') || pattern.endsWith('!')) {
        const base = pattern.slice(0, -1);
        return `${base} ${recipientName}${pattern.slice(-1)}`;
      }
      return `${pattern} ${recipientName},`;
    }

    return pattern.endsWith(',') || pattern.endsWith('!') ? pattern : `${pattern},`;
  }

  private buildSignoff(senderName: string): string {
    if (!this.profile) {
      return `Sincerely,\n${senderName}`;
    }

    const signoffs = this.profile.signoffs;
    if (signoffs.patterns.length === 0) {
      return `Sincerely,\n${senderName}`;
    }

    // Use the most frequent signoff pattern
    const pattern = signoffs.patterns[0]!.text;

    if (signoffs.includesName) {
      return `${pattern}\n${senderName}`;
    }

    return pattern;
  }

  private buildBody(greeting: string, purpose: string, signoff: string): string {
    return `${greeting}\n\n${purpose}\n\n${signoff}`;
  }

  private interpolate(template: string, input: NotificationDraftInput): string {
    return template
      .replace(/\{recipientName\}/g, input.recipientName)
      .replace(/\{recipientEmail\}/g, input.recipientEmail)
      .replace(/\{senderName\}/g, input.senderName)
      .replace(/\{purpose\}/g, input.purpose);
  }

  private applyContractions(text: string): string {
    if (!this.profile) return text;

    // If user uses contractions, keep text as-is (assumes templates are written naturally)
    // If user avoids contractions, expand common contractions
    if (!this.profile.vocabulary.usesContractions) {
      return text
        .replace(/\bdon't\b/gi, 'do not')
        .replace(/\bcan't\b/gi, 'cannot')
        .replace(/\bwon't\b/gi, 'will not')
        .replace(/\bisn't\b/gi, 'is not')
        .replace(/\baren't\b/gi, 'are not')
        .replace(/\bdidn't\b/gi, 'did not')
        .replace(/\bwasn't\b/gi, 'was not')
        .replace(/\bI'm\b/g, 'I am')
        .replace(/\bI've\b/g, 'I have')
        .replace(/\bI'll\b/g, 'I will');
    }

    return text;
  }
}
