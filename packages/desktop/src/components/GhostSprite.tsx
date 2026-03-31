/**
 * GhostSprite — Pixel art ghost that lives in the right gutter.
 * Mirrors the bracket positioning on the left side.
 * Shows contextual page insights via speech bubble.
 */

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';

interface GhostSpriteProps {
  /** Insight text to show in speech bubble. Null = idle (no bubble). */
  insight?: string | null;
  /** Whether the sprite is visible */
  visible?: boolean;
  children: ReactNode;
}

// 14x22 cyber ghost — v3 hooded head (the one you liked) + wavy bottom + wisps
const GHOST_PIXELS = [
  '00000111100000',  // 0  - top of hood
  '00011111111000',  // 1
  '00111111111100',  // 2
  '01111111111110',  // 3
  '01111111111110',  // 4
  '01100111100110',  // 5  - eyes (middle filled in)
  '01100111100110',  // 6  - eyes
  '01111111111110',  // 7
  '01111001111110',  // 8  - mouth
  '00111111111100',  // 9
  '00011111111000',  // 10
  '00011111111000',  // 11
  '00011011011000',  // 12 - wavy scallop
  '00010010010000',  // 13 - drips
  '00010010010000',  // 14 - wisps start, 3 drips
  '00100010001000',  // 15 - fanning out
  '00010001010000',  // 16
  '01000010000100',  // 17 - wider scatter
  '00010000010000',  // 18
  '00001001000010',  // 19 - widest
  '01000000010000',  // 20
  '00000100000100',  // 21 - fading
];

const PIXEL_SIZE = 3.5;
const GHOST_W = 14 * PIXEL_SIZE;
const GHOST_H = 22 * PIXEL_SIZE;

function GhostCanvas({ hover, mouseX, mouseY }: { hover: boolean; mouseX: number; mouseY: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const time = performance.now() / 1000;
    ctx.clearRect(0, 0, GHOST_W, GHOST_H);

    // Calculate eye offset from cursor position relative to canvas center
    const canvasRect = canvas.getBoundingClientRect();
    const ghostCenterX = canvasRect.left + GHOST_W / 2;
    const ghostCenterY = canvasRect.top + GHOST_H * 0.3; // eyes are in upper third
    const dx = mouseX - ghostCenterX;
    const dy = mouseY - ghostCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxOffset = 1; // max 1 pixel offset
    const eyeOffsetX = dist > 0 ? Math.round((dx / dist) * maxOffset) : 0;
    const eyeOffsetY = dist > 0 ? Math.round((dy / dist) * maxOffset) : 0;

    for (let y = 0; y < GHOST_PIXELS.length; y++) {
      const row = GHOST_PIXELS[y]!;
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '1') {
          const isEye = false; // eyes rendered separately as tracked pupils
          // Trailing wisps: bottom 8 rows
          const isWisp = y >= 14;

          let alpha: number;
          if (isEye) {
            // Eyes pulse with a slower rhythm
            alpha = 0.6 + 0.2 * Math.sin(time * 2.0);
          } else if (isWisp) {
            // Wisps — dense, pronounced, staggered flicker
            // Upward flowing wisps — single wave traveling up (negative y direction)
            const wavePos = (time * 3) + y * 1.2; // moves up over time
            const wave = Math.sin(wavePos + x * 0.5); // slight x variation
            // Fade out further from body
            const distFromBody = y - 14;
            const distFade = Math.max(0, 1 - distFromBody * 0.12);
            alpha = wave > 0 ? (0.15 + 0.2 * wave) * distFade : 0.02 * distFade;
          } else {
            // Body breathes
            const breath = 0.3 + 0.08 * Math.sin(time * 1.5 + y * 0.3 + x * 0.2);
            alpha = hover ? breath + 0.15 : breath;
          }

          if (alpha <= 0) continue;

          if (isEye) {
            // Dim socket glow
            ctx.fillStyle = `rgba(110, 207, 163, ${alpha * 0.6})`;
          } else if (isWisp) {
            // Wisps shift between teal and silver
            const tealMix = 0.3 + 0.3 * Math.sin(time * 2 + x);
            const r = Math.round(154 * (1 - tealMix) + 110 * tealMix);
            const g = Math.round(168 * (1 - tealMix) + 207 * tealMix);
            const b = Math.round(184 * (1 - tealMix) + 163 * tealMix);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          } else {
            ctx.fillStyle = `rgba(154, 168, 184, ${alpha})`;
          }
          ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      }
    }

    // Draw tracked pupils — 1 pixel per eye, moves to corner of its 2x2 socket
    const pupilAlpha = 0.7 + 0.2 * Math.sin(time * 2.0);
    // Map cursor direction to socket corner: left/right = x, up/down = y
    const px = dx > 0 ? 1 : 0;  // 0 = left column, 1 = right column
    const py = dy > 0 ? 1 : 0;  // 0 = top row, 1 = bottom row
    const pupils = [
      { x: 3 + px, y: 5 + py },  // left eye socket: cols 3-4, rows 5-6
      { x: 9 + px, y: 5 + py },  // right eye socket: cols 9-10, rows 5-6
    ];
    for (const p of pupils) {
      if (p.x >= 0 && p.x < 14 && p.y >= 0 && p.y < 22) {
        ctx.fillStyle = `rgba(110, 207, 163, ${pupilAlpha})`;
        ctx.fillRect(p.x * PIXEL_SIZE, p.y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }
    }

    frameRef.current = requestAnimationFrame(draw);
  }, [hover, mouseX, mouseY]);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={GHOST_W}
      height={GHOST_H}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export function GhostSprite({
  insight = null,
  visible = true,
  children,
}: GhostSpriteProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [spriteX, setSpriteX] = useState(0);
  const [spriteY, setSpriteY] = useState(120);
  const [contentHeight, setContentHeight] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [spawned, setSpawned] = useState(false);
  const [idleFaded, setIdleFaded] = useState(false);
  const [gutterHover, setGutterHover] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const measure = useCallback(() => {
    const content = contentRef.current;
    const wrapper = wrapperRef.current;
    if (!content || !wrapper) return;

    const contentRect = content.getBoundingClientRect();
    const mainEl = wrapper.closest('main');
    if (!mainEl) return;

    const mainRect = mainEl.getBoundingClientRect();
    const rightEdge = contentRect.right - wrapperRef.current!.getBoundingClientRect().left;
    const mainRight = mainRect.right - wrapperRef.current!.getBoundingClientRect().left;
    const gutterCenter = rightEdge + (mainRight - rightEdge) / 2;

    setSpriteX(gutterCenter - GHOST_W / 2);
    // Vertically center relative to the visible viewport, not the content
    const mainHeight = mainRect.height;
    setSpriteY((mainHeight / 2) - GHOST_H / 2);
    setContentHeight(Math.max(contentRect.height, mainHeight));
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => requestAnimationFrame(measure))
      : null;
    if (observer) observer.observe(content);
    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children, measure]);

  // Track mouse globally for eye following + gutter detection
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      // Detect if cursor is in the right gutter area
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const mainEl = wrapper.closest('main');
      if (!mainEl) return;
      const mainRect = mainEl.getBoundingClientRect();
      const contentRect = contentRef.current?.getBoundingClientRect();
      if (!contentRect) return;
      const inRightGutter = e.clientX > contentRect.right && e.clientX < mainRect.right;
      setGutterHover(inRightGutter);
    };
    window.addEventListener('mousemove', handleMouse, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  // Spawn after 5s delay on page load, reset on page change
  useEffect(() => {
    setSpawned(false);
    setIdleFaded(false);
    setShowBubble(false);
    setPulsing(false);
    const spawnTimer = setTimeout(() => setSpawned(true), 5000);
    return () => clearTimeout(spawnTimer);
  }, [insight]);

  // Idle fade after 10s of being visible (reset on interaction)
  useEffect(() => {
    if (!spawned || showBubble || hovering || gutterHover) {
      // Active — cancel idle timer and stay visible
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (idleFaded) setIdleFaded(false);
      return;
    }
    idleTimerRef.current = setTimeout(() => setIdleFaded(true), 10000);
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [spawned, showBubble, hovering, gutterHover, idleFaded]);

  // Auto-dismiss bubble after 8s
  useEffect(() => {
    if (!showBubble) return;
    const timer = setTimeout(() => setShowBubble(false), 8000);
    return () => clearTimeout(timer);
  }, [showBubble]);

  // Click handler — pulse then show bubble
  const handleClick = useCallback(() => {
    if (showBubble) {
      // Click again to dismiss
      setShowBubble(false);
      return;
    }
    // Trigger sonar pulse
    setPulsing(true);
    setTimeout(() => setPulsing(false), 600);
    // Show bubble after pulse completes
    if (insight) {
      setTimeout(() => setShowBubble(true), 400);
    }
  }, [insight, showBubble]);

  if (!visible) return <div ref={contentRef}>{children}</div>;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Ghost sprite in right gutter */}
      <div
        style={{
          position: 'absolute',
          left: spriteX,
          top: spriteY,
          zIndex: 5,
          pointerEvents: spawned ? 'auto' : 'none',
          cursor: 'pointer',
          transition: 'top 500ms ease-out, opacity 2s ease',
          opacity: !spawned ? 0 : (idleFaded && !gutterHover && !hovering) ? 0 : 1,
        }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={handleClick}
      >
        {/* Speech bubble */}
        {showBubble && insight && (
          <div style={{
            position: 'absolute',
            bottom: GHOST_H + 8,
            right: 0,
            minWidth: 140,
            maxWidth: 200,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'linear-gradient(160deg, #282E36, #181C21)',
            border: '1px solid rgba(154, 168, 184, 0.25)',
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.04em',
            color: '#A8B4C0',
            lineHeight: 1.4,
            opacity: 1,
            animation: 'ghost-bubble-in 400ms ease-out',
            pointerEvents: 'none',
          }}>
            {/* Bubble tail */}
            <div style={{
              position: 'absolute',
              bottom: -5,
              right: 12,
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid rgba(154, 168, 184, 0.25)',
            }} />
            {insight}
          </div>
        )}

        {/* Sonar pulse ring on click */}
        {pulsing && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: GHOST_W,
            height: GHOST_W,
            borderRadius: '50%',
            border: '2px solid rgba(110, 207, 163, 0.6)',
            boxShadow: '0 0 8px rgba(110, 207, 163, 0.3)',
            animation: 'ghost-sonar 600ms ease-out forwards',
            pointerEvents: 'none',
          }} />
        )}

        {/* Floating animation wrapper with Veridian glow */}
        <div style={{
          animation: 'ghost-float 4s ease-in-out infinite',
          position: 'relative',
        }}>
          {/* Glow */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: GHOST_W * 2.5,
            height: GHOST_H * 1.5,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(110, 207, 163, 0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <GhostCanvas hover={hovering} mouseX={mousePos.x} mouseY={mousePos.y} />
        </div>
      </div>

      <div ref={contentRef}>
        {children}
      </div>

      <style>{`
        @keyframes ghost-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes ghost-bubble-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ghost-sonar {
          0% {
            width: ${GHOST_W}px;
            height: ${GHOST_W}px;
            opacity: 0.6;
            border-color: rgba(110, 207, 163, 0.5);
          }
          100% {
            width: ${GHOST_W * 4}px;
            height: ${GHOST_W * 4}px;
            opacity: 0;
            border-color: rgba(110, 207, 163, 0);
          }
        }
      `}</style>
    </div>
  );
}
