import { useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Path, Circle, Skia, useFrameCallback } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import type { WireframeSpinnerProps } from './WireframeSpinner.types';
import {
  EDGES,
  createShapeQueue,
  advanceQueue,
  computeFrame,
  SHAPE_DURATION,
} from './WireframeSpinner.logic';
import type { ShapeQueue } from './WireframeSpinner.logic';

export function WireframeSpinner({
  size = 48,
  speed = 1.0,
}: WireframeSpinnerProps) {
  const queueRef = useRef<ShapeQueue>(createShapeQueue());
  const tRef = useRef(0);
  const shapeTimeRef = useRef(0);

  // Shared value triggers re-render on each frame
  const frameCount = useSharedValue(0);

  useFrameCallback((info) => {
    const dt = 0.016 * speed;
    tRef.current += 0.016;
    shapeTimeRef.current += dt;

    while (shapeTimeRef.current >= SHAPE_DURATION) {
      shapeTimeRef.current -= SHAPE_DURATION;
      advanceQueue(queueRef.current);
    }

    frameCount.value = (info.timestamp ?? 0);
  });

  const frame = computeFrame(
    queueRef.current,
    shapeTimeRef.current,
    tRef.current,
    speed,
    size,
  );

  // Build edge path
  const edgePath = Skia.Path.Make();
  for (const [a, b] of EDGES) {
    const pa = frame.projected[a]!;
    const pb = frame.projected[b]!;
    edgePath.moveTo(pa[0], pa[1]);
    edgePath.lineTo(pb[0], pb[1]);
  }

  // Compute average edge color for a single-pass stroke
  // (Per-edge color would require individual Path draws on Skia)
  let avgR = 0, avgG = 0, avgB = 0, avgA = 0;
  for (let i = 0; i < EDGES.length; i++) {
    const [cr, cg, cb] = frame.edgeColors[i]!;
    avgR += cr;
    avgG += cg;
    avgB += cb;
    avgA += frame.edgeDepthAlphas[i]!;
  }
  const n = EDGES.length || 1;
  avgR = Math.round(avgR / n);
  avgG = Math.round(avgG / n);
  avgB = Math.round(avgB / n);
  avgA = avgA / n;

  const edgePaint = Skia.Paint();
  edgePaint.setStyle(1); // Stroke
  edgePaint.setStrokeWidth(0.8);
  edgePaint.setColor(Skia.Color(`rgba(${avgR},${avgG},${avgB},${avgA.toFixed(2)})`));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={edgePath} paint={edgePaint} />
        {frame.projected.map((p, i) => {
          const alpha = frame.vertexDepthAlphas[i]!;
          return (
            <Circle
              key={i}
              cx={p[0]}
              cy={p[1]}
              r={1.0}
              color={Skia.Color(`rgba(216,221,232,${alpha.toFixed(2)})`)}
            />
          );
        })}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
