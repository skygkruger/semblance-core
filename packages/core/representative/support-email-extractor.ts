// Support Email Extractor — 3-tier extraction: known database, email history, LLM fallback.
// Finds support/cancellation contact info for subscription services.
// CRITICAL: This file is in packages/core/. No network imports.

import type { LLMProvider } from '../llm/types.js';
import type { KnowledgeProvider } from './types.js';
import type { SupportContact } from './types.js';

// ─── Known Support Contacts Database ─────────────────────────────────────────

const KNOWN_SUPPORT_CONTACTS: Record<string, { email: string; cancellationUrl?: string }> = {
  'netflix': { email: 'support@netflix.com', cancellationUrl: 'https://www.netflix.com/cancelplan' },
  'spotify': { email: 'support@spotify.com', cancellationUrl: 'https://www.spotify.com/account/subscription/' },
  'hulu': { email: 'support@hulu.com', cancellationUrl: 'https://secure.hulu.com/account' },
  'adobe': { email: 'support@adobe.com', cancellationUrl: 'https://account.adobe.com/plans' },
  'amazon prime': { email: 'prime-feedback@amazon.com', cancellationUrl: 'https://www.amazon.com/mc/pipelines' },
  'apple': { email: 'support@apple.com', cancellationUrl: 'https://support.apple.com/en-us/HT202039' },
  'disney+': { email: 'support@disneyplus.com', cancellationUrl: 'https://www.disneyplus.com/account' },
  'hbo max': { email: 'support@hbomax.com' },
  'paramount+': { email: 'support@paramountplus.com' },
  'peacock': { email: 'support@peacocktv.com' },
  'youtube premium': { email: 'support@youtube.com', cancellationUrl: 'https://www.youtube.com/paid_memberships' },
  'dropbox': { email: 'support@dropbox.com', cancellationUrl: 'https://www.dropbox.com/account/plan' },
  'google one': { email: 'support@google.com', cancellationUrl: 'https://one.google.com/settings' },
  'microsoft 365': { email: 'support@microsoft.com', cancellationUrl: 'https://account.microsoft.com/services' },
  'nordvpn': { email: 'support@nordvpn.com' },
  'expressvpn': { email: 'support@expressvpn.com' },
  'notion': { email: 'team@makenotion.com' },
  'slack': { email: 'feedback@slack.com' },
  'zoom': { email: 'support@zoom.us', cancellationUrl: 'https://zoom.us/account' },
  'grammarly': { email: 'support@grammarly.com' },
  'canva': { email: 'support@canva.com' },
  'chatgpt': { email: 'support@openai.com', cancellationUrl: 'https://chat.openai.com/settings/subscription' },
  'audible': { email: 'social-support@audible.com' },
  'linkedin premium': { email: 'support@linkedin.com', cancellationUrl: 'https://www.linkedin.com/mypreferences/d/manage-subscription' },
  'evernote': { email: 'support@evernote.com' },
  'todoist': { email: 'support@todoist.com' },
  '1password': { email: 'support@1password.com' },
  'dashlane': { email: 'support@dashlane.com' },
  'headspace': { email: 'help@headspace.com' },
  'calm': { email: 'help@calm.com' },
  'peloton': { email: 'support@onepeloton.com' },
  'planet fitness': { email: 'info@planetfitness.com' },
  'nytimes': { email: 'help@nytimes.com', cancellationUrl: 'https://myaccount.nytimes.com/seg/' },
};

// ─── Extractor ───────────────────────────────────────────────────────────────

export class SupportEmailExtractor {
  private knowledgeProvider: KnowledgeProvider;
  private llm: LLMProvider;
  private model: string;

  constructor(config: {
    knowledgeProvider: KnowledgeProvider;
    llm: LLMProvider;
    model: string;
  }) {
    this.knowledgeProvider = config.knowledgeProvider;
    this.llm = config.llm;
    this.model = config.model;
  }

  /**
   * Extract support contact information for a merchant using a 3-tier approach:
   * 1. Known database lookup
   * 2. Email history search
   * 3. LLM extraction from available context
   */
  async extract(merchantName: string): Promise<SupportContact> {
    // Tier 1: Known database lookup
    const normalized = merchantName.toLowerCase().trim();
    for (const [key, contact] of Object.entries(KNOWN_SUPPORT_CONTACTS)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return {
          email: contact.email,
          cancellationUrl: contact.cancellationUrl,
          method: contact.cancellationUrl ? 'url' : 'email',
          source: 'known-database',
        };
      }
    }

    // Tier 2: Search email history for support emails from this merchant
    const emailResults = await this.knowledgeProvider.searchEmails(
      `${merchantName} cancel subscription support account`,
      { limit: 5 },
    );

    if (emailResults.length > 0) {
      // Look for email addresses in the results
      const emailRegex = /[\w.+-]+@[\w-]+\.[\w.]+/g;
      for (const result of emailResults) {
        const content = result.chunk.content;
        const matches = content.match(emailRegex);
        if (matches && matches.length > 0) {
          // Filter out common non-support addresses
          const supportEmail = matches.find(e =>
            e.includes('support') || e.includes('help') || e.includes('cancel') ||
            e.includes('billing') || e.includes('service') || e.includes('care')
          ) ?? matches[0]!;

          return {
            email: supportEmail,
            method: 'email',
            source: 'email-history',
          };
        }
      }
    }

    // Tier 3: LLM extraction — ask the model for likely contact
    try {
      const response = await this.llm.chat({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Return ONLY a JSON object with "email" and optionally "cancellationUrl" fields for the customer support contact of the given company. If you are not confident, return {"email":"unknown"}.',
          },
          {
            role: 'user',
            content: `What is the customer support email for ${merchantName}?`,
          },
        ],
        format: 'json',
        temperature: 0,
        maxTokens: 150,
      });

      const parsed = JSON.parse(response.message.content) as { email?: string; cancellationUrl?: string };
      if (parsed.email && parsed.email !== 'unknown') {
        return {
          email: parsed.email,
          cancellationUrl: parsed.cancellationUrl,
          method: parsed.cancellationUrl ? 'url' : 'email',
          source: 'llm-extraction',
        };
      }
    } catch {
      // LLM extraction failed — fall through to unknown
    }

    return {
      email: '',
      method: 'unknown',
      source: 'not-found',
    };
  }
}
