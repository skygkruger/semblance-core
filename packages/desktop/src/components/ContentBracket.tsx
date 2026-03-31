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

    // Delay first measure to let layout settle
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(measure);
    });

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
      cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children, measure]);

  const capLen = 6;
  const tickLen = 16;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {ticks.length > 1 && spineHeight > 0 && (
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
          <g stroke={color} strokeWidth={1} opacity={0.4}>
            {/* Vertical spine */}
            <line x1={spineX} y1={spineTop} x2={spineX} y2={spineTop + spineHeight} />

            {/* Top cap */}
            <line x1={spineX} y1={spineTop} x2={spineX + capLen} y2={spineTop} />

            {/* Bottom cap */}
            <line x1={spineX} y1={spineTop + spineHeight} x2={spineX + capLen} y2={spineTop + spineHeight} />

            {/* Horizontal ticks */}
            {ticks.map((tick, i) => (
              <line key={i} x1={spineX} y1={tick.y} x2={spineX + tickLen} y2={tick.y} />
            ))}
          </g>
        </svg>
      )}

      <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap }}>
        {children}
      </div>
    </div>
  );
}
