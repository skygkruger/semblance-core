// Web Search Adapter — Mobile adapter for web search and web fetch features.
// Transforms Core's web search results into mobile chat display format.
// Network Monitor shows all searches (they go through Gateway).
//
// MOBILE LIMITATION: Web search requires the Gateway (Rule 1 — Zero Network
// in AI Core). Mobile does not run a Gateway process. Web search on mobile
// requires desktop handoff: the mobile task router sends the search request
// to the desktop's Gateway via the device handoff protocol.
//
// When no desktop is available, web search is genuinely unavailable — not
// broken, but architecturally impossible without violating the zero-network
// constraint. The UI should indicate this clearly.

import type { TaskDelegationEngine } from '@semblance/core/routing/task-delegation.js';
import { getRuntimeState } from '../runtime/mobile-runtime.js';

export interface MobileSearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface MobileSearchResponse {
  query: string;
  results: MobileSearchResult[];
  provider: string;
  timestamp: string;
}

export interface MobileFetchSummary {
  url: string;
  title: string;
  summary: string;
  wordCount: number;
  fetchedAt: string;
}

/**
 * Convert Core's web search results to mobile format.
 */
export function toMobileSearchResults(
  query: string,
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>,
  provider: string
): MobileSearchResponse {
  return {
    query,
    results: results.map((r, i) => ({
      id: `search-${i}`,
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: extractDomain(r.url),
    })),
    provider,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convert Core's web fetch result to mobile summary format.
 */
export function toMobileFetchSummary(
  url: string,
  result: {
    title?: string;
    summary: string;
    wordCount?: number;
  }
): MobileFetchSummary {
  return {
    url,
    title: result.title ?? extractDomain(url),
    summary: result.summary,
    wordCount: result.wordCount ?? estimateWordCount(result.summary),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Format search results as a chat message for mobile chat display.
 */
export function formatSearchAsChat(response: MobileSearchResponse): string {
  if (response.results.length === 0) {
    return `No results found for "${response.query}".`;
  }

  const lines = response.results.slice(0, 5).map((r, i) =>
    `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.source}`
  );

  return `Search results for "${response.query}":\n\n${lines.join('\n\n')}`;
}

function extractDomain(url: string): string {
  try {
    const match = url.match(/^https?:\/\/([^/]+)/);
    return match?.[1] ?? url;
  } catch {
    return url;
  }
}

function estimateWordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// ─── Module-level delegation engine ──────────────────────────────────────────

let delegationEngine: TaskDelegationEngine | null = null;

/**
 * Register the TaskDelegationEngine for web search routing.
 * Called by the mobile runtime after initialization.
 */
export function setWebSearchDelegationEngine(engine: TaskDelegationEngine): void {
  delegationEngine = engine;
}

/**
 * Get the currently registered delegation engine.
 */
function getDelegationEngine(): TaskDelegationEngine | null {
  // Prefer the explicitly registered engine
  if (delegationEngine) return delegationEngine;

  // Fall back to checking the mobile runtime state
  const state = getRuntimeState();
  if (state.core) {
    const coreAny = state.core as unknown as Record<string, unknown>;
    const routing = coreAny.routing as { taskDelegation?: TaskDelegationEngine } | undefined;
    if (routing?.taskDelegation) {
      return routing.taskDelegation;
    }
  }

  return null;
}

// ─── Mobile Web Search ────────────────────────────────────────────────────────

export interface MobileWebSearchStatus {
  available: boolean;
  reason: 'desktop_connected' | 'no_desktop' | 'no_gateway';
}

/**
 * Check whether web search is available on mobile.
 *
 * Web search requires the Gateway, which only runs on desktop. Mobile can
 * access web search via desktop handoff when a desktop device is discovered
 * on the local network and a TaskDelegationEngine is available.
 */
export function getWebSearchStatus(): MobileWebSearchStatus {
  const engine = getDelegationEngine();
  if (engine) {
    const routing = engine.decideRouting('web_search.classify');
    if (routing.target === 'remote' && !routing.degraded) {
      return { available: true, reason: 'desktop_connected' };
    }
  }

  // No desktop connection — web search requires Gateway which is desktop-only
  return { available: false, reason: 'no_desktop' };
}

/**
 * Perform a web search via desktop handoff.
 *
 * Routes the search request to the desktop Gateway using the
 * TaskDelegationEngine. Returns null if no desktop is available —
 * web search is architecturally impossible on mobile without the Gateway.
 */
export async function performWebSearch(
  query: string,
): Promise<MobileSearchResponse | null> {
  const status = getWebSearchStatus();
  if (!status.available) {
    return null;
  }

  const engine = getDelegationEngine();
  if (!engine) return null;

  try {
    const result = await engine.executeTask(
      'web_search.classify',
      { query },
      // Local executor — web search cannot run locally on mobile, return null
      async () => null,
    );

    if (result.status === 'success' && result.result) {
      const data = result.result as {
        results: Array<{ title: string; url: string; snippet: string }>;
        provider: string;
      };
      return toMobileSearchResults(query, data.results, data.provider);
    }
  } catch {
    // Desktop handoff failed — web search unavailable
  }

  return null;
}
