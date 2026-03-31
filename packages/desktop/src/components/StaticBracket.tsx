/**
 * StaticBracket — A simple { curly bracket in the left gutter,
 * matching the ContentBracket styling. For pages with static content
 * that doesn't expand or change.
 *
 * Measures the full height of its children and draws a single
 * curly bracket centered in the dead space.
 */

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';

interface StaticBracketProps {
  children: ReactNode;
  color?: string;
}

export function StaticBracket({
  children,
  color = '#5E6B7C',
}: StaticBracketProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [spineX, setSpineX] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [topY, setTopY] = useState(0);
  const [bottomY, setBottomY] = useState(0);
  const animFrameRef = useRef(0);
  const [drawProgress, setDrawProgress] = useState(0);

  const measure = useCallback(() => {
    const content = contentRef.current;
    const wrapper = wrapperRef.current;
    if (!content || !wrapper) return;

    const contentRect = content.getBoundingClientRect();
    const mainEl = wrapper.closest('main');
    const mainLeft = mainEl ? mainEl.getBoundingClientRect().left : contentRect.left;

    // Find card-like elements for bracket extent and gutter calculation
    const cards = Array.from(content.querySelectorAll('.card, .surface-void, .surface-slate, .skeleton-card')) as HTMLElement[];
    const topCards = cards.filter(card => !cards.some(other => other !== card && other.contains(card)));

    // Center spine between main left edge and the actual card's left edge
    const cardLeft = topCards.length > 0 ? topCards[0]!.getBoundingClientRect().left : contentRect.left;
    const gutterCenter = (cardLeft - mainLeft) / 2;

    setSpineX(mainLeft - contentRect.left + gutterCenter);
    setContentHeight(contentRect.height);

    if (topCards.length > 0) {
      // Sort by vertical position to find true first and last
      const sorted = [...topCards].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const firstRect = sorted[0]!.getBoundingClientRect();
      // Find the card with the lowest bottom edge
      const bottommost = sorted.reduce((max, el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > max.bottom ? r : max;
      }, sorted[0]!.getBoundingClientRect());
      setTopY(firstRect.top - contentRect.top);
      setBottomY(bottommost.bottom - contentRect.top);
    } else {
      setTopY(0);
      setBottomY(contentRect.height);
    }
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    // Animate bracket drawing in sync with page dissolve (1.58s total)
    setDrawProgress(0);
    const start = performance.now();
    const duration = 2500; // matches ContentBracket
    const tick = () => {
      measure();
      const elapsed = performance.now() - start;
      const p = Math.min(1, elapsed / duration);
      // Ease-out curve matching page dissolve
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

    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children, measure]);

  const fullMidY = (topY + bottomY) / 2;
  const capLen = 16;
  const indentLen = 10;

  // Animated bracket: grows from midpoint outward
  const p = drawProgress;
  const halfSpan = (bottomY - topY) / 2;
  const animTop = fullMidY - halfSpan * p;
  const animBottom = fullMidY + halfSpan * p;
  const midY = fullMidY;
  const capProgress = Math.max(0, (p - 0.8) / 0.2); // caps draw in last 20%
  const indentProgress = Math.max(0, Math.min(1, (p - 0.3) / 0.4)); // indent draws 30-70%

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {contentHeight > 0 && p > 0 && (
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
          <g stroke={color} strokeWidth={1} fill="none" opacity={0.4 * Math.min(1, p * 2)}>
            {/* Top cap — draws in last 20% */}
            {capProgress > 0 && <line x1={spineX} y1={animTop} x2={spineX + capLen * capProgress} y2={animTop} />}

            {/* Top arm — grows from mid upward */}
            <line x1={spineX} y1={animTop} x2={spineX} y2={midY - indentLen * indentProgress} />

            {/* Indent tip — draws 30-70% */}
            {indentProgress > 0 && <>
              <line x1={spineX} y1={midY - indentLen * indentProgress} x2={spineX + indentLen * indentProgress} y2={midY} />
              <line x1={spineX + indentLen * indentProgress} y1={midY} x2={spineX} y2={midY + indentLen * indentProgress} />
            </>}

            {/* Bottom arm — grows from mid downward */}
            <line x1={spineX} y1={midY + indentLen * indentProgress} x2={spineX} y2={animBottom} />

            {/* Bottom cap — draws in last 20% */}
            {capProgress > 0 && <line x1={spineX} y1={animBottom} x2={spineX + capLen * capProgress} y2={animBottom} />}
          </g>
        </svg>
      )}

      <div ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
