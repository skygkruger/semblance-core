/**
 * MultiAgentOverlay — ContentBracket-style reactive bracket for multi-agent
 * orchestration in chat. Spine grows downward with spring physics as nodes
 * append. Ticks draw independently with their own ease-out after the spine
 * arrives. Content reveals in staggered beats: dot → tick → text.
 *
 * Dot color system:
 *   #38BDF8 Electric Cyan  — agent spawned / decomposition / cloud bridge
 *   #818CF8 Soft Indigo    — tool calling (in progress)
 *   #6ECFA3 Veridian       — task completed (ONLY completion)
 *   #E8657A Signal Rose    — failure / error
 *   #EDDD52 Electric Cadmium — synthesis phase
 *   #5E6B7C Muted          — idle / waiting
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { SubagentStreamEvent } from './MultiAgentDemo';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentNode {
  id: string;
  label: string;
  tier: number;
  status: 'active' | 'complete' | 'error' | 'waiting';
  isCloud?: boolean;
  tokenCount?: number;
}

// ─── Dot colors ──────────────────────────────────────────────────────────────

const DOT_COLORS: Record<string, string> = {
  decomposing: '#38BDF8',
  spawned:     '#38BDF8',
  cloud:       '#38BDF8',
  calling:     '#818CF8',
  complete:    '#6ECFA3',
  error:       '#E8657A',
  synthesis:   '#EDDD52',
  waiting:     '#5E6B7C',
};

// ─── Cloud icon ──────────────────────────────────────────────────────────────

function CloudIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="cloud-sweep" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="30%" stopColor="#38BDF8" />
          <stop offset="60%" stopColor="#7DD3FC" />
          <stop offset="80%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <path d="M6.5 19a4.5 4.5 0 0 1-.42-8.98A7 7 0 0 1 19.5 10a4.5 4.5 0 0 1 .5 8.97" stroke="url(#cloud-sweep)" />
    </svg>
  );
}

// ─── Build node list from events ─────────────────────────────────────────────

function buildNodes(events: SubagentStreamEvent[]): {
  nodes: AgentNode[];
  phase: 'idle' | 'decomposing' | 'executing' | 'synthesizing' | 'complete';
} {
  const nodes: AgentNode[] = [];
  let phase: 'idle' | 'decomposing' | 'executing' | 'synthesizing' | 'complete' = 'idle';
  const agentStatus = new Map<string, 'active' | 'complete' | 'error'>();
  const toolComplete = new Set<string>();

  for (const e of events) {
    switch (e.type) {
      case 'decomposition_started': phase = 'decomposing'; break;
      case 'decomposition_complete': phase = 'executing'; break;
      case 'subagent_started': agentStatus.set(e.subagentId, 'active'); break;
      case 'subagent_completed': agentStatus.set(e.subagentId, 'complete'); break;
      case 'subagent_failed': agentStatus.set(e.subagentId, 'error'); break;
      case 'subagent_tool_result': toolComplete.add(`${e.subagentId}-${e.data.toolName}`); break;
      case 'synthesis_started': phase = 'synthesizing'; break;
      case 'synthesis_progress': break;
      case 'synthesis_completed': phase = 'complete'; break;
    }
  }

  if (phase !== 'idle') {
    nodes.push({
      id: 'decomposition',
      label: phase === 'decomposing' ? 'Analyzing complexity...' : 'Task decomposition',
      tier: 0, status: phase === 'decomposing' ? 'active' : 'complete',
    });
  }

  for (const e of events) {
    if (e.type === 'subagent_started') {
      nodes.push({
        id: e.subagentId,
        label: e.data.text ?? e.subagentId,
        tier: 1, status: agentStatus.get(e.subagentId) ?? 'active',
        isCloud: e.data.modelTier === 'cloud_bridge',
      });
    }
    if (e.type === 'subagent_tool_call') {
      const toolKey = `${e.subagentId}-${e.data.toolName}`;
      const isDone = toolComplete.has(toolKey);
      const isError = events.some(ev =>
        ev.type === 'subagent_tool_result' && ev.subagentId === e.subagentId &&
        ev.data.toolName === e.data.toolName && ev.data.toolStatus === 'error'
      );
      nodes.push({
        id: `tool-${e.subagentId}-${e.data.toolName}-${e.timestamp}`,
        label: e.data.toolName ?? 'tool',
        tier: 2, status: isError ? 'error' : isDone ? 'complete' : 'active',
      });
    }
    if (e.type === 'subagent_tool_result' && e.data.toolResult) {
      nodes.push({
        id: `result-${e.subagentId}-${e.data.toolName}-${e.timestamp}`,
        label: e.data.toolResult,
        tier: 3, status: e.data.toolStatus === 'error' ? 'error' : 'complete',
      });
    }
    if (e.type === 'subagent_completed' || e.type === 'subagent_failed') {
      nodes.push({
        id: `done-${e.subagentId}`,
        label: e.data.text ?? (e.type === 'subagent_failed' ? 'Failed' : 'Complete'),
        tier: 1, status: e.type === 'subagent_failed' ? 'error' : 'complete',
        tokenCount: e.data.tokensConsumed,
      });
    }
  }

  if (phase === 'synthesizing' || phase === 'complete') {
    nodes.push({
      id: 'synthesis',
      label: events.filter(e => ['synthesis_started', 'synthesis_progress', 'synthesis_completed'].includes(e.type)).pop()?.data.text ?? 'Synthesizing...',
      tier: 4, status: phase === 'complete' ? 'complete' : 'active',
    });
  }

  return { nodes, phase };
}

// ─── Dot color resolver ──────────────────────────────────────────────────────

function dotColor(node: AgentNode): string {
  if (node.status === 'complete') return DOT_COLORS.complete!;
  if (node.status === 'error') return DOT_COLORS.error!;
  if (node.isCloud) return DOT_COLORS.cloud!;
  if (node.tier === 0) return DOT_COLORS.decomposing!;
  if (node.tier === 2) return DOT_COLORS.calling!;
  if (node.tier === 4) return DOT_COLORS.synthesis!;
  if (node.tier === 1 && node.status === 'active') return DOT_COLORS.spawned!;
  return DOT_COLORS.waiting!;
}

// ─── Spring physics for spine ────────────────────────────────────────────────

interface SpringState {
  position: number;
  velocity: number;
}

function springStep(state: SpringState, target: number, dt: number): SpringState {
  const stiffness = 120;  // how hard it pulls toward target
  const damping = 14;     // how quickly oscillation dies
  const force = stiffness * (target - state.position);
  const dampForce = -damping * state.velocity;
  const acceleration = force + dampForce;
  const velocity = state.velocity + acceleration * dt;
  const position = state.position + velocity * dt;
  return { position, velocity };
}

// ─── Per-tick animation state ────────────────────────────────────────────────

interface TickAnimState {
  arrivedAt: number;  // timestamp when spine first reached this node's Y
  tickProgress: number; // 0→1 ease-out for the tick extension
}

// ─── Main component ──────────────────────────────────────────────────────────

interface MultiAgentOverlayProps {
  events: SubagentStreamEvent[];
  active: boolean;
}

export function MultiAgentOverlay({ events, active }: MultiAgentOverlayProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef(0);

  // Spring state for spine bottom position
  const springRef = useRef<SpringState>({ position: 0, velocity: 0 });
  const [spineBottom, setSpineBottom] = useState(0);

  // Per-tick animation tracking
  const tickAnimRef = useRef<Map<number, TickAnimState>>(new Map());

  // Force re-render for tick animations
  const [, setTickFrame] = useState(0);

  const { nodes, phase } = buildNodes(events);

  const lineHeight = 26;
  const spineX = 14;
  const tickLen = 12;
  const capLen = 5;
  const contentLeft = 48;
  const spineTop = 13;
  const targetBottom = spineTop + Math.max(0, nodes.length - 1) * lineHeight;

  // Initialize spring position on first render
  useEffect(() => {
    if (springRef.current.position === 0 && nodes.length > 0) {
      springRef.current.position = spineTop;
    }
  }, [nodes.length, spineTop]);

  // Main animation loop — spring physics for spine + per-tick ease-out
  const lastTimeRef = useRef(0);
  const animate = useCallback((now: number) => {
    const dt = lastTimeRef.current ? Math.min((now - lastTimeRef.current) / 1000, 0.05) : 0.016;
    lastTimeRef.current = now;

    // Step spine spring toward target
    const spring = springRef.current;
    const newSpring = springStep(spring, targetBottom, dt);
    springRef.current = newSpring;
    setSpineBottom(newSpring.position);

    // Update per-tick animations
    let anyTickActive = false;
    const currentBottom = newSpring.position;

    for (let i = 0; i < nodes.length; i++) {
      const tickY = spineTop + i * lineHeight;
      const state = tickAnimRef.current.get(i);

      if (currentBottom >= tickY - 1) {
        // Spine has reached this tick
        if (!state) {
          // First arrival — record timestamp
          tickAnimRef.current.set(i, { arrivedAt: now, tickProgress: 0 });
          anyTickActive = true;
        } else if (state.tickProgress < 1) {
          // Animate tick extension: 350ms ease-out
          const elapsed = now - state.arrivedAt;
          const p = Math.min(1, elapsed / 350);
          state.tickProgress = 1 - Math.pow(1 - p, 3); // cubic ease-out — snappier
          anyTickActive = true;
        }
      }
    }

    if (anyTickActive) {
      setTickFrame(f => f + 1);
    }

    // Keep loop alive while there's motion or orchestration is active
    const isMoving = Math.abs(newSpring.velocity) > 0.1 || Math.abs(targetBottom - newSpring.position) > 0.5;
    if (isMoving || active || anyTickActive) {
      animFrameRef.current = requestAnimationFrame(animate);
    }
  }, [targetBottom, active, nodes.length, spineTop, lineHeight]);

  useEffect(() => {
    if (nodes.length === 0) return;
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [nodes.length, animate]);

  // Scroll into view
  useEffect(() => {
    wrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events.length]);

  if (nodes.length === 0) return null;

  const totalHeight = nodes.length * lineHeight + 20;
  const bracketColor = '#5E6B7C';
  const currentSpineBottom = Math.max(spineTop, spineBottom);

  // Find the most recently active node for glow effect
  let activeNodeIndex = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i]!.status === 'active') { activeNodeIndex = i; break; }
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        maxWidth: 720,
        width: '100%',
        padding: '8px 0',
        fontFamily: "'DM Mono', monospace",
        fontSize: 11,
        letterSpacing: '0.04em',
      }}
    >
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: contentLeft,
          height: totalHeight,
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        {/* Active node glow — brighter segment near the most recent active node */}
        {activeNodeIndex >= 0 && (
          <line
            x1={spineX}
            y1={Math.max(spineTop, spineTop + activeNodeIndex * lineHeight - 15)}
            x2={spineX}
            y2={Math.min(currentSpineBottom, spineTop + activeNodeIndex * lineHeight + 15)}
            stroke={dotColor(nodes[activeNodeIndex]!)}
            strokeWidth={1}
            opacity={0.25}
          />
        )}

        <g stroke={bracketColor} strokeWidth={1} opacity={0.4}>
          {/* Vertical spine */}
          {currentSpineBottom > spineTop && (
            <line x1={spineX} y1={spineTop} x2={spineX} y2={currentSpineBottom} />
          )}

          {/* Top cap */}
          {currentSpineBottom > spineTop && (
            <line x1={spineX} y1={spineTop} x2={spineX + capLen} y2={spineTop} />
          )}

          {/* Bottom cap — only on completion, fades in */}
          {phase === 'complete' && Math.abs(currentSpineBottom - targetBottom) < 2 && (
            <line
              x1={spineX} y1={currentSpineBottom}
              x2={spineX + capLen} y2={currentSpineBottom}
              opacity={1}
            />
          )}

          {/* Horizontal ticks — each draws independently after spine arrives */}
          {nodes.map((_, i) => {
            const tickY = spineTop + i * lineHeight;
            const state = tickAnimRef.current.get(i);
            if (!state || state.tickProgress <= 0) return null;

            return (
              <line
                key={`tick-${i}`}
                x1={spineX}
                y1={tickY}
                x2={spineX + tickLen * state.tickProgress}
                y2={tickY}
              />
            );
          })}
        </g>
      </svg>

      {/* Content nodes — staggered reveal: dot appears with tick, text 150ms later */}
      <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: contentLeft }}>
        {nodes.map((node, i) => {
          const tickY = spineTop + i * lineHeight;
          const state = tickAnimRef.current.get(i);
          const tickProgress = state?.tickProgress ?? 0;
          const arrivedAt = state?.arrivedAt ?? 0;

          // Dot appears as soon as tick starts drawing
          const dotOpacity = tickProgress > 0 ? Math.min(1, tickProgress * 3) : 0;

          // Text fades in 150ms after tick starts — staggered beat
          const now = performance.now();
          const textDelay = arrivedAt > 0 ? Math.min(1, Math.max(0, (now - arrivedAt - 150) / 250)) : 0;
          const textOpacity = tickProgress > 0.3 ? textDelay : 0;

          // Active node gets full brightness, completed nodes dim
          const isActiveNode = i === activeNodeIndex;

          return (
            <div
              key={node.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: lineHeight,
              }}
            >
              {/* Status dot */}
              <span
                style={{
                  display: 'inline-block',
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: dotColor(node),
                  flexShrink: 0,
                  opacity: dotOpacity,
                  animation: node.status === 'active' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                  animationDelay: '-1000s',
                  boxShadow: isActiveNode && node.status === 'active'
                    ? `0 0 6px ${dotColor(node)}40, 0 0 12px ${dotColor(node)}20`
                    : 'none',
                  transition: 'box-shadow 300ms ease',
                }}
              />

              {/* Cloud icon */}
              {node.isCloud && (
                <span style={{ opacity: dotOpacity, transition: 'opacity 200ms ease' }}>
                  <CloudIcon size={11} />
                </span>
              )}

              {/* Label — fades in after dot */}
              <span
                style={{
                  color: node.status === 'complete' ? '#5E6B7C'
                    : node.status === 'error' ? '#E8657A'
                    : node.tier === 2 ? '#818CF8'
                    : node.tier === 3 ? '#5E6B7C'
                    : node.tier === 4 ? '#EDDD52'
                    : '#A8B4C0',
                  fontSize: node.tier >= 2 ? 10 : 11,
                  paddingLeft: node.tier >= 2 ? 8 : 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: node.tier >= 3 ? 400 : 500,
                  opacity: textOpacity,
                  transform: `translateX(${(1 - textOpacity) * 6}px)`,
                  transition: 'color 300ms ease',
                }}
              >
                {node.label}
              </span>

              {/* Token count */}
              {node.tokenCount && node.status === 'complete' && (
                <span style={{ color: '#5E6B7C', fontSize: 9, opacity: textOpacity }}>
                  {node.tokenCount} tok
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
