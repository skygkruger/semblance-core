/**
 * MultiAgentOverlay — Raw visual renderer for multi-agent orchestration events.
 * Shows decomposition, subagent lifecycle, tool calls, and synthesis phases
 * inline in the chat area.
 *
 * This is the design surface — intentionally unstyled beyond basic structure
 * so Sky can see every event type and decide on the visual treatment.
 *
 * Architecture note: This does NOT use cards. It uses text, dots, animations,
 * and a bracket spine per the design direction.
 */

import { useRef, useEffect } from 'react';
import type { SubagentStreamEvent } from './MultiAgentDemo';

interface MultiAgentOverlayProps {
  events: SubagentStreamEvent[];
  active: boolean;
}

// Track which subagents are alive and their state
interface SubagentState {
  id: string;
  description: string;
  modelTier: string;
  status: 'running' | 'completed' | 'failed';
  tools: Array<{ name: string; status: 'calling' | 'success' | 'error'; result?: string }>;
  tokensConsumed?: number;
}

function buildSubagentStates(events: SubagentStreamEvent[]): {
  phase: 'idle' | 'decomposing' | 'executing' | 'synthesizing' | 'complete';
  decomposition: { domains: string[]; subtasks: Array<{ id: string; description: string; tools: string[]; modelTier: string }> } | null;
  subagents: Map<string, SubagentState>;
  synthesis: { text: string; progress: number; tokensConsumed?: number } | null;
  lastEvent: SubagentStreamEvent | null;
} {
  let phase: 'idle' | 'decomposing' | 'executing' | 'synthesizing' | 'complete' = 'idle';
  let decomposition: { domains: string[]; subtasks: Array<{ id: string; description: string; tools: string[]; modelTier: string }> } | null = null;
  const subagents = new Map<string, SubagentState>();
  let synthesis: { text: string; progress: number; tokensConsumed?: number } | null = null;
  let lastEvent: SubagentStreamEvent | null = null;

  for (const e of events) {
    lastEvent = e;

    switch (e.type) {
      case 'decomposition_started':
        phase = 'decomposing';
        break;

      case 'decomposition_complete':
        phase = 'executing';
        decomposition = {
          domains: e.data.domains ?? [],
          subtasks: (e.data.subtasks ?? []) as Array<{ id: string; description: string; tools: string[]; modelTier: string }>,
        };
        break;

      case 'subagent_started':
        subagents.set(e.subagentId, {
          id: e.subagentId,
          description: e.data.text ?? '',
          modelTier: e.data.modelTier ?? 'fast',
          status: 'running',
          tools: [],
        });
        break;

      case 'subagent_tool_call': {
        const sa = subagents.get(e.subagentId);
        if (sa) {
          sa.tools.push({ name: e.data.toolName ?? '', status: e.data.toolStatus as 'calling' | 'success' | 'error' });
        }
        break;
      }

      case 'subagent_tool_result': {
        const sa = subagents.get(e.subagentId);
        if (sa) {
          const lastTool = sa.tools[sa.tools.length - 1];
          if (lastTool) {
            lastTool.status = e.data.toolStatus as 'success' | 'error';
            lastTool.result = e.data.toolResult;
          }
        }
        break;
      }

      case 'subagent_completed': {
        const sa = subagents.get(e.subagentId);
        if (sa) {
          sa.status = 'completed';
          sa.tokensConsumed = e.data.tokensConsumed;
        }
        break;
      }

      case 'subagent_failed': {
        const sa = subagents.get(e.subagentId);
        if (sa) {
          sa.status = 'failed';
          sa.tokensConsumed = e.data.tokensConsumed;
        }
        break;
      }

      case 'synthesis_started':
        phase = 'synthesizing';
        synthesis = { text: e.data.text ?? '', progress: 0 };
        break;

      case 'synthesis_progress':
        synthesis = { text: e.data.text ?? '', progress: e.data.progress ?? 0 };
        break;

      case 'synthesis_completed':
        phase = 'complete';
        synthesis = { text: e.data.text ?? '', progress: 1, tokensConsumed: e.data.tokensConsumed };
        break;
    }
  }

  return { phase, decomposition, subagents, synthesis, lastEvent };
}

// ─── Dot indicator ───────────────────────────────────────────────────────────

function StatusDot({ status, pulse }: { status: 'running' | 'completed' | 'failed' | 'calling' | 'success' | 'error'; pulse?: boolean }) {
  const colors: Record<string, string> = {
    running: '#38BDF8',
    completed: '#6ECFA3',
    failed: '#E8657A',
    calling: '#38BDF8',
    success: '#6ECFA3',
    error: '#E8657A',
  };
  return (
    <span style={{
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: colors[status] ?? '#5E6B7C',
      flexShrink: 0,
      animation: pulse ? 'pulse 1.5s ease-in-out infinite' : 'none',
      animationDelay: '-1000s',
    }} />
  );
}

// ─── Main Overlay ────────────────────────────────────────────────────────────

export function MultiAgentOverlay({ events, active }: MultiAgentOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { phase, decomposition, subagents, synthesis } = buildSubagentStates(events);

  // Auto-scroll to bottom as events arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0) return null;

  const subagentList = Array.from(subagents.values());

  return (
    <div
      ref={containerRef}
      style={{
        padding: '12px 24px',
        maxWidth: 720,
        width: '100%',
        margin: '0 auto',
        fontFamily: "'DM Mono', monospace",
        fontSize: 12,
        letterSpacing: '0.04em',
        position: 'relative',
      }}
    >
      {/* ─── Bracket spine (left edge) ─── */}
      <div style={{
        position: 'absolute',
        left: 12,
        top: 12,
        bottom: 12,
        width: 2,
        background: active
          ? 'linear-gradient(180deg, rgba(56,189,248,0.4) 0%, rgba(56,189,248,0.15) 100%)'
          : 'rgba(56,189,248,0.1)',
        borderRadius: 1,
        transition: 'background 500ms ease',
      }} />

      <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* ─── Decomposition phase ─── */}
        {phase !== 'idle' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot status={phase === 'decomposing' ? 'running' : 'completed'} pulse={phase === 'decomposing'} />
            <span style={{ color: phase === 'decomposing' ? '#38BDF8' : '#5E6B7C' }}>
              {phase === 'decomposing' ? 'Analyzing request complexity...' : `${decomposition?.domains?.length ?? 0} domains identified`}
            </span>
          </div>
        )}

        {/* Subtask plan */}
        {decomposition && decomposition.subtasks.length > 0 && (
          <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}>
            {decomposition.subtasks.map(st => {
              const sa = subagents.get(st.id);
              const isCloud = st.modelTier === 'cloud_bridge';
              return (
                <div key={st.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    color: '#5E6B7C',
                    fontSize: 10,
                    lineHeight: '18px',
                  }}>
                    {sa ? (sa.status === 'completed' ? '\u2713' : sa.status === 'failed' ? '\u2717' : '\u2192') : '\u00b7'}
                  </span>
                  <span style={{
                    color: sa?.status === 'failed' ? '#E8657A' : sa?.status === 'completed' ? '#5E6B7C' : '#A8B4C0',
                    fontSize: 11,
                    lineHeight: '18px',
                  }}>
                    {st.description}
                  </span>
                  {isCloud && (
                    <span style={{
                      fontSize: 9,
                      color: '#38BDF8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      border: '1px solid rgba(56,189,248,0.2)',
                      borderRadius: 3,
                      padding: '1px 5px',
                      lineHeight: '14px',
                    }}>
                      cloud
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Subagent execution ─── */}
        {subagentList.map(sa => (
          <div key={sa.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Subagent header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot status={sa.status} pulse={sa.status === 'running'} />
              <span style={{
                color: sa.status === 'running' ? '#A8B4C0' : sa.status === 'failed' ? '#E8657A' : '#5E6B7C',
                transition: 'color 300ms ease',
              }}>
                {sa.description}
              </span>
              {sa.status === 'completed' && sa.tokensConsumed && (
                <span style={{ color: '#5E6B7C', fontSize: 10 }}>
                  {sa.tokensConsumed} tok
                </span>
              )}
            </div>

            {/* Tool calls */}
            {sa.tools.length > 0 && (
              <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {sa.tools.map((tool, i) => (
                  <div key={`${sa.id}-tool-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StatusDot status={tool.status} pulse={tool.status === 'calling'} />
                    <span style={{
                      color: tool.status === 'calling' ? '#38BDF8' : tool.status === 'error' ? '#E8657A' : '#5E6B7C',
                      fontSize: 11,
                    }}>
                      {tool.name}
                    </span>
                    {tool.result && (
                      <span style={{ color: '#5E6B7C', fontSize: 10, marginLeft: 4 }}>
                        — {tool.result}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* ─── Synthesis phase ─── */}
        {synthesis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot
                status={phase === 'complete' ? 'completed' : 'running'}
                pulse={phase === 'synthesizing'}
              />
              <span style={{
                color: phase === 'complete' ? '#6ECFA3' : '#38BDF8',
                transition: 'color 300ms ease',
              }}>
                {synthesis.text}
              </span>
              {synthesis.tokensConsumed && (
                <span style={{ color: '#5E6B7C', fontSize: 10 }}>
                  {synthesis.tokensConsumed} tok
                </span>
              )}
            </div>
            {phase === 'synthesizing' && synthesis.progress > 0 && synthesis.progress < 1 && (
              <div style={{ paddingLeft: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 120,
                  height: 2,
                  background: 'rgba(56,189,248,0.1)',
                  borderRadius: 1,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${synthesis.progress * 100}%`,
                    height: '100%',
                    background: '#38BDF8',
                    borderRadius: 1,
                    transition: 'width 400ms ease',
                  }} />
                </div>
                <span style={{ color: '#5E6B7C', fontSize: 10 }}>
                  {Math.round(synthesis.progress * 100)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
