/**
 * ContentBracket — Reactive bracket glyph centered in the dead space
 * between the sidebar and content area.
 */

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';

interface ContentBracketProps {
  children: ReactNode;
  color?: string;
  /** Gap between sections */
  gap?: number;
}

interface TickPosition {
  y: number;
  tier: number; // 1=page title (longest), 2=sub-header, 3=container edge, 4=section, 5=input, 6=card
}

const TIER_TICK_LENGTHS: Record<number, number> = {
  0: 192, // globe — 4x page title, reaches across the gutter
  1: 48, // page title — longest, reaches toward the heading
  2: 32, // shimmer description + sub headers (h2/h3)
  3: 18, // container edges
  4: 32, // section banners (bracket-section) — same as sub headers
  5: 10, // inputs
  6: 10, // cards
};

// Hierarchy selectors — order matters for tier assignment
const HIERARCHY = [
  { selector: '.wireframe-globe', tier: 0 },
  { selector: '.page-title', tier: 1 },
  { selector: '.shimmer-desc', tier: 2 },
  { selector: '.cloud-bridge__shimmer-desc', tier: 2 },
  { selector: '.surface-opal', tier: 3 },
  { selector: '.surface-cloud', tier: 3 },
  { selector: '.surface-void:not([data-identity])', tier: 3 },
  { selector: '.settings-screen', tier: 3 },
  // connections-screen excluded — tracked via individual cards + section headers
  { selector: '.bracket-section', tier: 4 },
  { selector: '.input-wrapper', tier: 5 },
  { selector: '.quick-capture__container', tier: 5 },
  { selector: '.card', tier: 3 },
  { selector: '.surface-slate', tier: 3 },
  { selector: '.skeleton-card', tier: 3 },
];

export function ContentBracket({
  children,
  color = '#5E6B7C',
  gap = 24,
}: ContentBracketProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [ticks, setTicks] = useState<TickPosition[]>([]);
  const [spineTop, setSpineTop] = useState(0);
  const [spineHeight, setSpineHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [spineX, setSpineX] = useState(0);
  const animFrameRef = useRef(0);
  const [drawProgress, setDrawProgress] = useState(0);
  const [initialDrawDone, setInitialDrawDone] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [postDrawHold, setPostDrawHold] = useState(false);
  const measureTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const measure = useCallback(() => {
    const content = contentRef.current;
    const wrapper = wrapperRef.current;
    if (!content || !wrapper) return;

    // Find all hierarchy elements — no dedup, every element gets a tick
    const found = new Map<HTMLElement, number>(); // element → tier
    for (const { selector, tier } of HIERARCHY) {
      for (const el of Array.from(content.querySelectorAll(selector)) as HTMLElement[]) {
        // Only set tier if not already found at a higher (lower number) tier
        if (!found.has(el) || found.get(el)! > tier) {
          found.set(el, tier);
        }
      }
    }
    // Also check the wrapper's siblings (page-title, shimmer-desc are outside contentRef but inside the bracket)
    const wrapperParent = wrapper;
    for (const { selector, tier } of HIERARCHY) {
      for (const el of Array.from(wrapperParent.querySelectorAll(`:scope > ${selector}`)) as HTMLElement[]) {
        if (!found.has(el) || found.get(el)! > tier) {
          found.set(el, tier);
        }
      }
    }

    const elements = Array.from(found.entries());
    if (elements.length === 0) {
      setTicks([]);
      setSpineHeight(0);
      return;
    }

    const contentRect = content.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const mainEl = wrapper.closest('main');
    const mainLeft = mainEl ? mainEl.getBoundingClientRect().left : wrapperRect.left;
    // Find the leftmost visible content edge for gutter calculation
    const firstVisible = elements.length > 0 ? elements[0]![0] : null;
    const contentLeftEdge = firstVisible ? firstVisible.getBoundingClientRect().left : contentRect.left;
    const gutterCenter = (contentLeftEdge - mainLeft) / 2;
    setSpineX(mainLeft - wrapperRect.left + gutterCenter);
    setContentHeight(wrapperRect.height);

    // For container edges (tier 3), create TWO ticks: top and bottom of the container
    const positions: TickPosition[] = [];
    for (const [el, tier] of elements) {
      const elRect = el.getBoundingClientRect();
      if (tier === 3) {
        // Top edge and bottom edge of the container
        positions.push({ y: elRect.top - wrapperRect.top, tier });
        positions.push({ y: elRect.bottom - wrapperRect.top, tier });
      } else {
        // Center of element
        const centerY = elRect.top - wrapperRect.top + elRect.height / 2;
        positions.push({ y: centerY, tier });
      }
    }

    // Sort by Y position
    positions.sort((a, b) => a.y - b.y);

    if (positions.length > 0) {
      setSpineTop(positions[0]!.y);
      setSpineHeight(positions[positions.length - 1]!.y - positions[0]!.y);
    }

    setTicks(positions);
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    setDrawProgress(0);
    setInitialDrawDone(false);
    const start = performance.now();
    const duration = 3200;
    const tick = () => {
      measure();
      const elapsed = performance.now() - start;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 2);
      setDrawProgress(eased);
      if (p >= 1 && !initialDrawDone) {
        setInitialDrawDone(true);
        setPostDrawHold(true);
        setTimeout(() => setPostDrawHold(false), 1000);
      }
      if (p < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);

    const hasResizeObserver = typeof ResizeObserver !== 'undefined';
    const observer = hasResizeObserver ? new ResizeObserver(() => {
      requestAnimationFrame(measure);
      // Show measurements during adjustment
      setMeasuring(true);
      if (measureTimerRef.current) clearTimeout(measureTimerRef.current);
      measureTimerRef.current = setTimeout(() => setMeasuring(false), 2000);
    }) : null;
    if (observer) observer.observe(content);
    if (observer) {
      for (const child of Array.from(content.children)) {
        observer.observe(child);
      }
    }

    const mutationObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => requestAnimationFrame(measure))
      : null;
    if (mutationObserver) mutationObserver.observe(content, { childList: true, subtree: true });

    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (observer) observer.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]); // eslint-disable-line react-hooks/exhaustive-deps — only restart on mount, not re-renders

  const capLen = 6;
  const p = drawProgress;

  // Spine: full duration, same as StaticBracket
  const spineMid = spineTop + spineHeight / 2;
  const animSpineTop = spineMid - (spineHeight / 2) * p;
  const animSpineBottom = spineMid + (spineHeight / 2) * p;

  // Caps: last 20% (same as StaticBracket)
  const capP = Math.max(0, (p - 0.8) / 0.2);

  // Ticks: staggered from center outward, each takes 20% to extend
  const sortedTicks = ticks.map((tick, i) => ({
    ...tick, i, distFromCenter: Math.abs(tick.y - spineMid),
  })).sort((a, b) => a.distFromCenter - b.distFromCenter);

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {ticks.length > 1 && spineHeight > 0 && p > 0 && (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: contentHeight,
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <g stroke={color} strokeWidth={1} opacity={0.4 * Math.min(1, p * 2)}>
            {/* Vertical spine — grows from center outward */}
            <line x1={spineX} y1={animSpineTop} x2={spineX} y2={animSpineBottom} />

            {/* Top cap */}
            {capP > 0 && <line x1={spineX} y1={animSpineTop} x2={spineX + capLen * capP} y2={animSpineTop} />}

            {/* Bottom cap */}
            {capP > 0 && <line x1={spineX} y1={animSpineBottom} x2={spineX + capLen * capP} y2={animSpineBottom} />}

            {/* Horizontal ticks — draw sequentially from center outward */}
            {sortedTicks.map((tick) => {
              const halfSpine = spineHeight / 2;
              const reachFraction = halfSpine > 0 ? tick.distFromCenter / halfSpine : 0;
              const tickStartP = reachFraction * 0.7;
              // Longer ticks take proportionally more time to extend
              const tickLength = TIER_TICK_LENGTHS[tick.tier] ?? 8;
              const extensionDuration = 0.3 + (tickLength / 192) * 0.4; // 0.3 for shortest, 0.7 for globe
              const tickLocalP = Math.max(0, Math.min(1, (p - tickStartP) / extensionDuration));
              if (tickLocalP <= 0) return null;
              // Fade in: 0 opacity until spine is near, then ramp up smoothly
              const spineDistToTick = Math.min(
                Math.abs(tick.y - animSpineTop),
                Math.abs(tick.y - animSpineBottom)
              );
              const nearSpine = tick.y >= animSpineTop && tick.y <= animSpineBottom;
              const tickOpacity = nearSpine ? 1 : Math.max(0, 1 - spineDistToTick / 20);
              const easedTickP = 1 - Math.pow(1 - tickLocalP, 2);
              const tickLen = TIER_TICK_LENGTHS[tick.tier] ?? 8;
              return <line key={tick.i} x1={spineX} y1={tick.y} x2={spineX + tickLen * easedTickP} y2={tick.y} opacity={tickOpacity} />;
            })}
          </g>

          {/* Segment measurements — count up as spine draws, fade on resize */}
          {ticks.length > 1 && ticks.map((tick, i) => {
            if (i === 0) return null;
            const prevTick = ticks[i - 1]!;
            const segTop = prevTick.y;
            const segBottom = tick.y;
            const segHeight = Math.round(segBottom - segTop);
            if (segHeight <= 0) return null;

            // How much of this segment has the spine covered?
            const coveredTop = Math.max(segTop, animSpineTop);
            const coveredBottom = Math.min(segBottom, animSpineBottom);
            const coveredHeight = Math.max(0, coveredBottom - coveredTop);
            const segProgress = coveredHeight / (segBottom - segTop);

            // Current displayed value counts up
            const displayValue = Math.round(segHeight * segProgress);
            const segMidY = (coveredTop + coveredBottom) / 2;

            let labelOpacity: number;
            if (!initialDrawDone) {
              labelOpacity = segProgress > 0.05 ? Math.min(1, segProgress * 2) : 0;
            } else {
              labelOpacity = (measuring || postDrawHold) ? 1 : 0;
            }

            if (labelOpacity <= 0 && initialDrawDone && !measuring) {
              // Keep element in DOM for transition
            }

            return (
              <text
                key={`m-${i}`}
                x={spineX - 8}
                y={initialDrawDone ? (segTop + segBottom) / 2 : segMidY}
                textAnchor="end"
                dominantBaseline="central"
                fill={color}
                fontSize={9}
                fontFamily="'DM Mono', monospace"
                letterSpacing="0.04em"
                opacity={labelOpacity * 0.5}
                style={{
                  transition: initialDrawDone
                    ? measuring ? 'opacity 350ms ease' : 'opacity 700ms ease'
                    : 'none',
                }}
              >
                {initialDrawDone ? segHeight : displayValue}px
              </text>
            );
          })}
          </svg>
      )}

      <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap }}>
        {children}
      </div>
    </div>
  );
}
