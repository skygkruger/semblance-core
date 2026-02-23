// User Data Resolver — Maps PDF form fields to user data from the knowledge graph.
// Known pattern matching first, then LLM fallback for ambiguous fields.
// CRITICAL: NEVER auto-fill SSN, passwords, PINs, or high-sensitivity credentials.
// CRITICAL: This file is in packages/core/. No network imports.

import type { LLMProvider } from '../llm/types.js';
import type { SemanticSearch } from '../knowledge/search.js';
import type { PDFFormField, ResolvedField, FieldConfidence } from './types.js';

// ─── Sensitive Field Patterns (NEVER auto-fill) ────────────────────────────

const SENSITIVE_FIELD_PATTERNS = [
  /\bssn\b/i,
  /\bsocial\s*security/i,
  /\bpassword\b/i,
  /\bpasscode\b/i,
  /\bpin\b/i,
  /\bsecret\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /\bsecurity\s*code/i,
  /\bcard\s*number\b/i,
  /\bcredit\s*card\b/i,
  /\bdebit\s*card\b/i,
  /\baccount\s*number\b/i,
  /\brouting\s*number\b/i,
];

// ─── Known Field Mappings (high confidence, no LLM needed) ────────────────

interface KnownMapping {
  patterns: RegExp[];
  query: string;
  source: string;
}

const KNOWN_FIELD_MAPPINGS: KnownMapping[] = [
  {
    patterns: [/\b(full\s*)?name\b/i, /\byour\s*name\b/i, /\bapplicant\s*name\b/i, /\bemployee\s*name\b/i],
    query: 'my full name',
    source: 'user-profile',
  },
  {
    patterns: [/\bemail\b/i, /\be-?mail\s*address\b/i],
    query: 'my email address',
    source: 'user-profile',
  },
  {
    patterns: [/\bphone\b/i, /\bphone\s*number\b/i, /\btelephone\b/i, /\bmobile\b/i, /\bcell\b/i],
    query: 'my phone number',
    source: 'user-profile',
  },
  {
    patterns: [/\baddress\b/i, /\bstreet\b/i, /\bstreet\s*address\b/i, /\bhome\s*address\b/i, /\bmailing\s*address\b/i],
    query: 'my home address',
    source: 'user-profile',
  },
  {
    patterns: [/\bcity\b/i],
    query: 'my city',
    source: 'user-profile',
  },
  {
    patterns: [/\bstate\b/i, /\bprovince\b/i],
    query: 'my state',
    source: 'user-profile',
  },
  {
    patterns: [/\bzip\b/i, /\bzip\s*code\b/i, /\bpostal\s*code\b/i],
    query: 'my zip code',
    source: 'user-profile',
  },
  {
    patterns: [/\bcompany\b/i, /\bemployer\b/i, /\borganization\b/i, /\bwork\s*place\b/i],
    query: 'my employer or company name',
    source: 'email-signature',
  },
  {
    patterns: [/\bjob\s*title\b/i, /\bposition\b/i, /\btitle\b/i],
    query: 'my job title',
    source: 'email-signature',
  },
  {
    patterns: [/\bdate\b/i, /\btoday.?s?\s*date\b/i, /\bdate\s*of\s*signature\b/i, /\bcurrent\s*date\b/i],
    query: '__current_date__',
    source: 'system',
  },
  {
    patterns: [/\bdepartment\b/i, /\bdept\b/i],
    query: 'my department at work',
    source: 'email-signature',
  },
];

// ─── User Data Resolver ─────────────────────────────────────────────────────

export class UserDataResolver {
  private semanticSearch: SemanticSearch;
  private llm: LLMProvider;
  private model: string;

  constructor(config: {
    semanticSearch: SemanticSearch;
    llm: LLMProvider;
    model: string;
  }) {
    this.semanticSearch = config.semanticSearch;
    this.llm = config.llm;
    this.model = config.model;
  }

  /**
   * Resolve multiple fields in batch.
   */
  async resolveFields(fields: PDFFormField[], formTitle?: string): Promise<ResolvedField[]> {
    const results: ResolvedField[] = [];
    for (const field of fields) {
      results.push(await this.resolveField(field, formTitle));
    }
    return results;
  }

  /**
   * Resolve a single field to user data.
   */
  async resolveField(field: PDFFormField, formTitle?: string): Promise<ResolvedField> {
    const fieldText = `${field.name} ${field.label}`;

    // Check if field is sensitive — NEVER auto-fill
    if (this.isSensitiveField(fieldText)) {
      return {
        field,
        value: null,
        confidence: 'high',
        source: 'safety-policy',
        requiresManualEntry: true,
      };
    }

    // Try known pattern matching first (high confidence)
    const knownResult = await this.tryKnownMapping(field);
    if (knownResult) return knownResult;

    // Fall back to LLM mapping (low confidence)
    return this.tryLLMMapping(field, formTitle);
  }

  /**
   * Check if a field requests sensitive data that must never be auto-filled.
   */
  private isSensitiveField(fieldText: string): boolean {
    return SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(fieldText));
  }

  /**
   * Try to match field against known patterns.
   */
  private async tryKnownMapping(field: PDFFormField): Promise<ResolvedField | null> {
    const fieldText = `${field.name} ${field.label}`;

    for (const mapping of KNOWN_FIELD_MAPPINGS) {
      const matches = mapping.patterns.some(p => p.test(fieldText));
      if (!matches) continue;

      // Special case: current date
      if (mapping.query === '__current_date__') {
        return {
          field,
          value: new Date().toISOString().split('T')[0]!,
          confidence: 'high',
          source: 'system',
        };
      }

      // Query knowledge graph
      const results = await this.semanticSearch.search(mapping.query, { limit: 1 });
      if (results.length > 0 && results[0]) {
        return {
          field,
          value: results[0].chunk.content.slice(0, field.maxLength ?? 500),
          confidence: 'high',
          source: mapping.source,
        };
      }

      // Knowledge graph had no match — mark as medium confidence null
      return {
        field,
        value: null,
        confidence: 'medium',
        source: mapping.source,
      };
    }

    return null;
  }

  /**
   * Use LLM to infer what data a field is asking for, then query knowledge graph.
   */
  private async tryLLMMapping(field: PDFFormField, formTitle?: string): Promise<ResolvedField> {
    try {
      const response = await this.llm.chat({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a form field classifier. Given a form field label, respond with exactly one word describing what personal data the field is asking for. Options: name, email, phone, address, employer, date, reference_number, description, amount, or unknown.',
          },
          {
            role: 'user',
            content: `Form field label: "${field.label}"${formTitle ? ` on a form titled "${formTitle}"` : ''}. What data is this field asking for?`,
          },
        ],
        temperature: 0,
        maxTokens: 10,
      });

      const intent = response.message.content.trim().toLowerCase();

      if (intent === 'unknown') {
        return {
          field,
          value: null,
          confidence: 'low',
          source: 'llm-classification',
        };
      }

      // Query knowledge graph with the inferred intent
      const results = await this.semanticSearch.search(`my ${intent}`, { limit: 1 });
      if (results.length > 0 && results[0]) {
        return {
          field,
          value: results[0].chunk.content.slice(0, field.maxLength ?? 500),
          confidence: 'low',
          source: 'llm-classification',
        };
      }

      return {
        field,
        value: null,
        confidence: 'low',
        source: 'llm-classification',
      };
    } catch {
      return {
        field,
        value: null,
        confidence: 'low',
        source: 'llm-classification',
      };
    }
  }
}
