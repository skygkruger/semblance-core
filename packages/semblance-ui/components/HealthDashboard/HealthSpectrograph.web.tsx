import { useRef, useEffect, useCallback, useState } from 'react';
import type { MetricKey, ActiveMetric, SpectroState, SpectroPoint } from './spectrograph-renderer';
import { renderSpectrograph, lerp, computeTargetOpacities } from './spectrograph-renderer';
import './HealthSpectrograph.css';

interface HealthSpectrographProps {
  data: SpectroPoint[];
  activeMetric: ActiveMetric;
  visibleMetrics: MetricKey[];
}

const ALL_METRICS: MetricKey[] = ['heartRate', 'steps', 'sleep', 'water', 'energy', 'mood'];

function initOpacities(active: ActiveMetric, visible: MetricKey[]): Record<MetricKey, number> {
  const o = {} as Record<MetricKey, number>;
  for (const k of ALL_METRICS) {
    if (!visible.includes(k)) { o[k] = 0; continue; }
    o[k] = active === 'all' ? 0.75 : (k === active ? 1.0 : 0.35);
  }
  return o;
}

export function HealthSpectrograph({ data, activeMetric, visibleMetrics }: HealthSpectrographProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const stateRef = useRef<SpectroState>({
    activeMetric,
    layerOpacity: initOpacities(activeMetric, visibleMetrics),
    time: 0,
  });

  const render = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    stateRef.current.time = time;

    renderSpectrograph(ctx, data, stateRef.current, {
      width: w,
      height: h,
      dpr,
      visibleMetrics,
      mouse: mouseRef.current,
    });
  }, [data, visibleMetrics]);

  // Continuous animation loop — drives ambient drift + opacity lerp
  useEffect(() => {
    let running = true;

    const tick = (time: number) => {
      if (!running) return;

      const st = stateRef.current;
      st.activeMetric = activeMetric;
      const targets = computeTargetOpacities(activeMetric, visibleMetrics);

      for (const key of ALL_METRICS) {
        const current = st.layerOpacity[key] ?? 0;
        const target = targets[key] ?? 0;
        st.layerOpacity[key] = lerp(current, target, 0.08);
      }

      render(time);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [activeMetric, visibleMetrics, render]);

  // Mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = null;
  }, []);

  return (
    <div ref={containerRef} className="health-spectrograph">
      <canvas
        ref={canvasRef}
        className="health-spectrograph__canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}
