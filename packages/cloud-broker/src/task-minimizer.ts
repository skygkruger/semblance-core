/**
 * Pure task minimization for Broker dispatch.
 * No gateway imports — duplicated minimization concepts from PromptMinimizer.
 */

export interface MinimizationResult {
  readonly messages: Array<{ role: string; content: string }>;
  readonly tokensBefore: number;
  readonly tokensAfter: number;
}

const SYSTEM_PROMPT_MARKERS = [
  /You are Semblance[^.]*\./i,
  /Your Intelligence\. Your Device\. Your Rules\./i,
  /INJECTION_CANARY_[A-Za-z0-9]+/,
  /\[SEMBLANCE_INJECTION_CANARY\]/,
  /autonomy tier: (?:guardian|partner|alter_ego)/i,
  /You are a sovereign personal AI/i,
  /connected services:/i,
  /indexed documents:/i,
];

const KNOWLEDGE_CONTEXT_MARKERS = [
  /^(?:Relevant|Related) (?:knowledge|context|documents?):\s*$/im,
  /^Knowledge graph (?:context|results?):\s*$/im,
  /^Document context:\s*$/im,
  /\[DATA_BOUNDARY:[^\]]+\]/g,
];

const PII_PATTERNS = [
  /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/g,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  /\b(?:\+?1?[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
];

const CATEGORY_KEYWORDS: Record<string, RegExp[]> = {
  financial: [/\b(?:bank|credit\s*card|invoice|payment|salary|tax)\b/i],
  health: [/\b(?:diagnosis|medication|doctor|patient|health\s*record)\b/i],
  legal: [/\b(?:attorney|lawyer|lawsuit|contract|court)\b/i],
  personal_id: [/\b(?:ssn|social\s*security|passport|driver'?s?\s*licen[sc]e)\b/i],
};

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  return Math.ceil(messages.reduce((sum, message) => sum + message.content.length, 0) / 4);
}

function stripSystemPromptBoilerplate(content: string): string {
  let result = content;
  for (const marker of SYSTEM_PROMPT_MARKERS) {
    result = result.replace(marker, '');
  }
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

function stripKnowledgeContext(content: string): string {
  let result = content;
  for (const marker of KNOWLEDGE_CONTEXT_MARKERS) {
    result = result.replace(marker, '');
  }
  return result.replace(/\[DATA_BOUNDARY_START:[^\]]*\][\s\S]*?\[DATA_BOUNDARY_END\]/g, '[context redacted]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripExcludedContent(content: string, excludedCategories: readonly string[]): string {
  if (excludedCategories.length === 0) return content;

  const sentences = content.split(/(?<=[.!?])\s+/);
  return sentences.map((sentence) => {
    for (const category of excludedCategories) {
      const patterns = CATEGORY_KEYWORDS[category];
      if (!patterns) continue;
      if (patterns.some((pattern) => pattern.test(sentence))) {
        return `[${category} data redacted]`;
      }
    }
    return sentence;
  }).join(' ');
}

function stripPII(content: string): string {
  let result = content;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

function compressHistory(
  messages: Array<{ role: string; content: string }>,
  maxTurns: number,
): Array<{ role: string; content: string }> {
  const systemMessages = messages.filter((message) => message.role === 'system');
  const nonSystem = messages.filter((message) => message.role !== 'system');
  if (nonSystem.length <= maxTurns) {
    return messages;
  }
  return [...systemMessages, ...nonSystem.slice(-maxTurns)];
}

export function minimizeTask(
  messages: readonly Array<{ role: string; content: string }>,
  excludedCategories: readonly string[],
  maxHistoryTurns = 4,
): MinimizationResult {
  const tokensBefore = estimateTokens([...messages]);
  const minimized: Array<{ role: string; content: string }> = [];

  for (const message of messages) {
    let content = message.content;

    if (message.role === 'system') {
      content = stripSystemPromptBoilerplate(content);
      if (content.trim().length < 20) {
        content = 'You are a helpful AI assistant. Answer the user\'s question accurately and concisely.';
      }
    }

    content = stripKnowledgeContext(content);
    content = stripExcludedContent(content, excludedCategories);

    const isLatestUser = message === messages[messages.length - 1] && message.role === 'user';
    if (!isLatestUser && message.role !== 'system') {
      content = stripPII(content);
    }

    minimized.push({ role: message.role, content });
  }

  const compressed = compressHistory(minimized, maxHistoryTurns);
  return {
    messages: compressed,
    tokensBefore,
    tokensAfter: estimateTokens(compressed),
  };
}
