/**
 * Health Spectrograph Renderer — Canvas 2D pseudo-3D visualization.
 *
 * Each health metric is a ribbon/layer stacked in Z-depth with visible
 * thickness (side faces), depth fog, scanlines, edge glow, ambient drift,
 * data point markers, hover tooltips, floor color reflection, and smooth
 * Catmull-Rom spline interpolation.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type MetricKey = 'mood' | 'energy' | 'water' | 'sleep' | 'steps' | 'heartRate';

/** Special sentinel: when activeMetric is 'all', every layer shows equally. */
export type ActiveMetric = MetricKey | 'all';

export interface SpectroPoint {
  date: string;
  mood: number | null;
  energy: number | null;
  waterGlasses: number | null;
  sleepHours: number | null;
  steps: number | null;
  heartRateAvg: number | null;
}

interface LayerConfig {
  key: MetricKey;
  extract: (p: SpectroPoint) => number | null;
  normalizeRange: [number, number];
  label: string;
  unit: string;
}

interface ProjectedPoint {
  sx: number;
  sy: number;
  depth: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LAYER_ORDER: LayerConfig[] = [
  { key: 'heartRate', extract: (p) => p.heartRateAvg, normalizeRange: [50, 100], label: 'Heart Rate', unit: 'bpm' },
  { key: 'steps',     extract: (p) => p.steps,        normalizeRange: [0, 15000], label: 'Steps',      unit: '' },
  { key: 'sleep',     extract: (p) => p.sleepHours,   normalizeRange: [0, 10],    label: 'Sleep',      unit: 'hrs' },
  { key: 'water',     extract: (p) => p.waterGlasses,  normalizeRange: [0, 12],    label: 'Water',      unit: 'glasses' },
  { key: 'energy',    extract: (p) => p.energy,        normalizeRange: [1, 5],     label: 'Energy',     unit: '/5' },
  { key: 'mood',      extract: (p) => p.mood,          normalizeRange: [1, 5],     label: 'Mood',       unit: '/5' },
];

export const METRIC_COLORS: Record<MetricKey, { r: number; g: number; b: number }> = {
  heartRate: { r: 74,  g: 120, b: 114 },
  steps:     { r: 108, g: 148, b: 128 },
  sleep:     { r: 140, g: 170, b: 200 },
  water:     { r: 90,  g: 160, b: 140 },
  energy:    { r: 180, g: 200, b: 140 },
  mood:      { r: 200, g: 216, b: 198 },
};

const RIBBON_THICKNESS = 6;
const DRIFT_AMPLITUDE = 1.8;
const DRIFT_SPEED = 0.0008;

// ─── Camera ─────────────────────────────────────────────────────────────────

interface Camera {
  tiltX: number;
  fov: number;
  distance: number;
  cx: number;
  cy: number;
}

function project(x: number, y: number, z: number, cam: Camera): ProjectedPoint {
  const cosT = Math.cos(cam.tiltX);
  const sinT = Math.sin(cam.tiltX);
  const yr = y * cosT - z * sinT;
  const zr = y * sinT + z * cosT;
  const scale = cam.fov / (cam.fov + zr + cam.distance);
  return { sx: cam.cx + x * scale, sy: cam.cy - yr * scale, depth: zr };
}

function depthFog(depth: number, maxDepth: number): number {
  const t = Math.max(0, Math.min(1, (depth + maxDepth) / (maxDepth * 2)));
  // Stronger falloff for more dramatic depth separation
  return 0.4 + 0.6 * Math.pow(1 - t, 1.3);
}

// ─── Smoothing ──────────────────────────────────────────────────────────────

function catmullRomPoints(pts: { x: number; y: number }[], segments: number = 8): { x: number; y: number }[] {
  if (pts.length < 2) return pts;
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(i + 2, pts.length - 1)]!;
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  result.push(pts[pts.length - 1]!);
  return result;
}

// ─── Renderer ───────────────────────────────────────────────────────────────

export interface SpectroState {
  activeMetric: ActiveMetric;
  layerOpacity: Record<MetricKey, number>;
  time: number; // monotonic time in ms for ambient drift
  /** Smoothed label Y positions — lerped across frames to prevent jitter. */
  labelY?: Record<string, number>;
}

export interface SpectroOptions {
  width: number;
  height: number;
  dpr: number;
  visibleMetrics: MetricKey[];
  /** Mouse position in CSS pixels relative to canvas, or null if not hovering. */
  mouse: { x: number; y: number } | null;
}

export function renderSpectrograph(
  ctx: CanvasRenderingContext2D,
  data: SpectroPoint[],
  state: SpectroState,
  opts: SpectroOptions,
): void {
  const { width, height, dpr } = opts;
  const w = width * dpr;
  const h = height * dpr;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.scale(dpr, dpr);

  if (data.length < 2) {
    ctx.font = '13px "DM Sans", sans-serif';
    ctx.fillStyle = '#5E6B7C';
    ctx.textAlign = 'center';
    ctx.fillText('Not enough data for spectrograph', width / 2, height / 2);
    ctx.restore();
    return;
  }

  const padLeft = 12;
  const padRight = 80;
  const padTop = 12;
  const padBottom = 28;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const ribbonHeight = chartH * 0.5;
  const layerSpacing = 40;
  const baselineY = 0;
  const isAllMode = state.activeMetric === 'all';

  const cam: Camera = {
    tiltX: 0.48,
    fov: 550,
    distance: 160,
    cx: padLeft + chartW / 2,
    cy: height * 0.58,
  };

  const visibleLayers = LAYER_ORDER.filter((l) => opts.visibleMetrics.includes(l.key));
  const maxZ = (visibleLayers.length / 2) * layerSpacing;

  // ─── Background vignette — jade-tinted center ─────────────────────
  const vg = ctx.createRadialGradient(cam.cx, cam.cy, 0, cam.cx, cam.cy, Math.max(width, height) * 0.7);
  vg.addColorStop(0, 'rgba(126, 160, 124, 0.015)');
  vg.addColorStop(0.3, 'rgba(11, 14, 17, 0)');
  vg.addColorStop(1, 'rgba(4, 6, 7, 0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, width, height);

  // ─── Floor grid ────────────────────────────────────────────────────
  drawFloorGrid(ctx, data.length, visibleLayers.length, layerSpacing, chartW, cam);

  // ─── Floor color reflection from active layer ──────────────────────
  if (!isAllMode) {
    const activeColor = METRIC_COLORS[state.activeMetric as MetricKey];
    if (activeColor) {
      const activeOpacity = state.layerOpacity[state.activeMetric as MetricKey] ?? 0;
      const reflectAlpha = activeOpacity * 0.06;
      const floorGrad = ctx.createRadialGradient(cam.cx, cam.cy + 20, 0, cam.cx, cam.cy + 20, chartW * 0.4);
      floorGrad.addColorStop(0, `rgba(${activeColor.r}, ${activeColor.g}, ${activeColor.b}, ${reflectAlpha})`);
      floorGrad.addColorStop(1, `rgba(${activeColor.r}, ${activeColor.g}, ${activeColor.b}, 0)`);
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, 0, width, height);
    }
  }

  const labelPositions: { y: number; label: string; color: { r: number; g: number; b: number }; alpha: number; active: boolean }[] = [];

  // Track closest data point to mouse for tooltip
  let hoverHit: { sx: number; sy: number; value: number; date: string; label: string; unit: string; color: { r: number; g: number; b: number } } | null = null;
  let hoverDist = Infinity;

  // ─── Draw ribbons back to front ────────────────────────────────────
  for (let li = 0; li < visibleLayers.length; li++) {
    const layer = visibleLayers[li]!;
    const isActive = isAllMode || layer.key === state.activeMetric;
    const opacity = state.layerOpacity[layer.key] ?? (isActive ? 1 : 0.35);
    const zBase = (li - visibleLayers.length / 2) * layerSpacing;
    const baseColor = METRIC_COLORS[layer.key];
    const fog = depthFog(zBase, maxZ);

    // Ambient drift — per-layer sine offset
    const driftPhase = li * 1.7;
    const driftY = Math.sin(state.time * DRIFT_SPEED + driftPhase) * DRIFT_AMPLITUDE;

    const color = isActive
      ? { r: baseColor.r + (255 - baseColor.r) * 0.35, g: baseColor.g + (255 - baseColor.g) * 0.35, b: baseColor.b + (255 - baseColor.b) * 0.35 }
      : { r: baseColor.r * fog, g: baseColor.g * fog, b: baseColor.b * fog };

    const [normMin, normMax] = layer.normalizeRange;
    const normSpan = normMax - normMin || 1;
    const rawPoints: { x: number; y: number }[] = [];
    const rawValues: (number | null)[] = [];

    for (let di = 0; di < data.length; di++) {
      const val = layer.extract(data[di]!);
      rawValues.push(val);
      const norm = val !== null ? Math.max(0, Math.min(1, (val - normMin) / normSpan)) : 0;
      const x3d = ((di / (data.length - 1)) - 0.5) * chartW;
      const y3d = baselineY + norm * ribbonHeight + driftY;
      rawPoints.push({ x: x3d, y: y3d });
    }

    const smoothSegments = data.length > 60 ? 4 : 6;
    const smoothTop = catmullRomPoints(rawPoints, smoothSegments);
    const projectedTop = smoothTop.map((p) => project(p.x, p.y, zBase, cam));
    const projectedBase = smoothTop.map((p) => project(p.x, baselineY + driftY, zBase, cam));
    const projectedSideBase = smoothTop.map((p) => project(p.x, baselineY + driftY - RIBBON_THICKNESS, zBase, cam));

    // ─── Ribbon side face ──────────────────────────────────────────
    const sideDarken = 0.55;
    const sideAlpha = opacity * 0.5 * fog;
    ctx.beginPath();
    ctx.moveTo(projectedBase[0]!.sx, projectedBase[0]!.sy);
    for (let i = 1; i < projectedBase.length; i++) ctx.lineTo(projectedBase[i]!.sx, projectedBase[i]!.sy);
    for (let i = projectedSideBase.length - 1; i >= 0; i--) ctx.lineTo(projectedSideBase[i]!.sx, projectedSideBase[i]!.sy);
    ctx.closePath();
    ctx.fillStyle = `rgba(${color.r * sideDarken}, ${color.g * sideDarken}, ${color.b * sideDarken}, ${sideAlpha})`;
    ctx.fill();

    // ─── Ribbon face fill ──────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(projectedTop[0]!.sx, projectedTop[0]!.sy);
    for (let i = 1; i < projectedTop.length; i++) ctx.lineTo(projectedTop[i]!.sx, projectedTop[i]!.sy);
    for (let i = projectedBase.length - 1; i >= 0; i--) ctx.lineTo(projectedBase[i]!.sx, projectedBase[i]!.sy);
    ctx.closePath();

    const fillAlpha = isActive ? opacity * 0.55 : opacity * 0.32;
    const topAlpha = isActive ? opacity * 0.85 : opacity * 0.5;
    const midY = Math.min(...projectedTop.map((p) => p.sy));
    const botY = Math.max(...projectedBase.map((p) => p.sy));
    const grad = ctx.createLinearGradient(0, midY, 0, botY);
    // Brighter top edge for volumetric highlight
    const highlightR = Math.min(255, color.r + 40);
    const highlightG = Math.min(255, color.g + 40);
    const highlightB = Math.min(255, color.b + 40);
    grad.addColorStop(0, `rgba(${highlightR}, ${highlightG}, ${highlightB}, ${topAlpha})`);
    grad.addColorStop(0.15, `rgba(${color.r}, ${color.g}, ${color.b}, ${topAlpha * 0.7})`);
    grad.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${fillAlpha * 0.4})`);
    grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, ${fillAlpha * 0.08})`);
    ctx.fillStyle = grad;
    ctx.fill();

    // ─── Scanlines ─────────────────────────────────────────────────
    if (opacity > 0.2) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(projectedTop[0]!.sx, projectedTop[0]!.sy);
      for (let i = 1; i < projectedTop.length; i++) ctx.lineTo(projectedTop[i]!.sx, projectedTop[i]!.sy);
      for (let i = projectedBase.length - 1; i >= 0; i--) ctx.lineTo(projectedBase[i]!.sx, projectedBase[i]!.sy);
      ctx.closePath();
      ctx.clip();
      const scanAlpha = isActive ? 0.08 : 0.04;
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${scanAlpha})`;
      ctx.lineWidth = 0.5;
      for (let sy = Math.floor(midY); sy < botY; sy += 4) {
        ctx.beginPath();
        ctx.moveTo(projectedTop[0]!.sx - 10, sy);
        ctx.lineTo(projectedTop[projectedTop.length - 1]!.sx + 10, sy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ─── Top edge line ─────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(projectedTop[0]!.sx, projectedTop[0]!.sy);
    for (let i = 1; i < projectedTop.length; i++) ctx.lineTo(projectedTop[i]!.sx, projectedTop[i]!.sy);
    const lineAlpha = isActive ? opacity * 1.0 : opacity * 0.55;
    const lineWidth = isActive ? 2.0 : 1.0;
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${lineAlpha})`;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // ─── Baseline edge ─────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(projectedBase[0]!.sx, projectedBase[0]!.sy);
    for (let i = 1; i < projectedBase.length; i++) ctx.lineTo(projectedBase[i]!.sx, projectedBase[i]!.sy);
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${lineAlpha * 0.3})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // ─── Active glow — multi-pass bloom ────────────────────────────
    if (isActive && opacity > 0.5) {
      // Outer bloom pass (wide, soft)
      ctx.save();
      ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`;
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.moveTo(projectedTop[0]!.sx, projectedTop[0]!.sy);
      for (let i = 1; i < projectedTop.length; i++) ctx.lineTo(projectedTop[i]!.sx, projectedTop[i]!.sy);
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${lineAlpha * 0.2})`;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();

      // Inner bloom pass (tight, bright)
      ctx.save();
      ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.6)`;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(projectedTop[0]!.sx, projectedTop[0]!.sy);
      for (let i = 1; i < projectedTop.length; i++) ctx.lineTo(projectedTop[i]!.sx, projectedTop[i]!.sy);
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${lineAlpha * 0.45})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // Atmospheric underglow — radial beneath the ribbon
      const glowCy = (midY + botY) / 2;
      const ribbonGlow = ctx.createRadialGradient(cam.cx, glowCy, 0, cam.cx, glowCy, chartW * 0.35);
      ribbonGlow.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0.04)`);
      ribbonGlow.addColorStop(1, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0)`);
      ctx.fillStyle = ribbonGlow;
      ctx.fillRect(0, 0, width, height);
    }

    // ─── Peak markers on active layer ────────────────────────────────
    if (isActive && opacity > 0.5 && data.length > 3) {
      for (let di = 1; di < data.length - 1; di++) {
        const prev = rawValues[di - 1] ?? null;
        const curr = rawValues[di] ?? null;
        const next = rawValues[di + 1] ?? null;
        if (curr === null || prev === null || next === null) continue;
        if (curr > prev && curr > next) {
          const norm = Math.max(0, Math.min(1, (curr - normMin) / normSpan));
          const x3d = ((di / (data.length - 1)) - 0.5) * chartW;
          const y3d = baselineY + norm * ribbonHeight + driftY;
          const pt = project(x3d, y3d, zBase, cam);

          // Glow ring
          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.25)`;
          ctx.fill();

          // Core dot
          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.7)`;
          ctx.fill();
        }
      }
    }

    // ─── Hover hit-test (data points only appear on hover) ────────
    if (isActive && opacity > 0.4 && opts.mouse) {
      for (let di = 0; di < data.length; di++) {
        const val = rawValues[di] ?? null;
        if (val === null) continue;

        const x3d = ((di / (data.length - 1)) - 0.5) * chartW;
        const norm = Math.max(0, Math.min(1, (val - normMin) / normSpan));
        const y3d = baselineY + norm * ribbonHeight + driftY;
        const pt = project(x3d, y3d, zBase, cam);

        const dx = opts.mouse.x - pt.sx;
        const dy = opts.mouse.y - pt.sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hoverDist && dist < 24) {
          hoverDist = dist;
          hoverHit = { sx: pt.sx, sy: pt.sy, value: val as number, date: data[di]!.date, label: layer.label, unit: layer.unit, color };
        }
      }
    }

    // ─── Collect label position (smoothed) ─────────────────────────
    if (opacity > 0.12) {
      const lastTop = projectedTop[projectedTop.length - 1]!;
      const labelAlpha = isActive ? 0.95 : Math.min(opacity * 2, 0.5);

      // Smooth label Y to prevent jitter from ambient drift
      if (!state.labelY) state.labelY = {};
      const prevY = state.labelY[layer.key];
      const smoothedY = prevY !== undefined ? lerp(prevY, lastTop.sy, 0.06) : lastTop.sy;
      state.labelY[layer.key] = smoothedY;

      labelPositions.push({ y: smoothedY, label: layer.label, color, alpha: labelAlpha, active: isActive });
    }
  }

  // ─── Labels ────────────────────────────────────────────────────────
  drawLabels(ctx, labelPositions, width, padRight, padTop, height - padBottom);

  // ─── Time labels ───────────────────────────────────────────────────
  drawTimeLabels(ctx, data, chartW, cam, visibleLayers.length, layerSpacing);

  // ─── Hover tooltip ─────────────────────────────────────────────────
  if (hoverHit) {
    drawTooltip(ctx, hoverHit, width, height);
  }

  ctx.restore();
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function drawTooltip(
  ctx: CanvasRenderingContext2D,
  hit: { sx: number; sy: number; value: number; date: string; label: string; unit: string; color: { r: number; g: number; b: number } },
  canvasW: number,
  _canvasH: number,
): void {
  const { color } = hit;
  const needsSpace = hit.unit && !hit.unit.startsWith('/');
  const valueText = hit.unit ? `${hit.value}${needsSpace ? ' ' : ''}${hit.unit}` : `${hit.value.toLocaleString()}`;
  const dateText = hit.date;

  ctx.font = '600 11px "DM Mono", monospace';
  const valueWidth = ctx.measureText(valueText).width;
  ctx.font = '10px "DM Mono", monospace';
  const dateWidth = ctx.measureText(dateText).width;
  const tipW = Math.max(valueWidth, dateWidth) + 16;
  const tipH = 36;

  // Position tooltip above the dot, flip if near edge
  let tx = hit.sx - tipW / 2;
  let ty = hit.sy - tipH - 10;
  if (tx < 4) tx = 4;
  if (tx + tipW > canvasW - 4) tx = canvasW - tipW - 4;
  if (ty < 4) ty = hit.sy + 14;

  // Background
  ctx.fillStyle = 'rgba(11, 14, 17, 0.92)';
  ctx.beginPath();
  roundRect(ctx, tx, ty, tipW, tipH, 4);
  ctx.fill();

  // Border
  ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, tx, ty, tipW, tipH, 4);
  ctx.stroke();

  // Value
  ctx.font = '600 11px "DM Mono", monospace';
  ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
  ctx.textAlign = 'center';
  ctx.fillText(valueText, tx + tipW / 2, ty + 15);

  // Date
  ctx.font = '10px "DM Mono", monospace';
  ctx.fillStyle = 'rgba(133, 147, 164, 0.7)';
  ctx.fillText(dateText, tx + tipW / 2, ty + 28);

  // Highlight dot
  ctx.beginPath();
  ctx.arc(hit.sx, hit.sy, 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hit.sx, hit.sy, 8, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.3)`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Labels with de-collision ───────────────────────────────────────────────

function drawLabels(
  ctx: CanvasRenderingContext2D,
  labels: { y: number; label: string; color: { r: number; g: number; b: number }; alpha: number; active: boolean }[],
  width: number,
  padRight: number,
  minY: number,
  maxY: number,
): void {
  const labelX = width - padRight + 10;
  const lineHeight = 14;
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  const finalY: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    let y = Math.max(minY + lineHeight, Math.min(maxY, sorted[i]!.y + 3));
    if (i > 0 && finalY[i - 1] !== undefined && y < finalY[i - 1]! + lineHeight) {
      y = finalY[i - 1]! + lineHeight;
    }
    finalY.push(y);
  }

  for (let i = 0; i < sorted.length; i++) {
    const lbl = sorted[i]!;
    const fontSize = lbl.active ? 11 : 10;
    const weight = lbl.active ? 600 : 400;
    ctx.font = `${weight} ${fontSize}px "DM Mono", monospace`;
    ctx.fillStyle = `rgba(${lbl.color.r}, ${lbl.color.g}, ${lbl.color.b}, ${lbl.alpha})`;
    ctx.textAlign = 'left';
    ctx.fillText(lbl.label, labelX, finalY[i]!);

    const origY = lbl.y + 3;
    if (Math.abs(origY - finalY[i]!) > 4) {
      ctx.beginPath();
      ctx.moveTo(labelX - 6, origY);
      ctx.lineTo(labelX - 2, finalY[i]! - 3);
      ctx.strokeStyle = `rgba(${lbl.color.r}, ${lbl.color.g}, ${lbl.color.b}, ${lbl.alpha * 0.3})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
}

// ─── Floor Grid ─────────────────────────────────────────────────────────────

function drawFloorGrid(
  ctx: CanvasRenderingContext2D,
  pointCount: number,
  layerCount: number,
  layerSpacing: number,
  chartW: number,
  cam: Camera,
): void {
  const zMin = (-layerCount / 2) * layerSpacing - layerSpacing * 0.5;
  const zMax = (layerCount / 2) * layerSpacing + layerSpacing * 0.5;

  const timeLines = Math.min(pointCount, 10);
  for (let i = 0; i <= timeLines; i++) {
    const x = ((i / timeLines) - 0.5) * chartW;
    const p1 = project(x, 0, zMin, cam);
    const p2 = project(x, 0, zMax, cam);
    const grad = ctx.createLinearGradient(p1.sx, p1.sy, p2.sx, p2.sy);
    grad.addColorStop(0, 'rgba(126, 160, 140, 0.02)');
    grad.addColorStop(0.5, 'rgba(133, 147, 164, 0.08)');
    grad.addColorStop(1, 'rgba(126, 160, 140, 0.03)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.stroke();
  }

  const depthLines = 6;
  for (let i = 0; i <= depthLines; i++) {
    const z = zMin + (i / depthLines) * (zMax - zMin);
    const p1 = project(-chartW / 2, 0, z, cam);
    const p2 = project(chartW / 2, 0, z, cam);
    const alpha = 0.03 + 0.05 * (1 - i / depthLines);
    const grad = ctx.createLinearGradient(p1.sx, p1.sy, p2.sx, p2.sy);
    grad.addColorStop(0, `rgba(126, 160, 140, ${alpha * 0.3})`);
    grad.addColorStop(0.5, `rgba(133, 147, 164, ${alpha})`);
    grad.addColorStop(1, `rgba(126, 160, 140, ${alpha * 0.3})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.stroke();
  }
}

// ─── Time Labels ────────────────────────────────────────────────────────────

function drawTimeLabels(
  ctx: CanvasRenderingContext2D,
  data: SpectroPoint[],
  chartW: number,
  cam: Camera,
  layerCount: number,
  layerSpacing: number,
): void {
  const zFront = (layerCount / 2) * layerSpacing + layerSpacing * 0.6;
  const labelCount = Math.min(data.length, 6);
  const step = Math.max(1, Math.floor((data.length - 1) / (labelCount - 1)));

  ctx.font = '10px "DM Mono", monospace';
  ctx.fillStyle = 'rgba(133, 147, 164, 0.45)';
  ctx.textAlign = 'center';

  for (let i = 0; i < data.length; i += step) {
    const x = ((i / (data.length - 1)) - 0.5) * chartW;
    const p = project(x, -10, zFront, cam);
    ctx.fillText(data[i]!.date.slice(5), p.sx, p.sy);
  }
}

// ─── Animation helpers ──────────────────────────────────────────────────────

export function lerp(current: number, target: number, speed: number): number {
  const diff = target - current;
  if (Math.abs(diff) < 0.005) return target;
  return current + diff * speed;
}

export function computeTargetOpacities(
  activeMetric: ActiveMetric,
  visibleMetrics: MetricKey[],
): Record<MetricKey, number> {
  const targets: Record<string, number> = {};
  for (const key of visibleMetrics) {
    targets[key] = activeMetric === 'all'
      ? 0.75
      : (key === activeMetric ? 1.0 : 0.35);
  }
  return targets as Record<MetricKey, number>;
}
