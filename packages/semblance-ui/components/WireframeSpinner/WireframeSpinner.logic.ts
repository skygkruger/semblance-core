// ─── Pure geometry, shape morphing, and color math for WireframeSpinner ───
// No DOM, no React Native. Shared between web (Canvas 2D) and native (Skia).

export type Vec3 = [number, number, number];

// ─── Golden ratio geometry ───
const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;
const NORM = Math.sqrt(3);

// 20 vertices of a regular dodecahedron, normalized to unit sphere
const RAW: Vec3[] = [
  [1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],
  [-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1],
  [0,PHI,INV_PHI],[0,PHI,-INV_PHI],[0,-PHI,INV_PHI],[0,-PHI,-INV_PHI],
  [INV_PHI,0,PHI],[-INV_PHI,0,PHI],[INV_PHI,0,-PHI],[-INV_PHI,0,-PHI],
  [PHI,INV_PHI,0],[PHI,-INV_PHI,0],[-PHI,INV_PHI,0],[-PHI,-INV_PHI,0],
];

export const DODECA: Vec3[] = RAW.map(v =>
  [v[0] / NORM, v[1] / NORM, v[2] / NORM]
);

// 30 edges — pairs at dodecahedron edge distance
const EDGE_DIST_SQ = 4 / (3 * PHI * PHI);
export const EDGES: [number, number][] = [];
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

// ─── Shape targets ───

const SHAPE_SPHERE: Vec3[] = DODECA.map((v, i) => {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  const nx = v[0] / len, ny = v[1] / len, nz = v[2] / len;
  const r = 1.15 + Math.sin(i * 2.7) * 0.08;
  return [nx * r, ny * r, nz * r] as Vec3;
});

const SHAPE_TWIST: Vec3[] = DODECA.map(v => {
  const twist = v[1] * 1.2;
  const cosT = Math.cos(twist), sinT = Math.sin(twist);
  return [v[0] * cosT - v[2] * sinT, v[1] * 0.8, v[0] * sinT + v[2] * cosT] as Vec3;
});

const SHAPE_STAR: Vec3[] = DODECA.map((v, i) => {
  const scale = i % 2 === 0 ? 1.5 : 0.5;
  return [v[0] * scale, v[1] * scale, v[2] * scale] as Vec3;
});

const SHAPE_GEM: Vec3[] = DODECA.map(v => {
  const polar = Math.abs(v[1]) > 0.5;
  return (polar
    ? [v[0] * 0.5, v[1] * 1.3, v[2] * 0.5]
    : [v[0] * 1.3, v[1] * 0.6, v[2] * 1.3]) as Vec3;
});

const SHAPE_HELIX: Vec3[] = DODECA.map(v => {
  const angle = v[1] * 2.5;
  const radial = 0.25 * Math.sin(v[1] * Math.PI);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [(v[0] + radial) * cos - v[2] * sin, v[1] * 0.9, v[0] * sin + (v[2] + radial) * cos] as Vec3;
});

const SHAPE_BLOOM: Vec3[] = DODECA.map(v => {
  const scale = v[1] > 0 ? 1.0 + v[1] * 0.7 : 1.0 + v[1] * 0.3;
  return [v[0] * scale, v[1] * scale, v[2] * scale] as Vec3;
});

const SHAPE_RIPPLE: Vec3[] = DODECA.map(v => {
  const wave = 1.0 + 0.35 * Math.sin(v[1] * Math.PI * 2);
  return [v[0] * wave, v[1], v[2] * wave] as Vec3;
});

const SHAPE_SPIRE: Vec3[] = DODECA.map(v => {
  const taper = 0.4 + 0.6 * (1 - (v[1] + 1) / 2);
  return [v[0] * taper, v[1] * 1.2, v[2] * taper] as Vec3;
});

const SHAPE_CAGE: Vec3[] = DODECA.map(v => {
  const eq = 1 - Math.abs(v[1]);
  const scale = 0.6 + eq * 0.9;
  return [v[0] * scale, v[1] * 0.7, v[2] * scale] as Vec3;
});

export const BASE_SHAPES = [DODECA, SHAPE_SPHERE, SHAPE_TWIST, SHAPE_STAR, SHAPE_GEM, SHAPE_HELIX, SHAPE_BLOOM, SHAPE_RIPPLE, SHAPE_SPIRE, SHAPE_CAGE];
export const SHAPE_DURATION = 3.0;
export const TRANSITION_TIME = 1.2;

// ─── Procedural shape generation ───

function generateHybrid(seed: number): Vec3[] {
  const idxA = Math.abs(Math.floor(seed * 4.7)) % BASE_SHAPES.length;
  let idxB = Math.abs(Math.floor(seed * 7.3)) % BASE_SHAPES.length;
  if (idxB === idxA) idxB = (idxB + 1) % BASE_SHAPES.length;
  const a = BASE_SHAPES[idxA]!;
  const b = BASE_SHAPES[idxB]!;
  const mix = 0.2 + (Math.sin(seed * 13.7) * 0.5 + 0.5) * 0.6;
  return DODECA.map((_, i) => {
    const va = a[i]!, vb = b[i]!;
    const wobble = 0.12;
    return [
      va[0] * (1 - mix) + vb[0] * mix + Math.sin(seed * 3.1 + i * 2.1) * wobble,
      va[1] * (1 - mix) + vb[1] * mix + Math.cos(seed * 5.3 + i * 1.7) * wobble,
      va[2] * (1 - mix) + vb[2] * mix + Math.sin(seed * 7.9 + i * 3.3) * wobble,
    ] as Vec3;
  });
}

// Seeded PRNG — LCG
function lcg(s: number): number {
  return (s * 16807) % 2147483647;
}

// ─── Shape queue ───

export interface ShapeQueue {
  shapes: Vec3[][];
  consumed: number;
  seed: number;
}

export function createShapeQueue(): ShapeQueue {
  const queue: ShapeQueue = {
    shapes: [DODECA],
    consumed: 0,
    seed: Math.floor(Math.random() * 2147483646) + 1,
  };
  refillQueue(queue);
  refillQueue(queue);
  return queue;
}

function refillQueue(queue: ShapeQueue): void {
  const batch = [...BASE_SHAPES];
  for (let i = batch.length - 1; i > 0; i--) {
    queue.seed = lcg(queue.seed);
    const j = queue.seed % (i + 1);
    [batch[i], batch[j]] = [batch[j]!, batch[i]!];
  }
  queue.seed = lcg(queue.seed);
  const hybridCount = 2 + (queue.seed % 2);
  for (let h = 0; h < hybridCount; h++) {
    const hybrid = generateHybrid(queue.seed * 0.0001 + h * 53.1);
    queue.seed = lcg(queue.seed);
    const insertAt = queue.seed % (batch.length + 1);
    batch.splice(insertAt, 0, hybrid);
  }
  queue.shapes.push(...batch);
}

export function queueShape(queue: ShapeQueue, offset: number): Vec3[] {
  const idx = queue.consumed + offset;
  while (idx >= queue.shapes.length) {
    refillQueue(queue);
  }
  return queue.shapes[idx]!;
}

export function advanceQueue(queue: ShapeQueue): void {
  queue.consumed++;
  if (queue.consumed > 20) {
    queue.shapes.splice(0, queue.consumed - 2);
    queue.consumed = 2;
  }
}

// ─── Opal color ramp ───

const OPAL_RAMP: Vec3[] = [
  [97, 88, 128],
  [119, 110, 162],
  [154, 168, 184],
  [216, 221, 232],
  [154, 168, 184],
  [119, 110, 162],
];

export function sampleOpal(t: number): Vec3 {
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

// ─── Math helpers ───

export function lerpVert(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function rotateYXZ(v: Vec3, ay: number, ax: number, az: number): Vec3 {
  const x = v[0] * Math.cos(ay) - v[2] * Math.sin(ay);
  const z = v[0] * Math.sin(ay) + v[2] * Math.cos(ay);
  const y = v[1];
  const y2 = y * Math.cos(ax) - z * Math.sin(ax);
  const z2 = y * Math.sin(ax) + z * Math.cos(ax);
  const x3 = x * Math.cos(az) - y2 * Math.sin(az);
  const y3 = x * Math.sin(az) + y2 * Math.cos(az);
  return [x3, y3, z2];
}

// ─── Frame computation ───
// Returns projected 2D vertices + opal colors for each edge, ready for any renderer.

export interface FrameResult {
  projected: Vec3[]; // [screenX, screenY, z] per vertex
  edgeColors: Vec3[]; // [r, g, b] per edge (0–255)
  edgeDepthAlphas: number[]; // alpha per edge
  vertexDepthAlphas: number[]; // alpha per vertex
}

export function computeFrame(
  queue: ShapeQueue,
  shapeTime: number,
  totalTime: number,
  speed: number,
  size: number,
): FrameResult {
  const time = totalTime * speed;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.26;

  const shapeA = queueShape(queue, 0);
  const shapeB = queueShape(queue, 1);

  const holdTime = SHAPE_DURATION - TRANSITION_TIME;
  let blend = 0;
  if (shapeTime > holdTime) {
    blend = smoothstep((shapeTime - holdTime) / TRANSITION_TIME);
  }

  const verts = shapeA.map((va, i) => {
    const vb = shapeB[i]!;
    const base = lerpVert(va, vb, blend);
    const breath = 0.03;
    return [
      base[0] + Math.sin(time * 0.7 + i * 1.7) * breath,
      base[1] + Math.cos(time * 0.5 + i * 2.3) * breath,
      base[2] + Math.sin(time * 0.9 + i * 0.9) * breath,
    ] as Vec3;
  });

  const ay = time * 0.25;
  const ax = time * 0.15 + 0.4;
  const az = time * 0.09;

  const fov = 3.0;
  const projected = verts.map(v => {
    const rv = rotateYXZ(v, ay, ax, az);
    const scale = fov / (fov + rv[2]);
    return [cx + rv[0] * r * scale, cy + rv[1] * r * scale, rv[2]] as Vec3;
  });

  const sweepPhase = time * 0.12;

  const edgeColors: Vec3[] = [];
  const edgeDepthAlphas: number[] = [];
  for (const [a, b] of EDGES) {
    const pa = projected[a]!;
    const pb = projected[b]!;
    const midX = (pa[0] + pb[0]) / 2;
    const midY = (pa[1] + pb[1]) / 2;
    const sweepParam = (midX + midY) / (size * 2) + sweepPhase;
    const [cr, cg, cb] = sampleOpal(sweepParam);
    const midZ = (pa[2] + pb[2]) / 2;
    const depthAlpha = 0.3 + 0.5 * (1 - (midZ + 1) / 2);
    edgeColors.push([Math.round(cr), Math.round(cg), Math.round(cb)]);
    edgeDepthAlphas.push(depthAlpha);
  }

  const vertexDepthAlphas = projected.map(p =>
    0.4 + 0.5 * (1 - (p[2] + 1) / 2)
  );

  return { projected, edgeColors, edgeDepthAlphas, vertexDepthAlphas };
}
