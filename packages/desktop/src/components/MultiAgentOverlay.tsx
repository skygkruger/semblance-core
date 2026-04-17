/**
 * MultiAgentOverlay — Living bracket for multi-agent orchestration in chat.
 *
 * Visual behaviors:
 *   1. Spring physics spine — accelerates, overshoots, settles
 *   2. Independent tick draw — 350ms cubic ease-out per tick
 *   3. Staggered reveal — dot → tick → text (150ms offset)
 *   4. Spine breathing — slow opacity oscillation when idle between events
 *   5. Tick state flash — 200ms brightness pulse when a node completes
 *   6. Arrival ripple — 2x-length line that fades on new node arrival
 *   7. Spine tension — brighter segments near active nodes, dimmer near completed
 *   8. Completion cascade — sequential flash top→bottom, then bottom cap draws
 *   9. Parallel connectors — dashed lines between simultaneously running agents
 *
 * Dot color system:
 *   #38BDF8 Electric Cyan   — agent spawned / decomposition / cloud bridge
 *   #818CF8 Soft Indigo     — tool calling (in progress)
 *   #6ECFA3 Veridian        — task completed (ONLY completion)
 *   #E8657A Signal Rose     — failure / error
 *   #EDDD52 Electric Cadmium — synthesis phase
 *   #5E6B7C Muted           — idle / waiting
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
  parentAgent?: string; // subagentId this node belongs to
  eventTime?: number;   // timestamp from the source event
}

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
  parallelGroups: number[][]; // groups of node indices that run in parallel
} {
  const nodes: AgentNode[] = [];
  let phase: 'idle' | 'decomposing' | 'executing' | 'synthesizing' | 'complete' = 'idle';
  const agentStatus = new Map<string, 'active' | 'complete' | 'error'>();
  const toolComplete = new Set<string>();
  const agentStartTimes = new Map<string, number>(); // subagentId → start timestamp

  for (const e of events) {
    // Sidecar events can arrive with a missing `data` object (e.g., minimal
    // phase-transition events) — access every field through optional chaining
    // so the overlay never throws on undefined.
    const d = e.data ?? {};
    switch (e.type) {
      case 'decomposition_started': phase = 'decomposing'; break;
      case 'decomposition_complete': phase = 'executing'; break;
      case 'subagent_started':
        agentStatus.set(e.subagentId, 'active');
        agentStartTimes.set(e.subagentId, e.timestamp);
        break;
      case 'subagent_completed': agentStatus.set(e.subagentId, 'complete'); break;
      case 'subagent_failed': agentStatus.set(e.subagentId, 'error'); break;
      case 'subagent_tool_result': toolComplete.add(`${e.subagentId}-${d.toolName ?? 'tool'}`); break;
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

  // Track which node indices are agent-start nodes for parallel detection
  const agentStartIndices: { index: number; subagentId: string; time: number }[] = [];

  for (const e of events) {
    const d = e.data ?? {};
    if (e.type === 'subagent_started') {
      agentStartIndices.push({ index: nodes.length, subagentId: e.subagentId, time: e.timestamp });
      nodes.push({
        id: e.subagentId,
        label: d.text ?? e.subagentId,
        tier: 1, status: agentStatus.get(e.subagentId) ?? 'active',
        isCloud: d.modelTier === 'cloud_bridge',
        parentAgent: e.subagentId,
        eventTime: e.timestamp,
      });
    }
    if (e.type === 'subagent_tool_call') {
      const tName = d.toolName ?? 'tool';
      const toolKey = `${e.subagentId}-${tName}`;
      const isDone = toolComplete.has(toolKey);
      const isError = events.some(ev =>
        ev.type === 'subagent_tool_result' && ev.subagentId === e.subagentId &&
        (ev.data?.toolName ?? 'tool') === tName && ev.data?.toolStatus === 'error'
      );
      nodes.push({
        id: `tool-${e.subagentId}-${tName}-${e.timestamp}`,
        label: tName,
        tier: 2, status: isError ? 'error' : isDone ? 'complete' : 'active',
        parentAgent: e.subagentId,
        eventTime: e.timestamp,
      });
    }
    if (e.type === 'subagent_tool_result' && d.toolResult) {
      nodes.push({
        id: `result-${e.subagentId}-${d.toolName ?? 'tool'}-${e.timestamp}`,
        label: d.toolResult,
        tier: 3, status: d.toolStatus === 'error' ? 'error' : 'complete',
        parentAgent: e.subagentId,
        eventTime: e.timestamp,
      });
    }
    if (e.type === 'subagent_completed' || e.type === 'subagent_failed') {
      nodes.push({
        id: `done-${e.subagentId}`,
        label: e.data.text ?? (e.type === 'subagent_failed' ? 'Failed' : 'Complete'),
        tier: 1, status: e.type === 'subagent_failed' ? 'error' : 'complete',
        tokenCount: e.data.tokensConsumed,
        parentAgent: e.subagentId,
        eventTime: e.timestamp,
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

  // Detect parallel agent groups — agents that started within 500ms of each other
  const parallelGroups: number[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < agentStartIndices.length; i++) {
    if (used.has(i)) continue;
    const group = [agentStartIndices[i]!.index];
    used.add(i);
    for (let j = i + 1; j < agentStartIndices.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(agentStartIndices[j]!.time - agentStartIndices[i]!.time) < 500) {
        group.push(agentStartIndices[j]!.index);
        used.add(j);
      }
    }
    if (group.length > 1) parallelGroups.push(group);
  }

  return { nodes, phase, parallelGroups };
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

// ─── Spring physics ──────────────────────────────────────────────────────────

interface SpringState { position: number; velocity: number; }

function springStep(state: SpringState, target: number, dt: number): SpringState {
  const stiffness = 120;
  const damping = 14;
  const force = stiffness * (target - state.position);
  const dampForce = -damping * state.velocity;
  const acceleration = force + dampForce;
  return {
    velocity: state.velocity + acceleration * dt,
    position: state.position + (state.velocity + acceleration * dt) * dt,
  };
}

// ─── Per-tick state ──────────────────────────────────────────────────────────

interface TickState {
  arrivedAt: number;
  tickProgress: number;  // 0→1 tick extension
  prevStatus: string;    // for detecting status transitions
  flashStart: number;    // timestamp of last status-change flash
  flashProgress: number; // 0→1 flash fade
  rippleStart: number;   // timestamp of arrival ripple
  rippleProgress: number;
  cascadeFlash: number;  // 0→1 for completion cascade
}

// ─── Component ───────────────────────────────────────────────────────────────

interface MultiAgentOverlayProps {
  events: SubagentStreamEvent[];
  active: boolean;
  /** Collapsed mode for historical messages — single-line summary, no animation */
  collapsed?: boolean;
  /** Toggle collapsed state */
  onToggleCollapsed?: () => void;
}

// ─── Collapsed summary view ──────────────────────────────────────────────────

function CollapsedBracket({ events, onExpand }: { events: SubagentStreamEvent[]; onExpand?: () => void }) {
  const { nodes } = buildNodes(events);
  const agentCount = nodes.filter(n => n.tier === 1 && !n.tokenCount).length;
  const toolCount = nodes.filter(n => n.tier === 2).length;
  const totalTokens = nodes.reduce((sum, n) => sum + (n.tokenCount ?? 0), 0);
  const hadError = nodes.some(n => n.status === 'error');
  const hadCloud = nodes.some(n => n.isCloud);

  const bracketColor = '#5E6B7C';
  const spineX = 14;

  return (
    <div
      onClick={onExpand}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0 6px 48px',
        cursor: onExpand ? 'pointer' : 'default',
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.04em',
        color: '#5E6B7C',
        transition: 'color 200ms ease',
      }}
      onMouseEnter={e => { if (onExpand) e.currentTarget.style.color = '#A8B4C0'; }}
      onMouseLeave={e => { if (onExpand) e.currentTarget.style.color = '#5E6B7C'; }}
    >
      {/* Mini bracket glyph */}
      <svg
        width={48}
        height={28}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        <g stroke={bracketColor} strokeWidth={1} opacity={0.3}>
          <line x1={spineX} y1={4} x2={spineX} y2={24} />
          <line x1={spineX} y1={4} x2={spineX + 5} y2={4} />
          <line x1={spineX} y1={24} x2={spineX + 5} y2={24} />
          <line x1={spineX} y1={14} x2={spineX + 12} y2={14} />
        </g>
      </svg>

      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        <span style={{
          width: 4, height: 4, borderRadius: '50%',
          background: hadError ? '#E8657A' : '#6ECFA3',
          flexShrink: 0,
        }} />
        {agentCount > 0 && <span>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>}
        {agentCount > 0 && toolCount > 0 && <span style={{ color: '#5E6B7C' }}>{'\u00b7'}</span>}
        {toolCount > 0 && <span style={{ color: '#818CF8' }}>{toolCount} tool{toolCount !== 1 ? 's' : ''}</span>}
        {(agentCount > 0 || toolCount > 0) && totalTokens > 0 && <span style={{ color: '#5E6B7C' }}>{'\u00b7'}</span>}
        {totalTokens > 0 && <span>{(totalTokens / 1000).toFixed(1)}k tok</span>}
        {hadError && <><span style={{ color: '#5E6B7C' }}>{'\u00b7'}</span><span style={{ color: '#E8657A' }}>partial</span></>}
        {hadCloud && <CloudIcon size={14} />}
      </span>
    </div>
  );
}

export function MultiAgentOverlay({ events, active, collapsed, onToggleCollapsed }: MultiAgentOverlayProps) {
  // ALL hooks must be declared before any conditional returns
  const wrapperRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef(0);
  const springRef = useRef<SpringState>({ position: 0, velocity: 0 });
  const [spineBottom, setSpineBottom] = useState(0);
  const tickStatesRef = useRef<Map<number, TickState>>(new Map());
  const [, setFrame] = useState(0);
  const lastTimeRef = useRef(0);
  const lastNodeCountRef = useRef(0);
  const cascadeStartRef = useRef<number | null>(null);
  const [cascadeActive, setCascadeActive] = useState(false);
  const [capVisible, setCapVisible] = useState(false);
  const completionCountRef = useRef(0);
  const breathRef = useRef(0);
  const lastEventTimeRef = useRef(performance.now());

  const { nodes, phase, parallelGroups } = buildNodes(events);

  const lineHeight = 26;
  const spineX = 14;
  const tickLenBase = 12;
  const capLen = 5;
  const contentLeft = 48;
  const contentIndent = 20;
  const spineTop = 13;
  const targetBottom = spineTop + Math.max(0, nodes.length - 1) * lineHeight;

  // Init spring
  useEffect(() => {
    if (springRef.current.position === 0 && nodes.length > 0) {
      springRef.current.position = spineTop;
    }
  }, [nodes.length, spineTop]);

  // Trigger completion cascade — fires every time a new synthesis_completed arrives
  const currentCompletionCount = events.filter(e => e.type === 'synthesis_completed').length;
  useEffect(() => {
    if (currentCompletionCount > completionCountRef.current && currentCompletionCount > 0) {
      completionCountRef.current = currentCompletionCount;
      // Reset cascade state for re-fire
      cascadeStartRef.current = null;
      setCascadeActive(false);
      setCapVisible(false);
      // Delay cascade slightly so the last node settles first
      const timer = setTimeout(() => {
        cascadeStartRef.current = performance.now();
        setCascadeActive(true);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [currentCompletionCount]);

  // Detect when node count increases to know spine is idle vs extending
  useEffect(() => {
    if (nodes.length > lastNodeCountRef.current) {
      lastEventTimeRef.current = performance.now();
    }
    lastNodeCountRef.current = nodes.length;
  }, [nodes.length]);

  // ─── Main animation loop ────────────────────────────────────────────────
  const animate = useCallback((now: number) => {
    const dt = lastTimeRef.current ? Math.min((now - lastTimeRef.current) / 1000, 0.05) : 0.016;
    lastTimeRef.current = now;

    // Spring physics for spine
    const newSpring = springStep(springRef.current, targetBottom, dt);
    springRef.current = newSpring;
    setSpineBottom(newSpring.position);

    // Breathing — sine wave, only when spine is settled and not complete
    const timeSinceLastEvent = now - lastEventTimeRef.current;
    if (timeSinceLastEvent > 800 && phase !== 'complete') {
      breathRef.current = Math.sin(now / 1200) * 0.12; // ±12% opacity oscillation
    } else {
      breathRef.current *= 0.9; // decay breathing when events are active
    }

    // Collapse/expand animation — smooth approach toward target
    const cTarget = collapseTargetRef.current;
    const cCurrent = collapseProgressRef.current;
    if (Math.abs(cTarget - cCurrent) > 0.001) {
      const speed = cCurrent > 0.85 ? 0.03 : 0.04;
      collapseProgressRef.current += (cTarget - cCurrent) * speed;
      if (Math.abs(cTarget - collapseProgressRef.current) < 0.005) {
        collapseProgressRef.current = cTarget;
      }
      setCollapseProgress(collapseProgressRef.current);
    }

    // Per-tick animations
    const currentBottom = newSpring.position;
    let needsRender = false;

    for (let i = 0; i < nodes.length; i++) {
      const tickY = spineTop + i * lineHeight;
      let state = tickStatesRef.current.get(i);
      const node = nodes[i]!;

      if (currentBottom >= tickY - 1) {
        if (!state) {
          // First arrival
          state = {
            arrivedAt: now,
            tickProgress: 0,
            prevStatus: node.status,
            flashStart: 0,
            flashProgress: 0,
            rippleStart: now,
            rippleProgress: 0,
            cascadeFlash: 0,
          };
          tickStatesRef.current.set(i, state);
          needsRender = true;
        }

        // Tick extension: 350ms cubic ease-out
        if (state.tickProgress < 1) {
          const elapsed = now - state.arrivedAt;
          state.tickProgress = Math.min(1, elapsed / 350);
          state.tickProgress = 1 - Math.pow(1 - state.tickProgress, 3);
          needsRender = true;
        }

        // Arrival ripple: 500ms fade-out
        if (state.rippleProgress < 1) {
          const elapsed = now - state.rippleStart;
          state.rippleProgress = Math.min(1, elapsed / 500);
          needsRender = true;
        }

        // Status change flash detection
        if (state.prevStatus !== node.status) {
          state.flashStart = now;
          state.prevStatus = node.status;
          needsRender = true;
        }

        // Flash decay: 300ms
        if (state.flashStart > 0 && state.flashProgress < 1) {
          const elapsed = now - state.flashStart;
          state.flashProgress = Math.min(1, elapsed / 300);
          needsRender = true;
        } else if (state.flashStart > 0 && state.flashProgress >= 1) {
          state.flashStart = 0;
          state.flashProgress = 0;
        }
      }

      // Completion cascade
      if (cascadeActive && cascadeStartRef.current && state) {
        const cascadeDelay = i * 60; // 60ms stagger per node
        const elapsed = now - cascadeStartRef.current - cascadeDelay;
        if (elapsed > 0 && elapsed < 400) {
          state.cascadeFlash = 1 - Math.min(1, elapsed / 400);
          needsRender = true;
        } else if (elapsed >= 400) {
          state.cascadeFlash = 0;
        }

        // Show bottom cap after cascade finishes all nodes
        const totalCascadeTime = nodes.length * 60 + 400;
        if (now - cascadeStartRef.current > totalCascadeTime && !capVisible) {
          setCapVisible(true);
        }
      }
    }

    if (needsRender || breathRef.current !== 0) {
      setFrame(f => f + 1);
    }

    const isMoving = Math.abs(newSpring.velocity) > 0.1 || Math.abs(targetBottom - newSpring.position) > 0.5;
    const isCollapseAnimating = Math.abs(collapseTargetRef.current - collapseProgressRef.current) > 0.001;
    if (isMoving || active || needsRender || (phase !== 'complete') || cascadeActive || isCollapseAnimating) {
      animFrameRef.current = requestAnimationFrame(animate);
    }
  }, [targetBottom, active, nodes, phase, spineTop, lineHeight, cascadeActive, capVisible]);

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

  // Collapse animation state — driven by the animation loop, not CSS
  const collapseProgressRef = useRef(0); // 0 = fully expanded, 1 = fully collapsed
  const [collapseProgress, setCollapseProgress] = useState(0);
  const collapseTargetRef = useRef(0); // 0 or 1
  const isCollapsed = !!(collapsed && events.length > 0);

  // Update collapse target when prop changes
  useEffect(() => {
    collapseTargetRef.current = isCollapsed ? 1 : 0;
  }, [isCollapsed]);

  // Animate collapse progress in the main loop (handled below)

  const totalHeight = nodes.length * lineHeight + 20;
  const bracketColor = '#5E6B7C';
  const currentSpineBottom = Math.max(spineTop, spineBottom);
  const breath = breathRef.current;

  // Find most recently active node
  let activeNodeIndex = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i]!.status === 'active') { activeNodeIndex = i; break; }
  }

  // collapseProgress: 0 = fully expanded, 1 = fully collapsed
  const cp = collapseProgress;
  // Phase 1: 0→0.7 = inverse cascade (ticks retract bottom-to-top, spine shrinks)
  // Phase 2: 0.6→1.0 = top node fades, summary materializes (overlaps slightly with phase 1)
  const cascadeP = Math.min(1, cp / 0.7);
  const settleRaw = Math.max(0, (cp - 0.6) / 0.4);
  const settleP = 1 - Math.pow(1 - settleRaw, 2); // ease-out for smooth settle
  const fullyCollapsed = cp > 0.99;

  const fullHeight = totalHeight;
  const collapsedHeight = 34;
  const displayHeight = Math.round(fullHeight - (fullHeight - collapsedHeight) * cp);

  return (
    <div ref={wrapperRef} style={{
      position: 'relative',
      height: displayHeight,
      overflow: 'hidden',
    }}>
      {/* Summary text — delayed appearance, fades in after spine settles */}
      {settleP > 0.8 && events.length > 0 && (() => {
        const summaryP = Math.max(0, (settleP - 0.8) / 0.2);
        const summaryEased = 1 - Math.pow(1 - summaryP, 3); // cubic ease-out — slower settle
        return (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            opacity: summaryEased,
            transform: `translateX(${(1 - summaryEased) * -16}px)`,
            pointerEvents: summaryEased > 0.5 ? 'auto' : 'none',
          }}>
            <CollapsedBracket events={events} onExpand={onToggleCollapsed} />
          </div>
        );
      })()}

      {/* Full bracket — inverse cascade retraction, never unmounts to avoid layout snap */}
      <div style={{
        pointerEvents: fullyCollapsed ? 'none' : 'auto',
        maxWidth: 720,
        width: '100%',
        padding: '8px 0',
        fontFamily: "'DM Mono', monospace",
        fontSize: 11,
        letterSpacing: '0.04em',
        position: 'relative',
      }}>
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: contentLeft + 30, // extra for ripples
          height: totalHeight,
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        {/* ── Spine tension segments ── */}
        {/* Draw spine in segments with varying opacity based on nearby node status */}
        {nodes.map((node, i) => {
          if (i === 0) return null;
          const segTop = spineTop + (i - 1) * lineHeight;
          const segBottom = spineTop + i * lineHeight;
          if (currentSpineBottom < segTop) return null;
          const clippedBottom = Math.min(segBottom, currentSpineBottom);
          if (clippedBottom <= segTop) return null;

          // Tension: active segments brighter, completed dimmer
          const topNode = nodes[i - 1]!;
          const botNode = nodes[i]!;
          const hasActive = topNode.status === 'active' || botNode.status === 'active';
          const bothComplete = topNode.status === 'complete' && botNode.status === 'complete';
          const segOpacity = hasActive ? 0.55 + breath : bothComplete ? 0.25 : 0.4 + breath * 0.5;

          // Spine retracts from bottom during collapse — first segment persists through phase 2
          const isFirstSeg = i === 1;
          const spineRetract = isFirstSeg
            ? settleP // first segment fades with the summary entrance
            : cascadeP * (i / Math.max(1, nodes.length - 1));
          const segVisibility = 1 - Math.max(0, Math.min(1, isFirstSeg ? spineRetract : spineRetract * 2));
          if (segVisibility <= 0) return null;

          return (
            <line
              key={`seg-${i}`}
              x1={spineX} y1={segTop}
              x2={spineX} y2={clippedBottom}
              stroke={bracketColor}
              strokeWidth={1}
              opacity={segOpacity * segVisibility}
            />
          );
        })}

        {/* First segment from spineTop to first node (if only 1 node, draw full) */}
        {nodes.length === 1 && currentSpineBottom > spineTop && (
          <line
            x1={spineX} y1={spineTop} x2={spineX} y2={currentSpineBottom}
            stroke={bracketColor} strokeWidth={1} opacity={0.4 + breath}
          />
        )}

        {/* Active node glow segment */}
        {activeNodeIndex >= 0 && (
          <line
            x1={spineX}
            y1={Math.max(spineTop, spineTop + activeNodeIndex * lineHeight - 18)}
            x2={spineX}
            y2={Math.min(currentSpineBottom, spineTop + activeNodeIndex * lineHeight + 18)}
            stroke={dotColor(nodes[activeNodeIndex]!)}
            strokeWidth={1.5}
            opacity={0.2 + Math.abs(breath) * 0.5}
          />
        )}

        <g stroke={bracketColor} strokeWidth={1}>
          {/* Top cap — persists through phase 1, fades during phase 2 as summary takes over */}
          {currentSpineBottom > spineTop && (
            <line x1={spineX} y1={spineTop} x2={spineX + capLen} y2={spineTop} opacity={0.4 * (1 - settleP * 0.7)} />
          )}

          {/* Bottom cap — only after completion cascade */}
          {capVisible && (
            <line x1={spineX} y1={currentSpineBottom} x2={spineX + capLen} y2={currentSpineBottom} opacity={0.4} />
          )}

          {/* Ticks — retract bottom-to-top during collapse */}
          {nodes.map((node, i) => {
            const state = tickStatesRef.current.get(i);
            if (!state || state.tickProgress <= 0) return null;
            const tickY = spineTop + i * lineHeight;

            // Collapse retraction: bottom ticks retract first, top node stays for phase 2
            const reverseIdx = nodes.length - 1 - i;
            const retractStart = i === 0 ? 0.9 : reverseIdx / Math.max(1, nodes.length); // first node retracts last
            const retractProgress = Math.max(0, Math.min(1, (cascadeP - retractStart * 0.7) / 0.3));
            const retractEased = retractProgress * retractProgress;
            const tickScale = 1 - retractEased;

            if (tickScale <= 0) return null;

            // Base tick opacity + cascade flash + status-change flash
            const flashBrightness = state.flashStart > 0 ? (1 - state.flashProgress) * 0.6 : 0;
            const cascadeBrightness = state.cascadeFlash * 0.5;
            const tickOpacity = (0.4 + flashBrightness + cascadeBrightness) * tickScale;

            return (
              <line
                key={`tick-${i}`}
                x1={spineX} y1={tickY}
                x2={spineX + tickLenBase * state.tickProgress * tickScale} y2={tickY}
                opacity={tickOpacity}
                stroke={flashBrightness > 0.1 || cascadeBrightness > 0.1
                  ? dotColor(node)
                  : bracketColor}
              />
            );
          })}
        </g>

        {/* ── Arrival ripples ── */}
        {nodes.map((node, i) => {
          const state = tickStatesRef.current.get(i);
          if (!state || state.rippleProgress >= 1) return null;
          const tickY = spineTop + i * lineHeight;
          const tLen = tickLenBase;
          const rippleLen = tLen * 2.5;
          const rippleOpacity = (1 - state.rippleProgress) * 0.3;
          const rippleExtend = state.rippleProgress;

          return (
            <line
              key={`ripple-${i}`}
              x1={spineX + tLen}
              y1={tickY}
              x2={spineX + tLen + (rippleLen - tLen) * rippleExtend}
              y2={tickY}
              stroke={bracketColor}
              strokeWidth={1}
              opacity={rippleOpacity}
            />
          );
        })}

        {/* ── Parallel connector lines ── */}
        {parallelGroups.map((group, gi) => {
          const firstIdx = group[0]!;
          const lastIdx = group[group.length - 1]!;
          const firstState = tickStatesRef.current.get(firstIdx);
          const lastState = tickStatesRef.current.get(lastIdx);
          if (!firstState || !lastState || firstState.tickProgress < 0.5) return null;

          const y1 = spineTop + firstIdx * lineHeight;
          const y2 = spineTop + lastIdx * lineHeight;
          const x = spineX + tickLenBase + 6;
          const connectorOpacity = Math.min(firstState.tickProgress, lastState.tickProgress) * 0.25;

          return (
            <g key={`par-${gi}`} opacity={connectorOpacity}>
              {/* Vertical dashed connector */}
              <line
                x1={x} y1={y1} x2={x} y2={y2}
                stroke={bracketColor}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {/* Small horizontal hooks at each end */}
              {group.map(idx => {
                const y = spineTop + idx * lineHeight;
                return (
                  <line
                    key={`hook-${idx}`}
                    x1={spineX + tickLenBase} y1={y}
                    x2={x} y2={y}
                    stroke={bracketColor} strokeWidth={1}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Content nodes */}
      <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: contentLeft }}>
        {nodes.map((node, i) => {
          const state = tickStatesRef.current.get(i);
          const tickProgress = state?.tickProgress ?? 0;
          const arrivedAt = state?.arrivedAt ?? 0;
          const flashBrightness = state?.flashStart
            ? (1 - (state.flashProgress ?? 0)) : 0;
          const cascadeBrightness = state?.cascadeFlash ?? 0;

          // Collapse fade: bottom nodes fade first, top node fades during phase 2
          const reverseIdx = nodes.length - 1 - i;
          const fadeStart = i === 0 ? 0.9 : reverseIdx / Math.max(1, nodes.length);
          const fadeProg = i === 0
            ? settleP // first node fades as summary slides in
            : Math.max(0, Math.min(1, (cascadeP - fadeStart * 0.7) / 0.3));
          const collapseOpacity = 1 - fadeProg;

          const dotOpacity = (tickProgress > 0 ? Math.min(1, tickProgress * 3) : 0) * collapseOpacity;
          const now = performance.now();
          const textDelay = arrivedAt > 0 ? Math.min(1, Math.max(0, (now - arrivedAt - 150) / 250)) : 0;
          const textOpacity = (tickProgress > 0.3 ? textDelay : 0) * collapseOpacity;

          const isActiveNode = i === activeNodeIndex;

          // Flash glow on status change or cascade
          const glowIntensity = Math.max(flashBrightness, cascadeBrightness);

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
                  boxShadow: (isActiveNode && node.status === 'active') || glowIntensity > 0.1
                    ? `0 0 ${6 + glowIntensity * 8}px ${dotColor(node)}${Math.round((0.25 + glowIntensity * 0.4) * 255).toString(16).padStart(2, '0')}, 0 0 ${12 + glowIntensity * 12}px ${dotColor(node)}${Math.round((0.12 + glowIntensity * 0.2) * 255).toString(16).padStart(2, '0')}`
                    : 'none',
                  transition: 'box-shadow 200ms ease',
                }}
              />

              {/* Cloud icon */}
              {node.isCloud && (
                <span style={{ opacity: dotOpacity, transition: 'opacity 200ms ease' }}>
                  <CloudIcon size={14} />
                </span>
              )}

              {/* Label — subtasks indented to align with extended ticks */}
              <span
                style={{
                  color: node.status === 'error' ? '#E8657A'
                    : node.tier === 2 ? (node.status === 'complete' ? '#5E6B7C' : '#818CF8')
                    : node.tier === 3 ? '#5E6B7C'
                    : node.tier === 4 ? (node.status === 'complete' ? '#6ECFA3' : '#EDDD52')
                    : node.status === 'complete' ? '#A8B4C0'
                    : '#EEF1F4',
                  fontSize: (node.tier === 2 || node.tier === 3) ? 10 : 12,
                  paddingLeft: (node.tier === 2 || node.tier === 3) ? contentIndent : 0,
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

              {/* Collapse chevron — inline with first node */}
              {i === 0 && !active && onToggleCollapsed && cp < 0.1 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleCollapsed(); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    color: '#5E6B7C',
                    display: 'flex',
                    alignItems: 'center',
                    marginLeft: 'auto',
                    opacity: textOpacity,
                    transition: 'color 200ms ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#A8B4C0')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#5E6B7C')}
                  title="Collapse"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
