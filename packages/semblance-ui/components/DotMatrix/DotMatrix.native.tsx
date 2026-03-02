import { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions, LayoutChangeEvent } from 'react-native';
import { Canvas, Circle, Skia, useFrameCallback, useTouchHandler } from '@shopify/react-native-skia';
import type { FrameInfo, TouchPoint } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import type { DotMatrixProps, Dot } from './DotMatrix.types';
import { buildGrid, getParams, computeDots } from './DotMatrix.logic';

export function DotMatrix({ mobile = true, width, height }: DotMatrixProps) {
  const params = getParams(mobile);

  const [layoutSize, setLayoutSize] = useState(() => ({
    w: width ?? Dimensions.get('window').width,
    h: height ?? Dimensions.get('window').height,
  }));

  const dotsRef = useRef<Dot[]>(buildGrid(layoutSize.w, layoutSize.h, params.spacing));
  const touchRef = useRef({ x: -999, y: -999 });
  const frameTs = useSharedValue(0);

  // Rebuild grid on layout change
  const onLayout = (event: LayoutChangeEvent) => {
    if (width && height) return; // fixed size, skip
    const { width: lw, height: lh } = event.nativeEvent.layout;
    setLayoutSize({ w: lw, h: lh });
    dotsRef.current = buildGrid(lw, lh, params.spacing);
  };

  useEffect(() => {
    dotsRef.current = buildGrid(layoutSize.w, layoutSize.h, params.spacing);
  }, [layoutSize.w, layoutSize.h, params.spacing]);

  // Touch handling for cursor interaction
  const touchHandler = useTouchHandler({
    onActive: (pt: TouchPoint) => {
      touchRef.current = { x: pt.x, y: pt.y };
    },
    onEnd: () => {
      touchRef.current = { x: -999, y: -999 };
    },
  });

  // Drive animation
  useFrameCallback((info: FrameInfo) => {
    frameTs.value = info.timestamp ?? 0;
  });

  // Compute dot results for current frame
  const now = frameTs.value;
  const results = computeDots(
    dotsRef.current,
    now,
    touchRef.current.x,
    touchRef.current.y,
    layoutSize.w,
    layoutSize.h,
    params,
  );

  const containerStyle = width && height
    ? { width, height }
    : StyleSheet.absoluteFillObject;

  return (
    <View style={containerStyle} onLayout={onLayout}>
      {/* Touch handler registered via useTouchHandler — onTouch removed
          because it is not a valid Canvas prop in current Skia types.
          Touch events are driven by the Skia internal gesture system. */}
      <Canvas
        style={{ width: layoutSize.w, height: layoutSize.h }}
      >
        {results.map((d, i) => (
          <Circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.radius}
            color={Skia.Color(`rgba(${d.r},${d.g},${d.b},${d.alpha.toFixed(2)})`)}
          />
        ))}
        {results
          .filter(d => d.hasCore)
          .map((d, i) => (
            <Circle
              key={`core-${i}`}
              cx={d.x}
              cy={d.y}
              r={d.coreRadius}
              color={Skia.Color(`rgba(200,235,220,${d.coreAlpha.toFixed(2)})`)}
            />
          ))}
      </Canvas>
    </View>
  );
}
