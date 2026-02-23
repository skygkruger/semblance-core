/**
 * Step 21 — UserDataResolver tests.
 * Tests known field mapping, LLM fallback, and SSN/password refusal.
 */

import { describe, it, expect, vi } from 'vitest';
import { UserDataResolver } from '@semblance/core/forms/user-data-resolver';
import type { SemanticSearch } from '@semblance/core/knowledge/search';
import type { LLMProvider } from '@semblance/core/llm/types';
import type { PDFFormField } from '@semblance/core/forms/types';

function makeField(overrides?: Partial<PDFFormField>): PDFFormField {
  return {
    name: 'testField',
    type: 'text',
    label: 'Test Field',
    page: 0,
    required: false,
    ...overrides,
  };
}

function makeResolver(searchResults: Array<{ content: string }> = []): UserDataResolver {
  const semanticSearch = {
    search: vi.fn(async () =>
      searchResults.map((r, i) => ({
        chunk: { id: `c_${i}`, documentId: `d_${i}`, content: r.content, chunkIndex: 0, metadata: {} },
        document: { id: `d_${i}`, source: 'contact', title: '', content: r.content, contentHash: '', mimeType: '', createdAt: '', updatedAt: '', indexedAt: '', metadata: {} },
        score: 0.9,
      }))
    ),
  } as unknown as SemanticSearch;

  const llm: LLMProvider = {
    isAvailable: async () => true,
    generate: async () => ({ text: '', model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    chat: async () => ({
      message: { role: 'assistant' as const, content: 'name' },
      model: 'test',
      tokensUsed: { prompt: 10, completion: 5, total: 15 },
      durationMs: 50,
    }),
    embed: async () => ({ embeddings: [[]], model: 'test', durationMs: 0 }),
    listModels: async () => [],
    getModel: async () => null,
  };

  return new UserDataResolver({ semanticSearch, llm, model: 'test-model' });
}

describe('UserDataResolver (Step 21)', () => {
  it('resolves "Name" field to user profile name (high confidence)', async () => {
    const resolver = makeResolver([{ content: 'John Smith' }]);
    const field = makeField({ name: 'fullName', label: 'Full Name' });
    const result = await resolver.resolveField(field);

    expect(result.confidence).toBe('high');
    expect(result.value).toBe('John Smith');
    expect(result.source).toBe('user-profile');
  });

  it('resolves "Email" field to user profile email (high confidence)', async () => {
    const resolver = makeResolver([{ content: 'john@example.com' }]);
    const field = makeField({ name: 'email', label: 'Email Address' });
    const result = await resolver.resolveField(field);

    expect(result.confidence).toBe('high');
    expect(result.value).toBe('john@example.com');
  });

  it('resolves "Employer" via knowledge graph search (medium confidence on null)', async () => {
    // No search results — returns null with medium confidence
    const resolver = makeResolver([]);
    const field = makeField({ name: 'company', label: 'Company' });
    const result = await resolver.resolveField(field);

    expect(result.value).toBeNull();
    expect(result.confidence).toBe('medium');
    expect(result.source).toBe('email-signature');
  });

  it('resolves ambiguous field via LLM mapping (low confidence)', async () => {
    const resolver = makeResolver([{ content: 'Some data' }]);
    const field = makeField({ name: 'ref_code', label: 'Reference Code' });
    const result = await resolver.resolveField(field);

    // No known pattern match → LLM fallback
    expect(result.confidence).toBe('low');
    expect(result.source).toBe('llm-classification');
  });

  it('REFUSES to resolve SSN field — returns requires_manual_entry', async () => {
    const resolver = makeResolver([{ content: '123-45-6789' }]);
    const field = makeField({ name: 'ssn', label: 'Social Security Number' });
    const result = await resolver.resolveField(field);

    expect(result.value).toBeNull();
    expect(result.requiresManualEntry).toBe(true);
    expect(result.source).toBe('safety-policy');
  });

  it('REFUSES to resolve password field — returns requires_manual_entry', async () => {
    const resolver = makeResolver([{ content: 'secret123' }]);
    const field = makeField({ name: 'password', label: 'Password' });
    const result = await resolver.resolveField(field);

    expect(result.value).toBeNull();
    expect(result.requiresManualEntry).toBe(true);
    expect(result.source).toBe('safety-policy');
  });

  it('returns null for completely unknown field with no LLM match', async () => {
    const llm: LLMProvider = {
      isAvailable: async () => true,
      generate: async () => ({ text: '', model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
      chat: async () => ({
        message: { role: 'assistant' as const, content: 'unknown' },
        model: 'test',
        tokensUsed: { prompt: 10, completion: 5, total: 15 },
        durationMs: 50,
      }),
      embed: async () => ({ embeddings: [[]], model: 'test', durationMs: 0 }),
      listModels: async () => [],
      getModel: async () => null,
    };

    const semanticSearch = {
      search: vi.fn(async () => []),
    } as unknown as SemanticSearch;

    const resolver = new UserDataResolver({ semanticSearch, llm, model: 'test' });
    const field = makeField({ name: 'xyzzy', label: 'Xyzzy' });
    const result = await resolver.resolveField(field);

    expect(result.value).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('resolves multiple fields in batch', async () => {
    const resolver = makeResolver([{ content: 'John Smith' }]);
    const fields = [
      makeField({ name: 'name', label: 'Name' }),
      makeField({ name: 'email', label: 'Email' }),
      makeField({ name: 'ssn', label: 'SSN' }),
    ];

    const results = await resolver.resolveFields(fields);
    expect(results).toHaveLength(3);
    expect(results[0]!.confidence).toBe('high');
    expect(results[2]!.requiresManualEntry).toBe(true);
  });
});
