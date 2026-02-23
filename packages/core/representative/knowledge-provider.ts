// Knowledge Provider — Wraps SemanticSearch for the Digital Representative.
// Provides context from the knowledge graph for drafting style-matched emails.
// CRITICAL: This file is in packages/core/. No network imports.

import type { SemanticSearch } from '../knowledge/search.js';
import type { SearchResult } from '../knowledge/types.js';
import type { KnowledgeProvider, KnowledgeSearchOptions } from './types.js';

export class KnowledgeProviderImpl implements KnowledgeProvider {
  private search: SemanticSearch;

  constructor(search: SemanticSearch) {
    this.search = search;
  }

  async searchContext(query: string, limit: number = 5): Promise<SearchResult[]> {
    return this.search.search(query, { limit });
  }

  async searchEmails(query: string, opts?: KnowledgeSearchOptions): Promise<SearchResult[]> {
    return this.search.search(query, {
      limit: opts?.limit ?? 10,
      sourceTypes: ['email'],
    });
  }
}
