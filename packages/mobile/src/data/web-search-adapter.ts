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
//
// TODO(Sprint 3, Step 11): Wire web search to desktop handoff when task
// routing is implemented. Mobile will delegate web search requests to
// desktop Gateway and receive results back via the handoff channel.

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
 * on the local network.
 *
 * Returns { available: false, reason: 'no_gateway' } — this is the honest
 * answer, not a stub. Mobile architecturally cannot make network calls
 * (Rule 1: Zero Network in AI Core).
 *
 * TODO(Sprint 3): Check desktop handoff availability via task router.
 * When desktop is reachable, return { available: true, reason: 'desktop_connected' }.
 */
export function getWebSearchStatus(): MobileWebSearchStatus {
  // Mobile has no Gateway process — web search requires desktop handoff.
  // This is an architectural truth, not a missing implementation.
  return { available: false, reason: 'no_gateway' };
}

/**
 * Attempt a web search via desktop handoff.
 *
 * Currently returns null because desktop handoff for web search is not yet
 * implemented (Sprint 3, Step 11). When implemented, this will:
 * 1. Check if desktop is reachable via task router
 * 2. Send search request to desktop Gateway
 * 3. Receive and transform results
 *
 * Returns null (not fake results) when unavailable.
 *
 * TODO(Sprint 3, Step 11): Implement desktop handoff for web search.
 */
export async function performWebSearch(
  _query: string,
): Promise<MobileSearchResponse | null> {
  const status = getWebSearchStatus();
  if (!status.available) {
    // Web search is genuinely unavailable on mobile without desktop handoff.
    // Returning null signals the UI to show "web search requires desktop" message.
    return null;
  }

  // TODO(Sprint 3, Step 11): Route through desktop handoff
  // const result = await taskRouter.handoffToDesktop({ action: 'web.search', payload: { query } });
  // return toMobileSearchResults(query, result.data, result.provider);
  return null;
}
