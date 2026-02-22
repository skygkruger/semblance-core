// Contact Entity Resolver — Resolves device contacts against existing knowledge graph entities.
//
// Resolution priority:
//   1. Email match → high confidence
//   2. Name + org match → high confidence
//   3. Fuzzy name (Levenshtein ≤ 2) → medium + needsConfirmation
//   4. No match → new entity
//
// CRITICAL: This file is in packages/core/. No network imports.
// Reuses: DocumentStore.findEntitiesByName() for entity matching.

import type { ContactStore } from './contact-store.js';
import type { ContactEntity, EntityResolutionResult, ResolutionConfidence } from './contact-types.js';
import type { DocumentStore } from '../document-store.js';

/**
 * Pure Levenshtein distance implementation.
 * No external dependency — single-row DP approach.
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 0;
  if (aLower.length === 0) return bLower.length;
  if (bLower.length === 0) return aLower.length;

  let prev = Array.from({ length: bLower.length + 1 }, (_, i) => i);
  let curr = new Array<number>(bLower.length + 1);

  for (let i = 1; i <= aLower.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= bLower.length; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1,      // deletion
        curr[j - 1]! + 1,  // insertion
        prev[j - 1]! + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[bLower.length]!;
}

export interface ResolvedContact {
  contactId: string;
  matchedEntityId: string | null;
  confidence: ResolutionConfidence;
  matchType: 'email' | 'name_org' | 'fuzzy_name' | 'new';
  needsConfirmation: boolean;
}

export class ContactEntityResolver {
  private contactStore: ContactStore;
  private documentStore: DocumentStore;

  constructor(config: {
    contactStore: ContactStore;
    documentStore: DocumentStore;
  }) {
    this.contactStore = config.contactStore;
    this.documentStore = config.documentStore;
  }

  /**
   * Resolve a single contact against existing knowledge graph entities.
   */
  resolve(contact: ContactEntity): EntityResolutionResult {
    // Priority 1: Email match → high confidence
    for (const email of contact.emails) {
      const existingEntities = this.documentStore.findEntitiesByName(email);
      if (existingEntities.length > 0) {
        return {
          contactId: contact.id,
          matchedEntityId: existingEntities[0]!.id,
          confidence: 'high',
          matchType: 'email',
          needsConfirmation: false,
        };
      }
    }

    // Priority 2: Name + org match → high confidence
    if (contact.displayName && contact.organization) {
      const nameEntities = this.documentStore.findEntitiesByName(contact.displayName);
      for (const entity of nameEntities) {
        const orgMatch = entity.metadata &&
          typeof entity.metadata === 'object' &&
          'organization' in entity.metadata &&
          (entity.metadata as Record<string, unknown>).organization === contact.organization;
        if (orgMatch) {
          return {
            contactId: contact.id,
            matchedEntityId: entity.id,
            confidence: 'high',
            matchType: 'name_org',
            needsConfirmation: false,
          };
        }
      }
    }

    // Priority 3: Fuzzy name match (Levenshtein ≤ 2) → medium + needsConfirmation
    // Search by parts of the name to broaden the candidate set
    if (contact.displayName) {
      const searchTerms = new Set([contact.displayName]);
      if (contact.familyName) searchTerms.add(contact.familyName);
      if (contact.givenName) searchTerms.add(contact.givenName);
      // Also split display name on spaces for partial matching
      for (const part of contact.displayName.split(/\s+/)) {
        if (part.length >= 2) searchTerms.add(part);
      }

      const seenEntityIds = new Set<string>();
      for (const term of searchTerms) {
        const nameEntities = this.documentStore.findEntitiesByName(term);
        for (const entity of nameEntities) {
          if (seenEntityIds.has(entity.id)) continue;
          seenEntityIds.add(entity.id);

          const dist = levenshteinDistance(contact.displayName, entity.name);
          if (dist === 0) {
            // Exact name match (no org match — otherwise would have been caught above)
            return {
              contactId: contact.id,
              matchedEntityId: entity.id,
              confidence: 'high',
              matchType: 'name_org',
              needsConfirmation: false,
            };
          }
          if (dist <= 2) {
            return {
              contactId: contact.id,
              matchedEntityId: entity.id,
              confidence: 'medium',
              matchType: 'fuzzy_name',
              needsConfirmation: true,
            };
          }
        }
      }
    }

    // Priority 4: No match → new entity
    return {
      contactId: contact.id,
      matchedEntityId: null,
      confidence: 'low',
      matchType: 'new',
      needsConfirmation: false,
    };
  }

  /**
   * Batch resolve all contacts.
   */
  resolveAll(): EntityResolutionResult[] {
    const contacts = this.contactStore.listContacts({ limit: 10000 });
    return contacts.map(c => this.resolve(c));
  }

  /**
   * Link a contact to existing entity IDs from email/calendar/document stores.
   * Updates the contact's entity ID arrays.
   */
  linkToExistingEntities(contactId: string, links: {
    emailEntityIds?: string[];
    calendarEntityIds?: string[];
    documentEntityIds?: string[];
  }): void {
    const contact = this.contactStore.getContact(contactId);
    if (!contact) return;

    const updates: Partial<{
      emailEntityIds: string[];
      calendarEntityIds: string[];
      documentEntityIds: string[];
    }> = {};

    if (links.emailEntityIds) {
      updates.emailEntityIds = [...new Set([...contact.emailEntityIds, ...links.emailEntityIds])];
    }
    if (links.calendarEntityIds) {
      updates.calendarEntityIds = [...new Set([...contact.calendarEntityIds, ...links.calendarEntityIds])];
    }
    if (links.documentEntityIds) {
      updates.documentEntityIds = [...new Set([...contact.documentEntityIds, ...links.documentEntityIds])];
    }

    this.contactStore.updateContact(contactId, updates);
  }
}
