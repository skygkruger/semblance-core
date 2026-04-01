/**
 * WireframeGlobe — 3D wireframe globe for Compute Mesh / Tunneling pages.
 * Canvas 2D rendering with depth-based line brightness for 3D effect.
 *
 * States: idle (slow rotation), connecting (accelerating search), connected (pin drop).
 */

import { useRef, useEffect, useState, useCallback } from 'react';

interface GlobeProps {
  /** Globe size in px */
  size?: number;
  /** Connection state */
  state?: 'idle' | 'connecting' | 'connected';
  /** Target coordinates [lat, lng] in degrees. Null = no target. */
  target?: [number, number] | null;
  /** User's coordinates [lat, lng] */
  origin?: [number, number];
}

// ─── Math helpers ───

function degToRad(d: number) { return d * Math.PI / 180; }

function latLngToXYZ(lat: number, lng: number, r: number): [number, number, number] {
  const la = degToRad(lat);
  const lo = degToRad(lng);
  return [
    r * Math.cos(la) * Math.sin(lo),
    r * Math.sin(la),
    r * Math.cos(la) * Math.cos(lo),
  ];
}

function rotateY(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotateX(x: number, y: number, z: number, a: number): [number, number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

function project(x: number, y: number, z: number, cx: number, cy: number, fov: number): { sx: number; sy: number; depth: number } {
  const scale = fov / (fov + z);
  return { sx: cx + x * scale, sy: cy - y * scale, depth: z };
}

// ─── Component ───

export function WireframeGlobe({
  size = 300,
  state = 'idle',
  target = null,
  origin = [37.7749, -122.4194], // default: SF
}: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const startTimeRef = useRef(performance.now());
  const [connectTime, setConnectTime] = useState<number | null>(null);

  // Track state transitions
  useEffect(() => {
    if (state === 'connecting') {
      setConnectTime(performance.now());
    } else if (state === 'connected') {
      // Pin drop starts
    }
  }, [state]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = performance.now();
    const elapsed = (now - startTimeRef.current) / 1000;
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.38;
    const fov = size * 1.2;

    ctx.clearRect(0, 0, size, size);

    // ─── Rotation ───
    let rotSpeed: number;
    if (state === 'idle') {
      rotSpeed = 0.08;
    } else if (state === 'connecting') {
      const connectElapsed = connectTime ? (now - connectTime) / 1000 : 0;
      rotSpeed = 0.08 + connectElapsed * 0.3; // accelerate
    } else {
      rotSpeed = 0.02; // slow after connected
    }

    const rotY = elapsed * rotSpeed;
    const tiltX = -0.3; // slight tilt to show north pole

    // ─── Opal color breathing ───
    const breath = Math.sin(elapsed * 0.4) * 0.5 + 0.5;
    const baseR = Math.round(130 + 40 * breath);
    const baseG = Math.round(140 + 40 * breath);
    const baseB = Math.round(175 + 25 * breath);

    // ─── Draw latitude lines ───
    const latStep = 30;
    const lngResolution = 3; // degrees per segment

    for (let lat = -90 + latStep; lat < 90; lat += latStep) {
      ctx.beginPath();
      let started = false;

      for (let lng = 0; lng <= 360; lng += lngResolution) {
        let [x, y, z] = latLngToXYZ(lat, lng, r);
        [x, y, z] = rotateY(x, y, z, rotY);
        [x, y, z] = rotateX(x, y, z, tiltX);

        const { sx, sy, depth } = project(x, y, z, cx, cy, fov);
        // Depth-based opacity: front face bright, back face dim
        const depthNorm = (depth + r) / (2 * r); // 0 = back, 1 = front
        const alpha = 0.06 + depthNorm * 0.25;

        if (!started) {
          ctx.moveTo(sx, sy);
          started = true;
        } else {
          ctx.lineTo(sx, sy);
        }

        // Per-segment coloring would be expensive, so we use a single stroke
        // and set opacity based on average depth
        ctx.strokeStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${alpha})`;
        ctx.lineWidth = 0.5 + depthNorm * 0.8;
      }
      ctx.stroke();
    }

    // ─── Draw longitude lines ───
    const lngStep = 30;
    const latResolution = 3;

    for (let lng = 0; lng < 360; lng += lngStep) {
      ctx.beginPath();
      let started = false;

      for (let lat = -90; lat <= 90; lat += latResolution) {
        let [x, y, z] = latLngToXYZ(lat, lng, r);
        [x, y, z] = rotateY(x, y, z, rotY);
        [x, y, z] = rotateX(x, y, z, tiltX);

        const { sx, sy, depth } = project(x, y, z, cx, cy, fov);
        const depthNorm = (depth + r) / (2 * r);
        const alpha = 0.06 + depthNorm * 0.25;

        if (!started) {
          ctx.moveTo(sx, sy);
          started = true;
        } else {
          ctx.lineTo(sx, sy);
        }

        ctx.strokeStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${alpha})`;
        ctx.lineWidth = 0.5 + depthNorm * 0.8;
      }
      ctx.stroke();
    }

    // ─── Intersection dots ───
    for (let lat = -90 + latStep; lat < 90; lat += latStep) {
      for (let lng = 0; lng < 360; lng += lngStep) {
        let [x, y, z] = latLngToXYZ(lat, lng, r);
        [x, y, z] = rotateY(x, y, z, rotY);
        [x, y, z] = rotateX(x, y, z, tiltX);

        const { sx, sy, depth } = project(x, y, z, cx, cy, fov);
        const depthNorm = (depth + r) / (2 * r);

        if (depthNorm > 0.3) { // only draw front-facing dots
          const dotAlpha = 0.1 + depthNorm * 0.4;
          const dotSize = 0.5 + depthNorm * 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${dotAlpha})`;
          ctx.fill();
        }
      }
    }

    // ─── Equator highlight ───
    ctx.beginPath();
    for (let lng = 0; lng <= 360; lng += 2) {
      let [x, y, z] = latLngToXYZ(0, lng, r);
      [x, y, z] = rotateY(x, y, z, rotY);
      [x, y, z] = rotateX(x, y, z, tiltX);

      const { sx, sy, depth } = project(x, y, z, cx, cy, fov);
      const depthNorm = (depth + r) / (2 * r);

      if (lng === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);

      ctx.strokeStyle = `rgba(${baseR + 20}, ${baseG + 20}, ${baseB + 10}, ${0.08 + depthNorm * 0.18})`;
      ctx.lineWidth = 0.8 + depthNorm * 1.0;
    }
    ctx.stroke();

    // ─── Connecting: radar sweep ───
    if (state === 'connecting') {
      const sweepAngle = (elapsed * 2) % (Math.PI * 2);
      const sweepR = r * 1.05;

      ctx.beginPath();
      ctx.arc(cx, cy, sweepR, sweepAngle, sweepAngle + 0.8);
      ctx.strokeStyle = 'rgba(110, 207, 163, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pulsing search ring
      const pulse = (Math.sin(elapsed * 6) + 1) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1.0 + pulse * 0.08), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(110, 207, 163, ${0.05 + pulse * 0.1})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ─── Connected: pin + arc ───
    if (state === 'connected' && target) {
      // Project target location
      let [tx, ty, tz] = latLngToXYZ(target[0], target[1], r);
      [tx, ty, tz] = rotateY(tx, ty, tz, rotY);
      [tx, ty, tz] = rotateX(tx, ty, tz, tiltX);
      const tProj = project(tx, ty, tz, cx, cy, fov);
      const tDepth = (tz + r) / (2 * r);

      if (tDepth > 0.3) { // only if on visible side
        // Pin drop animation
        const pinElapsed = connectTime ? Math.min(1, (now - connectTime) / 1000 / 1.5) : 1;
        const pinEased = 1 - Math.pow(1 - pinElapsed, 3);
        const pinY = tProj.sy - 20 * (1 - pinEased);

        // Pin glow
        ctx.beginPath();
        ctx.arc(tProj.sx, pinY, 4 + pinEased * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(110, 207, 163, ${0.3 * pinEased})`;
        ctx.fill();

        // Pin dot
        ctx.beginPath();
        ctx.arc(tProj.sx, pinY, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(110, 207, 163, ${0.8 * pinEased})`;
        ctx.fill();

        // Pin stem
        ctx.beginPath();
        ctx.moveTo(tProj.sx, pinY + 3);
        ctx.lineTo(tProj.sx, tProj.sy + 2);
        ctx.strokeStyle = `rgba(110, 207, 163, ${0.5 * pinEased})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Sonar pulse on landing
        if (pinElapsed >= 0.95) {
          const sonarElapsed = Math.max(0, pinElapsed - 0.95) / 0.05;
          const sonarR = 6 + sonarElapsed * 20;
          ctx.beginPath();
          ctx.arc(tProj.sx, tProj.sy, sonarR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(110, 207, 163, ${0.4 * (1 - sonarElapsed)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Origin point
      let [ox, oy, oz] = latLngToXYZ(origin[0], origin[1], r);
      [ox, oy, oz] = rotateY(ox, oy, oz, rotY);
      [ox, oy, oz] = rotateX(ox, oy, oz, tiltX);
      const oProj = project(ox, oy, oz, cx, cy, fov);
      const oDepth = (oz + r) / (2 * r);

      if (oDepth > 0.3) {
        ctx.beginPath();
        ctx.arc(oProj.sx, oProj.sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(110, 207, 163, 0.6)';
        ctx.fill();
      }
    }

    // ─── Ambient glow around globe ───
    const gradient = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.3);
    gradient.addColorStop(0, 'rgba(110, 207, 163, 0.02)');
    gradient.addColorStop(0.5, 'rgba(154, 168, 184, 0.01)');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    frameRef.current = requestAnimationFrame(draw);
  }, [size, state, target, origin, connectTime]);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [draw]);

  return (
    <div className="wireframe-globe" style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ imageRendering: 'auto' }}
      />
    </div>
  );
}
