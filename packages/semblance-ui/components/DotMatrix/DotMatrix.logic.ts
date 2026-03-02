// ─── Pure math for DotMatrix — grid generation, wave simulation, cursor interaction ───
// No DOM, no React Native. Shared between web (Canvas 2D) and native (Skia).

import type { Dot } from './DotMatrix.types';

export function buildGrid(w: number, h: number, spacing: number): Dot[] {
  const dots: Dot[] = [];
  const cols = Math.ceil(w / spacing) + 1;
  const rows = Math.ceil(h / spacing) + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push({
        x: c * spacing,
        y: r * spacing,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  return dots;
}

export interface DotRenderParams {
  mobile: boolean;
  spacing: number;
  dotBaseRadius: number;
  dotMaxRadius: number;
  influenceRadius: number;
  wavePeriod: number;
}

export function getParams(mobile: boolean): DotRenderParams {
  return {
    mobile,
    spacing: mobile ? 40 : 28,
    dotBaseRadius: 0.7,
    dotMaxRadius: 2.0,
    influenceRadius: mobile ? 85 : 125,
    wavePeriod: 16000,
  };
}

// ─── Per-dot computation result ───

export interface DotResult {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  // Core highlight for cursor-near dots
  hasCore: boolean;
  coreRadius: number;
  coreAlpha: number;
}

export function computeDots(
  dots: Dot[],
  now: number,
  mouseX: number,
  mouseY: number,
  canvasWidth: number,
  canvasHeight: number,
  params: DotRenderParams,
): DotResult[] {
  const { dotBaseRadius, dotMaxRadius, influenceRadius, wavePeriod } = params;
  const diagonal = canvasWidth + canvasHeight;
  const waveWidth = diagonal * 0.28;

  const wavePhase1 = (now % wavePeriod) / wavePeriod;
  const wavePhase2 = ((now + wavePeriod / 2) % wavePeriod) / wavePeriod;
  const waveFront1 = wavePhase1 * diagonal * 1.6 - diagonal * 0.3;
  const waveFront2 = wavePhase2 * diagonal * 1.6 - diagonal * 0.3;

  const results: DotResult[] = [];

  for (const d of dots) {
    const breath = Math.sin(now * 0.001 + d.phase) * 0.5 + 0.5;
    const dx = d.x - mouseX;
    const dy = d.y - mouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const inf = Math.max(0, 1 - dist / influenceRadius);

    if (inf > 0) {
      const lens = inf * inf * inf;
      const ri = Math.round(110 * inf + 90 * (1 - inf));
      const gi = Math.round(207 * inf + 106 * (1 - inf));
      const bi = Math.round(163 * inf + 122 * (1 - inf));
      const radius = dotBaseRadius + (dotMaxRadius - dotBaseRadius) * lens * 1.15;
      const alpha = 0.12 + 0.72 * lens;

      const hasCore = lens > 0.15;
      const coreAlpha = hasCore ? (lens - 0.15) * 0.75 : 0;
      const coreRadius = radius * 0.45;

      results.push({ x: d.x, y: d.y, radius, r: ri, g: gi, b: bi, alpha, hasCore, coreRadius, coreAlpha });
    } else {
      const proj = d.x * 0.259 + d.y * 0.966;
      const waveInf1 = Math.max(0, 1 - Math.abs(proj - waveFront1) / waveWidth);
      const waveInf2 = Math.max(0, 1 - Math.abs(proj - waveFront2) / waveWidth);
      const wl = Math.max(waveInf1, waveInf2) ** 3;
      const waveLift = wl * 0.30;

      const sr = Math.round(85 + 140 * wl);
      const sg = Math.round(95 + 135 * wl);
      const sb = Math.round(108 + 125 * wl);
      const alpha = 0.08 + 0.04 * breath + waveLift;

      results.push({ x: d.x, y: d.y, radius: dotBaseRadius, r: sr, g: sg, b: sb, alpha, hasCore: false, coreRadius: 0, coreAlpha: 0 });
    }
  }

  return results;
}
