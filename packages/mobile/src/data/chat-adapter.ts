// Chat Adapter — Routes user chat messages through the InferenceRouter
// to the appropriate LLM provider (mobile or desktop).
//
// Transforms chat UI messages into Core's ChatRequest format and
// streams responses back to the UI.
//
// CRITICAL: No network calls. All inference is local via InferenceRouter.

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  title: string;
}

export interface ChatResponse {
  message: ChatMessage;
  tokensUsed: number;
  durationMs: number;
  model: string;
}

/**
 * Format chat messages for the InferenceRouter's ChatRequest format.
 * Filters system messages to the front, maintains conversation order.
 */
export function formatChatMessages(
  messages: ChatMessage[],
): Array<{ role: string; content: string }> {
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  return [
    ...systemMessages.map(m => ({ role: m.role, content: m.content })),
    ...conversationMessages.map(m => ({ role: m.role, content: m.content })),
  ];
}

/**
 * Generate a session title from the first user message.
 * Uses the first 50 characters or first sentence, whichever is shorter.
 */
export function generateSessionTitle(firstMessage: string): string {
  const firstSentence = firstMessage.split(/[.!?]/)[0] ?? firstMessage;
  const title = firstSentence.trim();
  if (title.length <= 50) return title;
  return title.slice(0, 47) + '...';
}

/**
 * Create a new chat session with an optional system prompt.
 */
export function createChatSession(
  id: string,
  systemPrompt?: string,
): ChatSession {
  const messages: ChatMessage[] = [];
  if (systemPrompt) {
    messages.push({
      id: `${id}-system`,
      role: 'system',
      content: systemPrompt,
      timestamp: new Date().toISOString(),
    });
  }
  return {
    id,
    messages,
    createdAt: new Date().toISOString(),
    title: 'New Chat',
  };
}

/**
 * Build a ChatMessage from an assistant response.
 */
export function buildAssistantMessage(
  sessionId: string,
  content: string,
  messageIndex: number,
): ChatMessage {
  return {
    id: `${sessionId}-assistant-${messageIndex}`,
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a ChatMessage from a user input.
 */
export function buildUserMessage(
  sessionId: string,
  content: string,
  messageIndex: number,
): ChatMessage {
  return {
    id: `${sessionId}-user-${messageIndex}`,
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Estimate tokens from text (rough heuristic: ~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
