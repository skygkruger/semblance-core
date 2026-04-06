/**
 * MultiAgentDemo — Dev-only harness that simulates multi-agent orchestration
 * events directly in the chat UI. Fires a scripted sequence of subagent
 * lifecycle events so you can see every phase in motion and design the
 * rendering before wiring to the real backend.
 *
 * Triggered from a floating dev button in the bottom-right of the chat.
 * Only renders when import.meta.env.DEV is true.
 *
 * Events are dispatched into a shared callback so the ChatScreen (or any
 * listening component) can render them without needing the Tauri event bus.
 */

import { useState, useCallback, useRef } from 'react';

// ─── Event Types (mirrors orchestrator-v2-types.ts) ──────────────────────────

export type SubagentStreamEventType =
  | 'decomposition_started'
  | 'decomposition_complete'
  | 'subagent_started'
  | 'subagent_progress'
  | 'subagent_tool_call'
  | 'subagent_tool_result'
  | 'subagent_completed'
  | 'subagent_failed'
  | 'synthesis_started'
  | 'synthesis_progress'
  | 'synthesis_completed';

export interface SubagentStreamEvent {
  type: SubagentStreamEventType;
  subagentId: string;
  subtaskId: string;
  timestamp: number;
  data: {
    text?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolStatus?: 'calling' | 'success' | 'error';
    toolResult?: string;
    progress?: number;
    tokensConsumed?: number;
    modelTier?: string;
    domains?: string[];
    subtasks?: Array<{ id: string; description: string; tools: string[]; modelTier: string }>;
  };
}

export type MultiAgentEventCallback = (event: SubagentStreamEvent) => void;

// ─── Global callback registry ────────────────────────────────────────────────
// ChatScreen registers its handler here. Demo fires events through it.

let _callback: MultiAgentEventCallback | null = null;

export function registerMultiAgentCallback(cb: MultiAgentEventCallback) {
  _callback = cb;
}

export function unregisterMultiAgentCallback() {
  _callback = null;
}

export function getRegisteredMultiAgentCallback(): MultiAgentEventCallback | null {
  return _callback;
}

function emit(event: SubagentStreamEvent) {
  _callback?.(event);
}

// ─── Demo Scenarios ──────────────────────────────────────────────────────────

interface DemoStep {
  delayMs: number;
  event: SubagentStreamEvent;
}

function now() { return Date.now(); }

/** Scenario: "Prepare me for tomorrow's standup" — 3 parallel subagents */
function buildStandupScenario(): DemoStep[] {
  const steps: DemoStep[] = [];
  let t = 0;

  // Phase 1: Decomposition
  steps.push({ delayMs: t, event: {
    type: 'decomposition_started',
    subagentId: 'coordinator',
    subtaskId: 'decompose',
    timestamp: now(),
    data: { text: 'Analyzing request complexity...' },
  }});

  t += 1200;
  steps.push({ delayMs: t, event: {
    type: 'decomposition_complete',
    subagentId: 'coordinator',
    subtaskId: 'decompose',
    timestamp: now(),
    data: {
      text: 'Complex request detected — 3 domains identified',
      domains: ['email', 'calendar', 'knowledge'],
      subtasks: [
        { id: 'sub-email', description: 'Scan recent email threads for standup-relevant updates', tools: ['search_emails', 'read_email'], modelTier: 'fast' },
        { id: 'sub-calendar', description: 'Check today and tomorrow calendar for context', tools: ['get_today_events', 'get_week_events'], modelTier: 'fast' },
        { id: 'sub-knowledge', description: 'Search knowledge base for project status and blockers', tools: ['search_knowledge', 'read_document'], modelTier: 'primary' },
      ],
    },
  }});

  // Phase 2: Parallel subagent execution (staggered starts)
  // -- Email subagent
  t += 600;
  steps.push({ delayMs: t, event: {
    type: 'subagent_started',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { text: 'Scanning recent email threads for standup-relevant updates', modelTier: 'fast' },
  }});

  // -- Calendar subagent
  t += 200;
  steps.push({ delayMs: t, event: {
    type: 'subagent_started',
    subagentId: 'sub-calendar',
    subtaskId: 'sub-calendar',
    timestamp: now(),
    data: { text: 'Checking today and tomorrow calendar for context', modelTier: 'fast' },
  }});

  // -- Knowledge subagent
  t += 300;
  steps.push({ delayMs: t, event: {
    type: 'subagent_started',
    subagentId: 'sub-knowledge',
    subtaskId: 'sub-knowledge',
    timestamp: now(),
    data: { text: 'Searching knowledge base for project status and blockers', modelTier: 'primary' },
  }});

  // Email subagent tool calls
  t += 800;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { toolName: 'search_emails', toolStatus: 'calling', toolArgs: { query: 'standup update blockers', limit: 10 } },
  }});

  t += 1400;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { toolName: 'search_emails', toolStatus: 'success', toolResult: '7 relevant threads found' },
  }});

  // Calendar subagent tool calls
  t += 200;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-calendar',
    subtaskId: 'sub-calendar',
    timestamp: now(),
    data: { toolName: 'get_today_events', toolStatus: 'calling' },
  }});

  t += 600;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-calendar',
    subtaskId: 'sub-calendar',
    timestamp: now(),
    data: { toolName: 'get_today_events', toolStatus: 'success', toolResult: '4 events today, standup at 9:30 AM' },
  }});

  // Knowledge subagent tool calls
  t += 300;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-knowledge',
    subtaskId: 'sub-knowledge',
    timestamp: now(),
    data: { toolName: 'search_knowledge', toolStatus: 'calling', toolArgs: { query: 'project blockers Q1 sprint' } },
  }});

  t += 1800;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-knowledge',
    subtaskId: 'sub-knowledge',
    timestamp: now(),
    data: { toolName: 'search_knowledge', toolStatus: 'success', toolResult: '12 relevant documents, 3 flagged blockers' },
  }});

  // Email subagent reads a specific thread
  t += 400;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { toolName: 'read_email', toolStatus: 'calling', toolArgs: { threadId: 'thread_a8f2' } },
  }});

  t += 900;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { toolName: 'read_email', toolStatus: 'success', toolResult: 'API migration thread — deadline moved to Friday' },
  }});

  // Calendar subagent completes first
  t += 200;
  steps.push({ delayMs: t, event: {
    type: 'subagent_completed',
    subagentId: 'sub-calendar',
    subtaskId: 'sub-calendar',
    timestamp: now(),
    data: { text: 'Calendar context gathered', tokensConsumed: 340, progress: 1 },
  }});

  // Email subagent completes
  t += 800;
  steps.push({ delayMs: t, event: {
    type: 'subagent_completed',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { text: 'Email scan complete — 3 actionable threads identified', tokensConsumed: 890, progress: 1 },
  }});

  // Knowledge subagent reads a document
  t += 400;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-knowledge',
    subtaskId: 'sub-knowledge',
    timestamp: now(),
    data: { toolName: 'read_document', toolStatus: 'calling', toolArgs: { docId: 'doc_sprint_retro' } },
  }});

  t += 1200;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-knowledge',
    subtaskId: 'sub-knowledge',
    timestamp: now(),
    data: { toolName: 'read_document', toolStatus: 'success', toolResult: 'Sprint retro notes — auth service blocker resolved' },
  }});

  // Knowledge subagent completes
  t += 600;
  steps.push({ delayMs: t, event: {
    type: 'subagent_completed',
    subagentId: 'sub-knowledge',
    subtaskId: 'sub-knowledge',
    timestamp: now(),
    data: { text: 'Knowledge synthesis complete — project status mapped', tokensConsumed: 1420, progress: 1 },
  }});

  // Phase 3: Synthesis
  t += 800;
  steps.push({ delayMs: t, event: {
    type: 'synthesis_started',
    subagentId: 'coordinator',
    subtaskId: 'synthesis',
    timestamp: now(),
    data: { text: 'Synthesizing results from 3 subagents...' },
  }});

  t += 600;
  steps.push({ delayMs: t, event: {
    type: 'synthesis_progress',
    subagentId: 'coordinator',
    subtaskId: 'synthesis',
    timestamp: now(),
    data: { text: 'Cross-referencing email updates with knowledge base...', progress: 0.4 },
  }});

  t += 800;
  steps.push({ delayMs: t, event: {
    type: 'synthesis_progress',
    subagentId: 'coordinator',
    subtaskId: 'synthesis',
    timestamp: now(),
    data: { text: 'Building standup brief...', progress: 0.75 },
  }});

  t += 1000;
  steps.push({ delayMs: t, event: {
    type: 'synthesis_completed',
    subagentId: 'coordinator',
    subtaskId: 'synthesis',
    timestamp: now(),
    data: { text: 'Standup preparation complete', tokensConsumed: 2650 },
  }});

  return steps;
}

/** Scenario: Cloud Bridge hybrid — one local + one cloud subagent */
function buildCloudBridgeScenario(): DemoStep[] {
  const steps: DemoStep[] = [];
  let t = 0;

  steps.push({ delayMs: t, event: {
    type: 'decomposition_started',
    subagentId: 'coordinator',
    subtaskId: 'decompose',
    timestamp: now(),
    data: { text: 'Analyzing request complexity...' },
  }});

  t += 1000;
  steps.push({ delayMs: t, event: {
    type: 'decomposition_complete',
    subagentId: 'coordinator',
    subtaskId: 'decompose',
    timestamp: now(),
    data: {
      text: 'Hybrid routing — local retrieval + cloud reasoning',
      domains: ['knowledge', 'reasoning'],
      subtasks: [
        { id: 'sub-local', description: 'Retrieve and index relevant local documents', tools: ['search_knowledge', 'read_document'], modelTier: 'fast' },
        { id: 'sub-cloud', description: 'Deep analysis and report generation via Cloud Bridge', tools: ['analyze', 'generate_report'], modelTier: 'cloud_bridge' },
      ],
    },
  }});

  // Local subagent starts
  t += 500;
  steps.push({ delayMs: t, event: {
    type: 'subagent_started',
    subagentId: 'sub-local',
    subtaskId: 'sub-local',
    timestamp: now(),
    data: { text: 'Retrieving relevant local documents', modelTier: 'fast' },
  }});

  t += 700;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-local',
    subtaskId: 'sub-local',
    timestamp: now(),
    data: { toolName: 'search_knowledge', toolStatus: 'calling', toolArgs: { query: 'quarterly financial summary' } },
  }});

  t += 1200;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-local',
    subtaskId: 'sub-local',
    timestamp: now(),
    data: { toolName: 'search_knowledge', toolStatus: 'success', toolResult: '8 documents matched' },
  }});

  t += 400;
  steps.push({ delayMs: t, event: {
    type: 'subagent_completed',
    subagentId: 'sub-local',
    subtaskId: 'sub-local',
    timestamp: now(),
    data: { text: 'Local retrieval complete', tokensConsumed: 520, progress: 1 },
  }});

  // Cloud subagent starts after local completes (dependency)
  t += 600;
  steps.push({ delayMs: t, event: {
    type: 'subagent_started',
    subagentId: 'sub-cloud',
    subtaskId: 'sub-cloud',
    timestamp: now(),
    data: { text: 'Deep analysis via Cloud Bridge (Anthropic Claude)', modelTier: 'cloud_bridge' },
  }});

  t += 1000;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-cloud',
    subtaskId: 'sub-cloud',
    timestamp: now(),
    data: { toolName: 'analyze', toolStatus: 'calling', toolArgs: { documents: 8, depth: 'comprehensive' } },
  }});

  t += 2500;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-cloud',
    subtaskId: 'sub-cloud',
    timestamp: now(),
    data: { toolName: 'analyze', toolStatus: 'success', toolResult: 'Analysis complete — 4 key findings' },
  }});

  t += 800;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-cloud',
    subtaskId: 'sub-cloud',
    timestamp: now(),
    data: { toolName: 'generate_report', toolStatus: 'calling' },
  }});

  t += 2000;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-cloud',
    subtaskId: 'sub-cloud',
    timestamp: now(),
    data: { toolName: 'generate_report', toolStatus: 'success', toolResult: 'Report generated — 2,400 words' },
  }});

  t += 500;
  steps.push({ delayMs: t, event: {
    type: 'subagent_completed',
    subagentId: 'sub-cloud',
    subtaskId: 'sub-cloud',
    timestamp: now(),
    data: { text: 'Cloud analysis complete', tokensConsumed: 4200, progress: 1 },
  }});

  // Synthesis
  t += 600;
  steps.push({ delayMs: t, event: {
    type: 'synthesis_started',
    subagentId: 'coordinator',
    subtaskId: 'synthesis',
    timestamp: now(),
    data: { text: 'Synthesizing local retrieval with cloud analysis...' },
  }});

  t += 1200;
  steps.push({ delayMs: t, event: {
    type: 'synthesis_completed',
    subagentId: 'coordinator',
    subtaskId: 'synthesis',
    timestamp: now(),
    data: { text: 'Report ready', tokensConsumed: 4720 },
  }});

  return steps;
}

/** Scenario: Subagent failure + recovery */
function buildFailureScenario(): DemoStep[] {
  const steps: DemoStep[] = [];
  let t = 0;

  steps.push({ delayMs: t, event: {
    type: 'decomposition_started',
    subagentId: 'coordinator',
    subtaskId: 'decompose',
    timestamp: now(),
    data: { text: 'Analyzing request complexity...' },
  }});

  t += 900;
  steps.push({ delayMs: t, event: {
    type: 'decomposition_complete',
    subagentId: 'coordinator',
    subtaskId: 'decompose',
    timestamp: now(),
    data: {
      text: '2 subtasks identified',
      domains: ['email', 'finance'],
      subtasks: [
        { id: 'sub-email', description: 'Check for invoice emails', tools: ['search_emails'], modelTier: 'fast' },
        { id: 'sub-finance', description: 'Cross-reference with financial records', tools: ['search_transactions', 'get_balance'], modelTier: 'primary' },
      ],
    },
  }});

  t += 500;
  steps.push({ delayMs: t, event: {
    type: 'subagent_started',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { text: 'Checking for invoice emails', modelTier: 'fast' },
  }});

  t += 300;
  steps.push({ delayMs: t, event: {
    type: 'subagent_started',
    subagentId: 'sub-finance',
    subtaskId: 'sub-finance',
    timestamp: now(),
    data: { text: 'Cross-referencing financial records', modelTier: 'primary' },
  }});

  t += 900;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { toolName: 'search_emails', toolStatus: 'calling', toolArgs: { query: 'invoice payment due' } },
  }});

  t += 1200;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { toolName: 'search_emails', toolStatus: 'success', toolResult: '3 invoice emails found' },
  }});

  t += 400;
  steps.push({ delayMs: t, event: {
    type: 'subagent_completed',
    subagentId: 'sub-email',
    subtaskId: 'sub-email',
    timestamp: now(),
    data: { text: 'Invoice emails identified', tokensConsumed: 280, progress: 1 },
  }});

  // Finance subagent fails
  t += 600;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_call',
    subagentId: 'sub-finance',
    subtaskId: 'sub-finance',
    timestamp: now(),
    data: { toolName: 'search_transactions', toolStatus: 'calling' },
  }});

  t += 2000;
  steps.push({ delayMs: t, event: {
    type: 'subagent_tool_result',
    subagentId: 'sub-finance',
    subtaskId: 'sub-finance',
    timestamp: now(),
    data: { toolName: 'search_transactions', toolStatus: 'error', toolResult: 'Plaid connection expired — re-authentication required' },
  }});

  t += 400;
  steps.push({ delayMs: t, event: {
    type: 'subagent_failed',
    subagentId: 'sub-finance',
    subtaskId: 'sub-finance',
    timestamp: now(),
    data: { text: 'Financial data unavailable — Plaid connection expired', tokensConsumed: 180 },
  }});

  // Synthesis with partial results
  t += 800;
  steps.push({ delayMs: t, event: {
    type: 'synthesis_started',
    subagentId: 'coordinator',
    subtaskId: 'synthesis',
    timestamp: now(),
    data: { text: 'Synthesizing partial results (1 of 2 subagents succeeded)...' },
  }});

  t += 1000;
  steps.push({ delayMs: t, event: {
    type: 'synthesis_completed',
    subagentId: 'coordinator',
    subtaskId: 'synthesis',
    timestamp: now(),
    data: { text: 'Partial results — financial cross-reference unavailable', tokensConsumed: 460 },
  }});

  return steps;
}

// ─── Scenario Registry ───────────────────────────────────────────────────────

const SCENARIOS = [
  { id: 'standup', label: 'Standup Prep (3 parallel)', build: buildStandupScenario },
  { id: 'cloud', label: 'Cloud Bridge Hybrid', build: buildCloudBridgeScenario },
  { id: 'failure', label: 'Partial Failure', build: buildFailureScenario },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

interface MultiAgentDemoProps {
  /** Called when the scenario finishes so ChatScreen can add the final response */
  onComplete?: () => void;
}

export function MultiAgentDemo({ onComplete }: MultiAgentDemoProps) {
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const runScenario = useCallback((scenarioId: string) => {
    const scenario = SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) return;

    // Clear any running timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setRunning(true);
    setActiveScenario(scenarioId);
    setExpanded(false);

    const steps = scenario.build();
    let maxDelay = 0;

    steps.forEach(step => {
      maxDelay = Math.max(maxDelay, step.delayMs);
      const timer = setTimeout(() => {
        emit({ ...step.event, timestamp: Date.now() });
      }, step.delayMs);
      timersRef.current.push(timer);
    });

    // Mark complete after last event
    const doneTimer = setTimeout(() => {
      setRunning(false);
      setActiveScenario(null);
      onComplete?.();
    }, maxDelay + 500);
    timersRef.current.push(doneTimer);
  }, [onComplete]);

  const stopScenario = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setRunning(false);
    setActiveScenario(null);
  }, []);

  // Only show in dev mode
  if (!(import.meta as any).env?.DEV) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      right: 24,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 8,
    }}>
      {/* Scenario picker */}
      {expanded && !running && (
        <div style={{
          background: '#121518',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: 8,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minWidth: 220,
        }}>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: '#38BDF8',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 4,
          }}>
            Multi-Agent Demo
          </span>
          {SCENARIOS.map(s => (
            <button
              key={s.id}
              onClick={() => runScenario(s.id)}
              style={{
                background: 'rgba(56, 189, 248, 0.06)',
                border: '1px solid rgba(56, 189, 248, 0.12)',
                borderRadius: 4,
                padding: '8px 12px',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                color: '#A8B4C0',
                letterSpacing: '0.04em',
                transition: 'background 150ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.06)')}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Running indicator */}
      {running && activeScenario && (
        <div style={{
          background: '#121518',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: 8,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#38BDF8',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: '#38BDF8',
            letterSpacing: '0.04em',
          }}>
            {SCENARIOS.find(s => s.id === activeScenario)?.label}
          </span>
          <button
            onClick={stopScenario}
            style={{
              background: 'rgba(232, 101, 122, 0.12)',
              border: '1px solid rgba(232, 101, 122, 0.2)',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              color: '#E8657A',
              letterSpacing: '0.04em',
            }}
          >
            Stop
          </button>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: running ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.08)',
          border: `1px solid rgba(56, 189, 248, ${running ? '0.4' : '0.2'})`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 200ms ease',
          position: 'relative',
        }}
        title="Multi-Agent Demo (Dev Only)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <circle cx="5" cy="6" r="2" />
          <circle cx="19" cy="6" r="2" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="18" r="2" />
          <line x1="7" y1="7" x2="10" y2="10" />
          <line x1="17" y1="7" x2="14" y2="10" />
          <line x1="7" y1="17" x2="10" y2="14" />
          <line x1="17" y1="17" x2="14" y2="14" />
        </svg>
      </button>
    </div>
  );
}
