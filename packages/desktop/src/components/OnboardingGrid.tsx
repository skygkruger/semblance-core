/**
 * OnboardingGrid — Subtle dynamic grid background for onboarding.
 * Flat grid lines that pulse faintly with a slow wave pattern.
 * Anchors the atmospheric particles to something technical.
 *
 * Canvas 2D, full viewport, no interaction.
 */

import { useRef, useEffect } from 'react';

interface OnboardingGridProps {
  /** 0-1 onboarding progress — grid brightens subtly as you advance */
  progress: number;
}

const GRID_SPACING = 48;  // pixels between grid lines
const BASE_OPACITY = 0.03; // very subtle

export function OnboardingGrid({ progress }: OnboardingGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = (now: number) => {
      ctx.clearRect(0, 0, w, h);

      // Grid opacity increases slightly with progress
      const maxOpacity = BASE_OPACITY + progress * 0.02;

      // Slow wave that travels across the grid
      const waveSpeed = 0.0004;
      const waveLen = 400; // pixels per wave cycle

      // Vertical lines
      const vCount = Math.ceil(w / GRID_SPACING) + 1;
      const vOffset = (w % GRID_SPACING) / 2; // center the grid

      for (let i = 0; i < vCount; i++) {
        const x = vOffset + i * GRID_SPACING;
        // Wave: each line pulses based on its x position + time
        const wave = Math.sin((x / waveLen + now * waveSpeed) * Math.PI * 2);
        const lineOpacity = maxOpacity + wave * maxOpacity * 0.5;
        if (lineOpacity <= 0) continue;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.strokeStyle = `rgba(110, 207, 163, ${lineOpacity})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Horizontal lines
      const hCount = Math.ceil(h / GRID_SPACING) + 1;
      const hOffset = (h % GRID_SPACING) / 2;

      for (let i = 0; i < hCount; i++) {
        const y = hOffset + i * GRID_SPACING;
        const wave = Math.sin((y / waveLen + now * waveSpeed * 0.7) * Math.PI * 2);
        const lineOpacity = maxOpacity + wave * maxOpacity * 0.5;
        if (lineOpacity <= 0) continue;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.strokeStyle = `rgba(110, 207, 163, ${lineOpacity})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Intersection dots — brighter at grid crossings
      for (let ix = 0; ix < vCount; ix++) {
        const x = vOffset + ix * GRID_SPACING;
        for (let iy = 0; iy < hCount; iy++) {
          const y = hOffset + iy * GRID_SPACING;
          const wave = Math.sin(((x + y) / (waveLen * 1.5) + now * waveSpeed * 0.5) * Math.PI * 2);
          const dotOpacity = maxOpacity * 1.5 + wave * maxOpacity;
          if (dotOpacity <= 0) continue;

          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(110, 207, 163, ${dotOpacity})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [progress]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
