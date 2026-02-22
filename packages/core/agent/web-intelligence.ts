// Web Intelligence — Knowledge-graph-first routing for web search.
// Decides whether to search locally, on the web, or both.
// The AI Core decides WHEN to search. The Gateway executes the search.

import type { LLMProvider, ChatMessage } from '../llm/types.js';
import type { KnowledgeGraph, SearchResult } from '../knowledge/index.js';
import type { IPCClient } from './ipc-client.js';
import type { WebSearchPayload, WebFetchPayload, ActionResponse } from '../types/ipc.js';

export type QueryClassification = 'local_only' | 'web_required' | 'local_then_web';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  age?: string;
}

export interface RoutingResult {
  source: 'local' | 'web' | 'combined';
  localResults: SearchResult[];
  webResults: WebSearchResult[];
  query: string;
}

export interface WebIntelligenceConfig {
  /** Minimum relevance score for local results to be considered sufficient (0-1) */
  localRelevanceThreshold?: number;
  /** Minimum number of local results to skip web search */
  minLocalResults?: number;
}

// Patterns that strongly indicate web search is needed
const WEB_REQUIRED_PATTERNS = [
  /\b(weather|forecast)\b/i,
  /\b(stock|price|market)\b.*\b(today|now|current|latest)\b/i,
  /\b(latest|current|recent|breaking)\s+(news|updates?|events?)\b/i,
  /\bwho won\b/i,
  /\bwhat happened\b/i,
  /\bscore\b.*\b(game|match)\b/i,
  /\b(today|tonight|this week|right now)\b/i,
  /\bhow (much|many)\s+(does|is|are)\b/i,
  /\b(define|what is|who is|when was|where is)\b/i,
];

// Patterns that indicate local data queries
const LOCAL_ONLY_PATTERNS = [
  /\bmy\s+(email|calendar|schedule|files?|documents?|inbox|meeting)\b/i,
  /\b(find|search|show)\s+(my|the)\b/i,
  /\b(sent|received|from|to)\s+\w+@\w+/i,
  /\b(sarah|john|mike|alice)\s+(sent|said|wrote|emailed)\b/i,
  /\bon my calendar\b/i,
  /\bwhat('s|s| is)\s+on\s+(my|the)\s+(schedule|calendar)\b/i,
  /\bremind(er)?s?\b.*\b(list|show|pending)\b/i,
];

/**
 * Classify a user query into routing categories.
 * Uses pattern matching as a fast first pass. For ambiguous queries,
 * falls back to LLM classification.
 */
export function classifyQueryFast(query: string): QueryClassification | null {
  const q = query.toLowerCase();

  // Check local-only patterns first
  for (const pattern of LOCAL_ONLY_PATTERNS) {
    if (pattern.test(q)) return 'local_only';
  }

  // Check web-required patterns
  for (const pattern of WEB_REQUIRED_PATTERNS) {
    if (pattern.test(q)) return 'web_required';
  }

  // Contains a URL — likely want to fetch it
  if (/https?:\/\/\S+/.test(q)) return 'web_required';

  return null; // Ambiguous — needs LLM classification or local_then_web fallback
}

/**
 * Classify a query using the LLM for ambiguous cases.
 */
export async function classifyQueryWithLLM(
  query: string,
  llm: LLMProvider,
): Promise<QueryClassification> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `Classify the user's query into one of three categories:
- "local_only": The query is about the user's own data (emails, calendar, files, personal documents)
- "web_required": The query requires external/current information (weather, news, prices, general knowledge, how-to)
- "local_then_web": Could be answered locally but might need web data if local results are insufficient

Respond with ONLY one of: local_only, web_required, local_then_web`,
    },
    { role: 'user', content: query },
  ];

  try {
    const response = await llm.chat({ model: 'default', messages });
    const text = response.message.content.trim().toLowerCase();
    if (text.includes('local_only')) return 'local_only';
    if (text.includes('web_required')) return 'web_required';
    if (text.includes('local_then_web')) return 'local_then_web';
    // Default to local_then_web for ambiguous LLM responses
    return 'local_then_web';
  } catch {
    // On LLM error, default to local_then_web (safest)
    return 'local_then_web';
  }
}

/**
 * Full query classification: fast pattern matching first, LLM fallback.
 */
export async function classifyQuery(
  query: string,
  llm: LLMProvider,
): Promise<QueryClassification> {
  const fast = classifyQueryFast(query);
  if (fast) return fast;
  return classifyQueryWithLLM(query, llm);
}

/**
 * Search with knowledge-graph-first routing.
 * 1. Classify the query
 * 2. If local_only or local_then_web: search knowledge graph
 * 3. If local results sufficient: return them (no web search)
 * 4. If web_required or local insufficient: fire web.search via IPC
 * 5. Return combined results with source attribution
 */
export async function searchWithRouting(
  query: string,
  llm: LLMProvider,
  knowledgeGraph: KnowledgeGraph,
  ipcClient: IPCClient,
  config?: WebIntelligenceConfig,
): Promise<RoutingResult> {
  const threshold = config?.localRelevanceThreshold ?? 0.7;
  const minLocalResults = config?.minLocalResults ?? 2;

  const classification = await classifyQuery(query, llm);
  let localResults: SearchResult[] = [];
  let webResults: WebSearchResult[] = [];

  // Step 1: Try local search if applicable
  if (classification === 'local_only' || classification === 'local_then_web') {
    try {
      localResults = await knowledgeGraph.search(query);
    } catch {
      localResults = [];
    }

    // If local results are sufficient, return them
    const sufficientLocal = localResults.length >= minLocalResults &&
      localResults.some(r => (r.score ?? 0) >= threshold);

    if (classification === 'local_only' || sufficientLocal) {
      return { source: 'local', localResults, webResults: [], query };
    }
  }

  // Step 2: Web search
  try {
    const payload: WebSearchPayload = { query, count: 5 };
    const response = await ipcClient.sendAction('web.search', payload);

    if (response.status === 'success' && response.data) {
      const data = response.data as { results: WebSearchResult[] };
      webResults = data.results ?? [];
    }
  } catch {
    // Web search failed — return what we have
  }

  // Determine source attribution
  const source: RoutingResult['source'] = localResults.length > 0 && webResults.length > 0
    ? 'combined'
    : webResults.length > 0 ? 'web' : 'local';

  return { source, localResults, webResults, query };
}

/**
 * Fetch a URL via the Gateway.
 */
export async function fetchUrl(
  url: string,
  ipcClient: IPCClient,
  maxContentLength?: number,
): Promise<{ success: boolean; data?: { url: string; title: string; content: string; bytesFetched: number; contentType: string }; error?: string }> {
  try {
    const payload: WebFetchPayload = { url, maxContentLength: maxContentLength ?? 50000 };
    const response = await ipcClient.sendAction('web.fetch', payload);

    if (response.status === 'success' && response.data) {
      return { success: true, data: response.data as { url: string; title: string; content: string; bytesFetched: number; contentType: string } };
    }
    return { success: false, error: response.error?.message ?? 'Unknown error' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Detect URLs in user message text.
 */
export function detectUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  return text.match(urlRegex) ?? [];
}
