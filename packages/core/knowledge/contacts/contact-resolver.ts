// Contact Resolver — Resolves name references to contacts for the orchestrator.
//
// Resolution priority:
//   1. Exact full name → 'exact'
//   2. First name single match → 'high'
//   3. Multiple matches → context disambiguation or 'ambiguous' + disambiguationQuestion
//   4. No match → 'none'
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { ContactStore } from './contact-store.js';
import type { ContactEntity, ResolvedContactResult } from './contact-types.js';

export interface ResolveContext {
  topic?: string;
  actionType?: string;
}

export class ContactResolver {
  private contactStore: ContactStore;

  constructor(config: { contactStore: ContactStore }) {
    this.contactStore = config.contactStore;
  }

  /**
   * Resolve a name reference to a contact.
   */
  resolve(nameRef: string, context?: ResolveContext): ResolvedContactResult {
    const trimmed = nameRef.trim();
    if (!trimmed) {
      return { contact: null, confidence: 'none' };
    }

    // Priority 1: Exact full name match
    const exactMatches = this.contactStore.findByName(trimmed).filter(
      c => c.displayName.toLowerCase() === trimmed.toLowerCase()
    );

    if (exactMatches.length === 1) {
      return { contact: exactMatches[0]!, confidence: 'exact' };
    }

    if (exactMatches.length > 1) {
      return this.disambiguate(exactMatches, trimmed, context);
    }

    // Priority 2: Partial name match (first name)
    const partialMatches = this.contactStore.findByName(trimmed);

    if (partialMatches.length === 1) {
      return { contact: partialMatches[0]!, confidence: 'high' };
    }

    if (partialMatches.length > 1) {
      return this.disambiguate(partialMatches, trimmed, context);
    }

    // Priority 4: No match
    return { contact: null, confidence: 'none' };
  }

  /**
   * Disambiguate between multiple matches using context.
   */
  private disambiguate(
    candidates: ContactEntity[],
    nameRef: string,
    context?: ResolveContext,
  ): ResolvedContactResult {
    // Try topic-based disambiguation
    if (context?.topic) {
      const topicLower = context.topic.toLowerCase();
      // Match by organization
      const orgMatch = candidates.find(
        c => c.organization && topicLower.includes(c.organization.toLowerCase())
      );
      if (orgMatch) {
        return { contact: orgMatch, confidence: 'high', candidates };
      }
    }

    // Try action-type disambiguation (e.g., 'text' prefers contact with phone)
    if (context?.actionType) {
      if (context.actionType === 'text' || context.actionType === 'call') {
        const withPhone = candidates.filter(c => c.phones.length > 0);
        if (withPhone.length === 1) {
          return { contact: withPhone[0]!, confidence: 'high', candidates };
        }
      }
    }

    // Ambiguous — return candidates with a question
    const names = candidates.map(c => {
      const parts = [c.displayName];
      if (c.organization) parts.push(`(${c.organization})`);
      return parts.join(' ');
    });

    return {
      contact: null,
      confidence: 'ambiguous',
      candidates,
      disambiguationQuestion: `Which "${nameRef}" do you mean? ${names.join(', ')}`,
    };
  }
}
