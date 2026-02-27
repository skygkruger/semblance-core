import { useRef, useEffect } from 'react';

interface WireframeSpinnerProps {
  size?: number;
  speed?: number;
}

// ─── Golden ratio geometry ───
const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;
const NORM = Math.sqrt(3);

// 20 vertices of a regular dodecahedron, normalized to unit sphere
const RAW: [number, number, number][] = [
  [1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],
  [-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1],
  [0,PHI,INV_PHI],[0,PHI,-INV_PHI],[0,-PHI,INV_PHI],[0,-PHI,-INV_PHI],
  [INV_PHI,0,PHI],[-INV_PHI,0,PHI],[INV_PHI,0,-PHI],[-INV_PHI,0,-PHI],
  [PHI,INV_PHI,0],[PHI,-INV_PHI,0],[-PHI,INV_PHI,0],[-PHI,-INV_PHI,0],
];

const DODECA: [number, number, number][] = RAW.map(v =>
  [v[0] / NORM, v[1] / NORM, v[2] / NORM]
);

// 30 edges — pairs at dodecahedron edge distance
const EDGE_DIST_SQ = 4 / (3 * PHI * PHI);
const EDGES: [number, number][] = [];
for (let i = 0; i < 20; i++) {
  for (let j = i + 1; j < 20; j++) {
    const dx = DODECA[i]![0] - DODECA[j]![0];
    const dy = DODECA[i]![1] - DODECA[j]![1];
    const dz = DODECA[i]![2] - DODECA[j]![2];
    if (Math.abs(dx * dx + dy * dy + dz * dz - EDGE_DIST_SQ) < 0.01) {
      EDGES.push([i, j]);
    }
  }
}

// ─── Shape targets — the wireframe morphs between these ───

// Shape 1: Dodecahedron (base)
const SHAPE_DODECA = DODECA;

// Shape 2: Inflated sphere — push all vertices to uniform radius, randomize slightly
const SHAPE_SPHERE: [number, number, number][] = DODECA.map((v, i) => {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  const nx = v[0] / len;
  const ny = v[1] / len;
  const nz = v[2] / len;
  // Push outward + slight unique offset per vertex
  const r = 1.15 + Math.sin(i * 2.7) * 0.08;
  return [nx * r, ny * r, nz * r] as [number, number, number];
});

// Shape 3: Compressed disc — flatten Y, stretch X/Z
const SHAPE_DISC: [number, number, number][] = DODECA.map(v => {
  return [v[0] * 1.4, v[1] * 0.2, v[2] * 1.4] as [number, number, number];
});

// Shape 4: Twisted — top rotates clockwise, bottom counter-clockwise
const SHAPE_TWIST: [number, number, number][] = DODECA.map(v => {
  const twist = v[1] * 1.2; // twist amount based on Y position
  const cosT = Math.cos(twist);
  const sinT = Math.sin(twist);
  return [
    v[0] * cosT - v[2] * sinT,
    v[1] * 0.8,
    v[0] * sinT + v[2] * cosT,
  ] as [number, number, number];
});

// Shape 5: Star burst — alternating vertices pushed far out / pulled in
const SHAPE_STAR: [number, number, number][] = DODECA.map((v, i) => {
  const scale = i % 2 === 0 ? 1.5 : 0.5;
  return [v[0] * scale, v[1] * scale, v[2] * scale] as [number, number, number];
});

const BASE_SHAPES = [SHAPE_DODECA, SHAPE_SPHERE, SHAPE_TWIST, SHAPE_DISC, SHAPE_STAR];
const SHAPE_DURATION = 3.0; // seconds per shape
const TRANSITION_TIME = 1.2; // seconds to blend between shapes

// ─── Procedural shape generation ───
// Generate a random hybrid shape by blending two base shapes with per-vertex noise
function generateHybrid(seed: number): [number, number, number][] {
  const idxA = Math.abs(Math.floor(seed * 4.7)) % BASE_SHAPES.length;
  let idxB = Math.abs(Math.floor(seed * 7.3)) % BASE_SHAPES.length;
  if (idxB === idxA) idxB = (idxB + 1) % BASE_SHAPES.length; // ensure different bases
  const a = BASE_SHAPES[idxA]!;
  const b = BASE_SHAPES[idxB]!;
  const mix = 0.3 + (Math.sin(seed * 13.7) * 0.5 + 0.5) * 0.4; // 0.3–0.7
  return DODECA.map((_, i) => {
    const va = a[i]!;
    const vb = b[i]!;
    const wobble = 0.08;
    return [
      va[0] * (1 - mix) + vb[0] * mix + Math.sin(seed * 3.1 + i * 2.1) * wobble,
      va[1] * (1 - mix) + vb[1] * mix + Math.cos(seed * 5.3 + i * 1.7) * wobble,
      va[2] * (1 - mix) + vb[2] * mix + Math.sin(seed * 7.9 + i * 3.3) * wobble,
    ] as [number, number, number];
  });
}

// Seeded PRNG — LCG returning next state
function lcg(s: number): number {
  return (s * 16807) % 2147483647;
}

// ─── Continuous shape queue ───
// Instead of fixed cycles, we maintain a running queue of shapes.
// When the queue runs low, we append a new shuffled+hybrid batch.
// This eliminates cycle boundary jumps entirely.
type Vec3 = [number, number, number];

interface ShapeQueue {
  shapes: Vec3[][];
  consumed: number; // how many shapes we've moved past
  seed: number;     // evolving PRNG state
}

function createShapeQueue(): ShapeQueue {
  const queue: ShapeQueue = {
    shapes: [SHAPE_DODECA], // start with dodecahedron
    consumed: 0,
    seed: Math.floor(Math.random() * 2147483646) + 1, // random initial seed
  };
  refillQueue(queue);
  refillQueue(queue);
  return queue;
}

function refillQueue(queue: ShapeQueue): void {
  // Shuffle base shapes
  const batch = [...BASE_SHAPES];
  for (let i = batch.length - 1; i > 0; i--) {
    queue.seed = lcg(queue.seed);
    const j = queue.seed % (i + 1);
    [batch[i], batch[j]] = [batch[j]!, batch[i]!];
  }
  // Generate 1-2 hybrids and insert at seeded positions
  queue.seed = lcg(queue.seed);
  const hybridCount = 1 + (queue.seed % 2);
  for (let h = 0; h < hybridCount; h++) {
    const hybrid = generateHybrid(queue.seed * 0.0001 + h * 53.1);
    queue.seed = lcg(queue.seed);
    const insertAt = queue.seed % (batch.length + 1);
    batch.splice(insertAt, 0, hybrid);
  }
  queue.shapes.push(...batch);
}

// Get shape at a given queue index (0 = current, 1 = next)
function queueShape(queue: ShapeQueue, offset: number): Vec3[] {
  const idx = queue.consumed + offset;
  // Ensure we have enough shapes ahead
  while (idx >= queue.shapes.length) {
    refillQueue(queue);
  }
  return queue.shapes[idx]!;
}

// Advance past a consumed shape, trimming memory periodically
function advanceQueue(queue: ShapeQueue): void {
  queue.consumed++;
  // Trim old shapes to prevent unbounded growth (keep a small buffer behind)
  if (queue.consumed > 20) {
    queue.shapes.splice(0, queue.consumed - 2);
    queue.consumed = 2;
  }
}

// ─── Opal color ramp — balanced purple-silver ───
const OPAL_RAMP: [number, number, number][] = [
  [97,  88, 128],
  [119, 110, 162],
  [154, 168, 184],
  [216, 221, 232],
  [154, 168, 184],
  [119, 110, 162],
];

function sampleOpal(t: number): [number, number, number] {
  const len = OPAL_RAMP.length;
  const pos = ((t % 1) + 1) % 1 * len;
  const idx = Math.floor(pos);
  const frac = pos - idx;
  const a = OPAL_RAMP[idx % len]!;
  const b = OPAL_RAMP[(idx + 1) % len]!;
  return [
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac,
  ];
}

function lerpVert(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

// Smooth step for organic transitions (ease in-out)
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function rotateYXZ(
  v: [number, number, number],
  ay: number, ax: number, az: number,
): [number, number, number] {
  const x = v[0] * Math.cos(ay) - v[2] * Math.sin(ay);
  const z = v[0] * Math.sin(ay) + v[2] * Math.cos(ay);
  const y = v[1];
  const y2 = y * Math.cos(ax) - z * Math.sin(ax);
  const z2 = y * Math.sin(ax) + z * Math.cos(ax);
  const x3 = x * Math.cos(az) - y2 * Math.sin(az);
  const y3 = x * Math.sin(az) + y2 * Math.cos(az);
  return [x3, y3, z2];
}

export function WireframeSpinner({
  size = 48,
  speed = 1.0,
}: WireframeSpinnerProps) {
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

    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.32;

    let t = 0;
    let shapeTime = 0; // time spent on current shape pair
    const queue = createShapeQueue();

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      const s = speed;
      const time = t * s;
      const dt = 0.016 * s;

      // ─── Shape morphing with continuous queue ───
      shapeTime += dt;

      // Advance to next shape when duration is complete
      while (shapeTime >= SHAPE_DURATION) {
        shapeTime -= SHAPE_DURATION;
        advanceQueue(queue);
      }

      const shapeA = queueShape(queue, 0);
      const shapeB = queueShape(queue, 1);

      // Blend factor: hold shape, then transition
      const holdTime = SHAPE_DURATION - TRANSITION_TIME;
      let blend = 0;
      if (shapeTime > holdTime) {
        blend = smoothstep((shapeTime - holdTime) / TRANSITION_TIME);
      }

      // Interpolate vertices between current and next shape
      const verts = shapeA.map((va, i) => {
        const vb = shapeB[i]!;
        const base = lerpVert(va, vb, blend);
        // Add subtle organic breathing on top of the shape morph
        const breath = 0.03;
        return [
          base[0] + Math.sin(time * 0.7 + i * 1.7) * breath,
          base[1] + Math.cos(time * 0.5 + i * 2.3) * breath,
          base[2] + Math.sin(time * 0.9 + i * 0.9) * breath,
        ] as [number, number, number];
      });

      // Slow multi-axis rotation
      const ay = time * 0.25;
      const ax = time * 0.15 + 0.4;
      const az = time * 0.09;

      // Rotate + project
      const fov = 3.0;
      const projected = verts.map(v => {
        const rv = rotateYXZ(v, ay, ax, az);
        const scale = fov / (fov + rv[2]);
        return [cx + rv[0] * r * scale, cy + rv[1] * r * scale, rv[2]] as [number, number, number];
      });

      // Opal sweep phase
      const sweepPhase = time * 0.12;

      // Draw edges with opal shimmer
      ctx.lineWidth = 0.8;
      for (const [a, b] of EDGES) {
        const pa = projected[a]!;
        const pb = projected[b]!;
        const midX = (pa[0] + pb[0]) / 2;
        const midY = (pa[1] + pb[1]) / 2;
        const sweepParam = (midX + midY) / (size * 2) + sweepPhase;
        const [cr, cg, cb] = sampleOpal(sweepParam);
        const midZ = (pa[2] + pb[2]) / 2;
        const depthAlpha = 0.3 + 0.5 * (1 - (midZ + 1) / 2);

        ctx.strokeStyle = `rgba(${Math.round(cr)},${Math.round(cg)},${Math.round(cb)},${depthAlpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
      }

      // Draw vertices — bright silver dots
      for (const [px, py, pz] of projected) {
        const depthAlpha = 0.4 + 0.5 * (1 - (pz + 1) / 2);
        ctx.beginPath();
        ctx.arc(px, py, 1.0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(216,221,232,${depthAlpha.toFixed(2)})`;
        ctx.fill();
      }

      t += 0.016;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, speed]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block' }}
      aria-label="Loading"
      role="status"
    />
  );
}
