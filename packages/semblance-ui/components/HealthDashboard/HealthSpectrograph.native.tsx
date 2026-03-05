import { useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, useFrameCallback, Skia, Path, vec, useCanvasRef } from '@shopify/react-native-skia';
import type { FrameInfo, SkCanvas } from '@shopify/react-native-skia';
import type { MetricKey, ActiveMetric, SpectroPoint } from './spectrograph-renderer';
import { METRIC_COLORS, lerp, computeTargetOpacities } from './spectrograph-renderer';

interface HealthSpectrographProps {
  data: SpectroPoint[];
  activeMetric: ActiveMetric;
  visibleMetrics: MetricKey[];
  width?: number;
  height?: number;
}

const ALL_METRICS: MetricKey[] = ['heartRate', 'steps', 'sleep', 'water', 'energy', 'mood'];

const LAYER_ORDER: { key: MetricKey; extract: (p: SpectroPoint) => number | null; normalizeRange: [number, number]; label: string }[] = [
  { key: 'heartRate', extract: (p) => p.heartRateAvg, normalizeRange: [50, 100], label: 'HR' },
  { key: 'steps',     extract: (p) => p.steps,        normalizeRange: [0, 15000], label: 'Steps' },
  { key: 'sleep',     extract: (p) => p.sleepHours,   normalizeRange: [0, 10],    label: 'Sleep' },
  { key: 'water',     extract: (p) => p.waterGlasses,  normalizeRange: [0, 12],    label: 'Water' },
  { key: 'energy',    extract: (p) => p.energy,        normalizeRange: [1, 5],     label: 'Energy' },
  { key: 'mood',      extract: (p) => p.mood,          normalizeRange: [1, 5],     label: 'Mood' },
];

interface Camera { tiltX: number; fov: number; distance: number; cx: number; cy: number }

function project(x: number, y: number, z: number, cam: Camera) {
  const cosT = Math.cos(cam.tiltX);
  const sinT = Math.sin(cam.tiltX);
  const yr = y * cosT - z * sinT;
  const zr = y * sinT + z * cosT;
  const scale = cam.fov / (cam.fov + zr + cam.distance);
  return { sx: cam.cx + x * scale, sy: cam.cy - yr * scale };
}

function catmullRom(pts: { x: number; y: number }[], segs: number = 6): { x: number; y: number }[] {
  if (pts.length < 2) return pts;
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(i + 2, pts.length - 1)]!;
    for (let s = 0; s < segs; s++) {
      const t = s / segs; const t2 = t * t; const t3 = t2 * t;
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  result.push(pts[pts.length - 1]!);
  return result;
}

export function HealthSpectrograph({ data, activeMetric, visibleMetrics, width = 350, height = 260 }: HealthSpectrographProps) {
  const canvasRef = useCanvasRef();
  const opacitiesRef = useRef<Record<MetricKey, number>>(
    Object.fromEntries(ALL_METRICS.map(k => [k, visibleMetrics.includes(k) ? (activeMetric === 'all' ? 0.75 : k === activeMetric ? 1.0 : 0.35) : 0])) as Record<MetricKey, number>
  );
  const activeRef = useRef<ActiveMetric>(activeMetric);
  activeRef.current = activeMetric;

  const visibleLayers = useMemo(
    () => LAYER_ORDER.filter(l => visibleMetrics.includes(l.key)),
    [visibleMetrics],
  );

  const padRight = 60;
  const chartW = width - 12 - padRight;
  const ribbonHeight = (height - 40) * 0.5;
  const layerSpacing = 40;

  const cam: Camera = useMemo(() => ({
    tiltX: 0.48, fov: 550, distance: 160,
    cx: 12 + chartW / 2, cy: height * 0.58,
  }), [chartW, height]);

  // Skia frame callback — runs every frame on the UI thread
  useFrameCallback((info: FrameInfo) => {
    const targets = computeTargetOpacities(activeRef.current, visibleMetrics);
    for (const key of ALL_METRICS) {
      opacitiesRef.current[key] = lerp(opacitiesRef.current[key] ?? 0, targets[key] ?? 0, 0.08);
    }
  });

  // Build Skia paths for each layer
  const layerPaths = useMemo(() => {
    if (data.length < 2) return [];

    return visibleLayers.map((layer, li) => {
      const [normMin, normMax] = layer.normalizeRange;
      const normSpan = normMax - normMin || 1;
      const zBase = (li - visibleLayers.length / 2) * layerSpacing;
      const rawPts: { x: number; y: number }[] = [];

      for (let di = 0; di < data.length; di++) {
        const val = layer.extract(data[di]!);
        const norm = val !== null ? Math.max(0, Math.min(1, (val - normMin) / normSpan)) : 0;
        rawPts.push({
          x: ((di / (data.length - 1)) - 0.5) * chartW,
          y: norm * ribbonHeight,
        });
      }

      const smooth = catmullRom(rawPts);
      const topPts = smooth.map(p => project(p.x, p.y, zBase, cam));
      const basePts = smooth.map(p => project(p.x, 0, zBase, cam));

      // Build fill path
      const fillPath = Skia.Path.Make();
      fillPath.moveTo(topPts[0]!.sx, topPts[0]!.sy);
      for (let i = 1; i < topPts.length; i++) fillPath.lineTo(topPts[i]!.sx, topPts[i]!.sy);
      for (let i = basePts.length - 1; i >= 0; i--) fillPath.lineTo(basePts[i]!.sx, basePts[i]!.sy);
      fillPath.close();

      // Build line path (top edge)
      const linePath = Skia.Path.Make();
      linePath.moveTo(topPts[0]!.sx, topPts[0]!.sy);
      for (let i = 1; i < topPts.length; i++) linePath.lineTo(topPts[i]!.sx, topPts[i]!.sy);

      return { key: layer.key, fillPath, linePath, color: METRIC_COLORS[layer.key] };
    });
  }, [data, visibleLayers, chartW, ribbonHeight, layerSpacing, cam]);

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas ref={canvasRef} style={{ width, height }}>
        {layerPaths.map(({ key, fillPath, linePath, color }) => {
          const isActive = activeMetric === 'all' || key === activeMetric;
          const c = isActive
            ? { r: color.r + (255 - color.r) * 0.35, g: color.g + (255 - color.g) * 0.35, b: color.b + (255 - color.b) * 0.35 }
            : color;
          const opacity = opacitiesRef.current[key] ?? 0.35;

          const fillPaint = Skia.Paint();
          fillPaint.setColor(Skia.Color(`rgba(${c.r}, ${c.g}, ${c.b}, ${opacity * 0.45})`));
          fillPaint.setStyle(0); // Fill

          const linePaint = Skia.Paint();
          linePaint.setColor(Skia.Color(`rgba(${c.r}, ${c.g}, ${c.b}, ${opacity * 0.85})`));
          linePaint.setStyle(1); // Stroke
          linePaint.setStrokeWidth(isActive ? 2 : 1);

          return (
            <View key={key}>
              <Path path={fillPath} paint={fillPaint} />
              <Path path={linePath} paint={linePaint} />
            </View>
          );
        })}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
  },
});
