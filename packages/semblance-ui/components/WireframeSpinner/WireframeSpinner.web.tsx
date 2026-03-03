import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { WireframeSpinnerProps } from './WireframeSpinner.types';
import {
  EDGES,
  createShapeQueue,
  advanceQueue,
  computeFrame,
  SHAPE_DURATION,
} from './WireframeSpinner.logic';

export function WireframeSpinner({
  size = 48,
  speed = 1.0,
}: WireframeSpinnerProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    let totalTime = 0;
    let shapeTime = 0;
    let prevTs = -1;
    const queue = createShapeQueue();

    // The original code advanced by 0.016 per frame. The intended look was
    // tuned at 300 Hz (0.016 * 300 = 4.8 units/sec). Use real elapsed time
    // scaled to match that rate so the animation looks identical on any
    // refresh rate.
    const TIME_SCALE = 3.36;

    const draw = (ts: number) => {
      const realDt = prevTs < 0 ? 1 / 60 : Math.min((ts - prevTs) / 1000, 0.1);
      prevTs = ts;
      const dt = realDt * TIME_SCALE * speed;

      ctx.clearRect(0, 0, size, size);

      shapeTime += dt;

      while (shapeTime >= SHAPE_DURATION) {
        shapeTime -= SHAPE_DURATION;
        advanceQueue(queue);
      }

      const frame = computeFrame(queue, shapeTime, totalTime, speed, size);

      // Draw edges with opal shimmer
      ctx.lineWidth = 0.8;
      for (let i = 0; i < EDGES.length; i++) {
        const [a, b] = EDGES[i]!;
        const pa = frame.projected[a]!;
        const pb = frame.projected[b]!;
        const [cr, cg, cb] = frame.edgeColors[i]!;
        const depthAlpha = frame.edgeDepthAlphas[i]!;

        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${depthAlpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
      }

      // Draw vertices
      for (let i = 0; i < frame.projected.length; i++) {
        const [px, py] = frame.projected[i]!;
        const depthAlpha = frame.vertexDepthAlphas[i]!;
        ctx.beginPath();
        ctx.arc(px, py, 1.0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(216,221,232,${depthAlpha.toFixed(2)})`;
        ctx.fill();
      }

      totalTime += realDt * TIME_SCALE;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, speed]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block' }}
      aria-label={t('a11y.loading')}
      role="status"
    />
  );
}
