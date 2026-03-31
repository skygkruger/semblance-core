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
}

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

  const measure = useCallback(() => {
    const content = contentRef.current;
    const wrapper = wrapperRef.current;
    if (!content || !wrapper) return;

    // Find all card-like elements anywhere inside, not just direct children
    const cards = Array.from(content.querySelectorAll('.card, .surface-void, .surface-slate, .skeleton-card')) as HTMLElement[];
    // Deduplicate: only keep outermost cards (skip cards nested inside other cards)
    const topCards = cards.filter(card => !cards.some(other => other !== card && other.contains(card)));

    if (topCards.length === 0) {
      setTicks([]);
      setSpineHeight(0);
      return;
    }

    const contentRect = content.getBoundingClientRect();
    const mainEl = wrapper.closest('main');
    const mainLeft = mainEl ? mainEl.getBoundingClientRect().left : contentRect.left;
    const gutterCenter = (contentRect.left - mainLeft) / 2;
    setSpineX(mainLeft - contentRect.left + gutterCenter);
    setContentHeight(contentRect.height);

    const positions: TickPosition[] = [];
    for (const card of topCards) {
      const cardRect = card.getBoundingClientRect();
      const centerY = cardRect.top - contentRect.top + cardRect.height / 2;
      positions.push({ y: centerY });
    }

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
    const start = performance.now();
    const duration = 2500; // longer than page dissolve so brackets draw slowly
    const tick = () => {
      measure();
      const elapsed = performance.now() - start;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDrawProgress(eased);
      if (p < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);

    const hasResizeObserver = typeof ResizeObserver !== 'undefined';
    const observer = hasResizeObserver ? new ResizeObserver(() => requestAnimationFrame(measure)) : null;
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
  }, [children, measure]);

  const capLen = 6;
  const tickLen = 16;
  const p = drawProgress;

  // Spine: 0-70%, leaving 30% for outermost ticks to extend
  const spineP = Math.min(1, p / 0.7);
  const spineMid = spineTop + spineHeight / 2;
  const animSpineTop = spineMid - (spineHeight / 2) * spineP;
  const animSpineBottom = spineMid + (spineHeight / 2) * spineP;

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
              if (tick.y < animSpineTop || tick.y > animSpineBottom) return null;
              // Tick starts when spine reaches it (at p * 0.7), takes 0.3 to fully extend
              const halfSpine = spineHeight / 2;
              const reachFraction = halfSpine > 0 ? tick.distFromCenter / halfSpine : 0;
              const tickStartP = reachFraction * 0.7; // spine finishes at p=0.7
              const tickLocalP = Math.max(0, Math.min(1, (p - tickStartP) / 0.3));
              if (tickLocalP <= 0) return null;
              const easedTickP = 1 - Math.pow(1 - tickLocalP, 3);
              return <line key={tick.i} x1={spineX} y1={tick.y} x2={spineX + tickLen * easedTickP} y2={tick.y} />;
            })}
          </g>
        </svg>
      )}

      <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap }}>
        {children}
      </div>
    </div>
  );
}
