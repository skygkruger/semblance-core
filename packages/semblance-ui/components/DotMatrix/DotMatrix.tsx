import { useRef, useEffect, useCallback } from 'react';

interface DotMatrixProps {
  mobile?: boolean;
  className?: string;
  /** Restrict to a fixed size instead of full viewport */
  width?: number;
  height?: number;
}

interface Dot {
  x: number;
  y: number;
  phase: number;
}

export function DotMatrix({ mobile = false, className = '', width, height }: DotMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -999, y: -999 });
  const dotsRef = useRef<Dot[]>([]);
  const rafRef = useRef<number>(0);

  const SP = mobile ? 40 : 28;
  const DB = 0.7;
  const DM = 2.0;
  const INF = mobile ? 100 : 150;
  const WAVE_PERIOD = 16000;

  const buildGrid = useCallback((w: number, h: number) => {
    const dots: Dot[] = [];
    const cols = Math.ceil(w / SP) + 1;
    const rows = Math.ceil(h / SP) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push({
          x: c * SP,
          y: r * SP,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    return dots;
  }, [SP]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const w = width ?? window.innerWidth;
      const h = height ?? window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dotsRef.current = buildGrid(w, h);
    };

    resize();

    if (!width && !height) {
      window.addEventListener('resize', resize);
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -999, y: -999 };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0]!;
        const rect = canvas.getBoundingClientRect();
        mouseRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }
    };
    const onTouchEnd = () => {
      mouseRef.current = { x: -999, y: -999 };
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    const draw = (now: number) => {
      const w = width ?? window.innerWidth;
      const h = height ?? window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const diagonal = w + h;
      const waveWidth = diagonal * 0.28;

      // Two waves at half-period offset — field always has a wave visible
      const wavePhase1 = (now % WAVE_PERIOD) / WAVE_PERIOD;
      const wavePhase2 = ((now + WAVE_PERIOD / 2) % WAVE_PERIOD) / WAVE_PERIOD;
      const waveFront1 = wavePhase1 * diagonal * 1.6 - diagonal * 0.3;
      const waveFront2 = wavePhase2 * diagonal * 1.6 - diagonal * 0.3;

      for (const d of dotsRef.current) {
        const breath = Math.sin(now * 0.001 + d.phase) * 0.5 + 0.5;
        const dx = d.x - mx;
        const dy = d.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const inf = Math.max(0, 1 - dist / INF);

        if (inf > 0) {
          // Cursor interaction — Veridian
          const ri = Math.round(110 * inf + 90 * (1 - inf));
          const gi = Math.round(207 * inf + 106 * (1 - inf));
          const bi = Math.round(163 * inf + 122 * (1 - inf));
          const radius = DB + (DM - DB) * inf;
          const alpha = 0.15 + 0.6 * inf;

          ctx.beginPath();
          ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${ri},${gi},${bi},${alpha})`;
          ctx.fill();
        } else {
          // Silver wave — take the stronger of two offset waves
          const proj = d.x * 0.259 + d.y * 0.966;
          const waveInf1 = Math.max(0, 1 - Math.abs(proj - waveFront1) / waveWidth);
          const waveInf2 = Math.max(0, 1 - Math.abs(proj - waveFront2) / waveWidth);
          const wl = Math.max(waveInf1, waveInf2) ** 3;
          const waveLift = wl * 0.30;

          const sr = Math.round(85 + 140 * wl);
          const sg = Math.round(95 + 135 * wl);
          const sb = Math.round(108 + 125 * wl);
          const alpha = 0.08 + 0.04 * breath + waveLift;

          ctx.beginPath();
          ctx.arc(d.x, d.y, DB, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${sr},${sg},${sb},${alpha})`;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (!width && !height) {
        window.removeEventListener('resize', resize);
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [mobile, width, height, SP, INF, DB, DM, WAVE_PERIOD, buildGrid]);

  const style: React.CSSProperties = width && height
    ? { width, height, position: 'relative' }
    : { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
}
