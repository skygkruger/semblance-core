import { useRef, useEffect, useCallback } from 'react';
import type { DotMatrixProps, Dot } from './DotMatrix.types';
import { buildGrid, getParams, computeDots } from './DotMatrix.logic';

export function DotMatrix({ mobile = false, className = '', width, height }: DotMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -999, y: -999 });
  const dotsRef = useRef<Dot[]>([]);
  const rafRef = useRef<number>(0);

  const params = getParams(mobile);

  const rebuildGrid = useCallback((w: number, h: number) => {
    return buildGrid(w, h, params.spacing);
  }, [params.spacing]);

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
      dotsRef.current = rebuildGrid(w, h);
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

      const results = computeDots(dotsRef.current, now, mx, my, w, h, params);

      for (const d of results) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.r},${d.g},${d.b},${d.alpha.toFixed(2)})`;
        ctx.fill();

        if (d.hasCore) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.coreRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200,235,220,${d.coreAlpha.toFixed(2)})`;
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
  }, [mobile, width, height, params, rebuildGrid]);

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
