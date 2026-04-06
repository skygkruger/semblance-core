// Complexity Classifier — Determines whether a user request is simple, compound, or complex.
//
// simple:   Single tool, single domain → v1 loop, no subagents
// compound: Multiple tools, single domain → v1 loop with chained tool calls
// complex:  Multiple domains, parallel-capable → subagent decomposition
//
// Uses rule-based heuristics first. If a fast model (SmolLM2) is available via
// routedChat, it refines the classification for ambiguous cases.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { LLMProvider, ToolDefinition } from '../llm/types.js';
import type { AutonomyDomain } from './types.js';
import type { ComplexityAssessment, RequestComplexity } from './orchestrator-v2-types.js';

// ─── Tool → Domain Mapping ───────────────────────────────────────────────────

const TOOL_DOMAIN_MAP: Record<string, AutonomyDomain> = {
  // Email
  fetch_inbox: 'email', search_emails: 'email', send_email: 'email',
  draft_email: 'email', archive_email: 'email', move_email: 'email',
  mark_email_read: 'email', categorize_email: 'email',
  // Calendar
  fetch_calendar: 'calendar', create_calendar_event: 'calendar',
  update_calendar_event: 'calendar', delete_calendar_event: 'calendar',
  detect_calendar_conflicts: 'calendar',
  // Files
  search_files: 'files', list_indexed_documents: 'files',
  read_document: 'files', search_cloud_files: 'cloud-storage',
  list_cloud_files: 'cloud-storage',
  // Web
  search_web: 'web', deep_search_web: 'web', fetch_url: 'web',
  // Contacts
  search_contacts: 'contacts', add_contact: 'contacts',
  // Finances
  fetch_transactions: 'finances', categorize_transaction: 'finances',
  // Health
  log_health_entry: 'health', get_health_summary: 'health',
  // Reminders
  create_reminder: 'reminders', list_reminders: 'reminders',
  update_reminder: 'reminders', delete_reminder: 'reminders',
  // Messaging
  draft_message: 'messaging', send_message_channel: 'messaging',
  // Location
  get_weather: 'location',
  // System
  analyze_image: 'system',
};

// ─── Intent Keywords → Tool Mapping ──────────────────────────────────────────

interface IntentPattern {
  keywords: RegExp;
  tools: string[];
  domain: AutonomyDomain;
}

const INTENT_PATTERNS: IntentPattern[] = [
  { keywords: /\b(?:email|inbox|mail|send|draft|reply|forward)\b/i, tools: ['fetch_inbox', 'search_emails', 'send_email', 'draft_email'], domain: 'email' },
  { keywords: /\b(?:calendar|schedule|meeting|event|appointment|book)\b/i, tools: ['fetch_calendar', 'create_calendar_event'], domain: 'calendar' },
  { keywords: /\b(?:file|document|note|pdf|search.*(?:file|doc))\b/i, tools: ['search_files', 'read_document'], domain: 'files' },
  { keywords: /\b(?:search|google|look\s*up|find\s*online|web|research)\b/i, tools: ['search_web', 'fetch_url'], domain: 'web' },
  { keywords: /\b(?:contact|phone|person|people)\b/i, tools: ['search_contacts'], domain: 'contacts' },
  { keywords: /\b(?:money|transaction|expense|budget|finance|bank|spend)\b/i, tools: ['fetch_transactions'], domain: 'finances' },
  { keywords: /\b(?:health|weight|sleep|exercise|steps|workout|heart\s*rate)\b/i, tools: ['log_health_entry', 'get_health_summary'], domain: 'health' },
  { keywords: /\b(?:remind|reminder|alarm|todo|task)\b/i, tools: ['create_reminder', 'list_reminders'], domain: 'reminders' },
  { keywords: /\b(?:weather|temperature|forecast|rain)\b/i, tools: ['get_weather'], domain: 'location' },
  { keywords: /\b(?:cloud|drive|dropbox|google\s*drive)\b/i, tools: ['search_cloud_files', 'list_cloud_files'], domain: 'cloud-storage' },
];

// ─── Multi-Domain Composite Patterns ─────────────────────────────────────────

const COMPLEX_PATTERNS: RegExp[] = [
  // "Prepare for" suggests multi-domain synthesis
  /\b(?:prepare|prep)\s+(?:for|me\s+for)\b/i,
  // "Brief me" / "morning brief" / "daily summary"
  /\b(?:brief\s+me|morning\s+brief|daily\s+(?:summary|digest|briefing))\b/i,
  // "Plan my" / "organize my"
  /\b(?:plan|organize)\s+my\b/i,
  // Multiple explicit domains joined by "and"
  /\b(?:email|inbox)\b.*\b(?:calendar|schedule)\b/i,
  /\b(?:email|inbox)\b.*\b(?:file|document)\b/i,
  /\b(?:calendar|schedule)\b.*\b(?:finance|budget)\b/i,
  // Research + action combinations
  /\b(?:research|find\s+out)\b.*\b(?:then|and\s+(?:send|draft|create|schedule))\b/i,
];

// ─── Classifier ──────────────────────────────────────────────────────────────

export class ComplexityClassifier {
  private llm: LLMProvider | null;
  private allTools: ToolDefinition[];

  constructor(llm: LLMProvider | null, allTools: ToolDefinition[]) {
    this.llm = llm;
    this.allTools = allTools;
  }

  /**
   * Classify a user request's complexity using rule-based heuristics.
   * Fast and deterministic — no LLM call.
   */
  classify(message: string): ComplexityAssessment {
    const matchedDomains = new Set<AutonomyDomain>();
    const matchedTools = new Set<string>();

    // Match against intent patterns
    for (const pattern of INTENT_PATTERNS) {
      if (pattern.keywords.test(message)) {
        matchedDomains.add(pattern.domain);
        for (const tool of pattern.tools) {
          matchedTools.add(tool);
        }
      }
    }

    // Check for explicit complex patterns
    const hasComplexPattern = COMPLEX_PATTERNS.some(p => p.test(message));

    // Determine complexity
    const domainCount = matchedDomains.size;
    const toolCount = matchedTools.size;

    let complexity: RequestComplexity;
    let reasoning: string;
    let parallelCapable = false;

    if (hasComplexPattern && domainCount >= 2) {
      complexity = 'complex';
      reasoning = `Multi-domain request spanning ${Array.from(matchedDomains).join(', ')} with composite pattern detected`;
      parallelCapable = true;
    } else if (domainCount >= 3) {
      complexity = 'complex';
      reasoning = `Request touches ${domainCount} domains: ${Array.from(matchedDomains).join(', ')}`;
      parallelCapable = true;
    } else if (domainCount === 2 && toolCount >= 3) {
      complexity = 'complex';
      reasoning = `Two-domain request with ${toolCount} tools — decomposition beneficial`;
      parallelCapable = true;
    } else if (toolCount >= 2 && domainCount <= 1) {
      complexity = 'compound';
      reasoning = `Multiple tools (${Array.from(matchedTools).join(', ')}) within single domain`;
    } else if (toolCount <= 1) {
      complexity = 'simple';
      reasoning = toolCount === 0
        ? 'No tool intent detected — conversational or single-tool'
        : `Single tool: ${Array.from(matchedTools)[0]}`;
    } else {
      complexity = 'compound';
      reasoning = `${toolCount} tools across ${domainCount} domain(s) — chained execution`;
    }

    const result = {
      complexity,
      domains: Array.from(matchedDomains),
      estimatedTools: Array.from(matchedTools),
      reasoning,
      parallelCapable,
    };

    console.error(`[ComplexityClassifier] ${result.complexity} | tools: [${result.estimatedTools.join(', ')}] | domains: [${result.domains.join(', ')}] | ${result.reasoning}`);
    return result;
  }

  /**
   * Refine classification using the fast model for ambiguous cases.
   * Falls back to rule-based if LLM is unavailable.
   */
  async classifyWithLLM(message: string): Promise<ComplexityAssessment> {
    const ruleBasedResult = this.classify(message);

    // Only use LLM for borderline cases where rule-based might miss nuance
    if (
      ruleBasedResult.complexity !== 'compound' ||
      !this.llm ||
      !this.llm.routedChat
    ) {
      return ruleBasedResult;
    }

    try {
      const response = await this.llm.routedChat(
        {
          model: '', // routedChat picks the model
          messages: [
            {
              role: 'system',
              content: `You classify user requests for an AI assistant.
Respond with ONLY a JSON object: {"complexity":"simple"|"compound"|"complex","domains":["email","calendar",...],"parallelCapable":true|false}

Rules:
- "simple": single tool call or conversational
- "compound": multiple tools, one domain, sequential
- "complex": multiple domains OR research+action combos that benefit from parallel execution

Available domains: email, calendar, files, web, contacts, finances, health, reminders, messaging, location, cloud-storage`,
            },
            { role: 'user', content: message },
          ],
          temperature: 0,
          maxTokens: 128,
          format: 'json',
        },
        'classify',
      );

      const parsed = JSON.parse(response.message.content) as {
        complexity?: string;
        domains?: string[];
        parallelCapable?: boolean;
      };

      if (
        parsed.complexity &&
        ['simple', 'compound', 'complex'].includes(parsed.complexity)
      ) {
        return {
          complexity: parsed.complexity as RequestComplexity,
          domains: (parsed.domains ?? ruleBasedResult.domains) as AutonomyDomain[],
          estimatedTools: ruleBasedResult.estimatedTools,
          reasoning: `LLM-refined: ${parsed.complexity} (rule-based was: ${ruleBasedResult.complexity})`,
          parallelCapable: parsed.parallelCapable ?? ruleBasedResult.parallelCapable,
        };
      }
    } catch {
      // LLM refinement failed — use rule-based result
    }

    return ruleBasedResult;
  }

  /** Get the domain for a tool name. */
  static getToolDomain(toolName: string): AutonomyDomain | null {
    return TOOL_DOMAIN_MAP[toolName] ?? null;
  }
}
