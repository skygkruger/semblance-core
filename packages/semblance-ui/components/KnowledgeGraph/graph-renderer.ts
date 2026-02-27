import * as THREE from 'three';
import type { KnowledgeNode, KnowledgeEdge, NodeType } from './graph-types';
import { getNodeRadius, getNodeColor, getNodeColorHex } from './graph-physics';

// ─── Types ───

interface NodeMesh {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Sprite;
  label: THREE.Sprite | null;
  wireframe?: THREE.LineSegments;
  countSprite?: THREE.Sprite;
  node: KnowledgeNode;
}

export interface GraphRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  onNodeHover?: (node: KnowledgeNode | null) => void;
  onNodeSelect?: (node: KnowledgeNode | null) => void;
}

// ─── Geometry factories (reused across nodes) ───

const SHARED_GEO = {
  personSphere: new THREE.SphereGeometry(1, 24, 16),
  emailSphere: new THREE.SphereGeometry(1, 16, 12),
  fileBox: new THREE.BoxGeometry(1, 1, 1),
  calendarOcta: new THREE.OctahedronGeometry(1),
  topicSphere: new THREE.SphereGeometry(1, 12, 8),
  categoryIcosa: new THREE.IcosahedronGeometry(1, 1),
};

function getGeometryForType(type: NodeType): THREE.BufferGeometry {
  switch (type) {
    case 'person': return SHARED_GEO.personSphere;
    case 'email': return SHARED_GEO.emailSphere;
    case 'file': return SHARED_GEO.fileBox;
    case 'calendar': return SHARED_GEO.calendarOcta;
    case 'topic': return SHARED_GEO.topicSphere;
    case 'category': return SHARED_GEO.categoryIcosa;
  }
}

// ─── Glow texture cache (one per node type) ───

const glowTextureCache = new Map<NodeType, THREE.CanvasTexture>();

function getGlowTexture(type: NodeType): THREE.CanvasTexture {
  const cached = glowTextureCache.get(type);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const hex = getNodeColorHex(type);
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  gradient.addColorStop(0, hex + 'CC');   // 80% center
  gradient.addColorStop(0.3, hex + '44'); // 27% mid
  gradient.addColorStop(1, hex + '00');   // transparent edge

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  glowTextureCache.set(type, texture);
  return texture;
}

// ─── Category glow texture cache (one per color) ───

const categoryGlowCache = new Map<string, THREE.CanvasTexture>();

function getCategoryGlowTexture(hexColor: string): THREE.CanvasTexture {
  const cached = categoryGlowCache.get(hexColor);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  gradient.addColorStop(0, hexColor + 'AA');
  gradient.addColorStop(0.3, hexColor + '33');
  gradient.addColorStop(1, hexColor + '00');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  categoryGlowCache.set(hexColor, texture);
  return texture;
}

// ─── Edge color helpers ───

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

function getEdgeNodeColor(node: KnowledgeNode): string {
  if (node.type === 'category' && node.metadata?.color) return node.metadata.color;
  return getNodeColorHex(node.type);
}

// ─── GraphRenderer class ───

export class GraphRenderer {
  // Three.js core
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  // Scene objects
  private nodeMeshes: Map<string, NodeMesh> = new Map();
  private edgeLines: THREE.LineSegments | null = null;
  private edgePositions: Float32Array | null = null;
  private edgeColors: Float32Array | null = null;

  // Interaction state
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private neighborSet: Set<string> = new Set();
  private secondNeighborSet: Set<string> = new Set();

  // Trackball rotation
  private spherical = new THREE.Spherical(200, Math.PI / 2, 0);
  private targetSpherical = new THREE.Spherical(200, Math.PI / 2, 0);
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragSphericalStart = new THREE.Spherical();

  // Auto-fit: pull camera back so all nodes are visible
  private userHasZoomed = false;

  // Idle/wake
  private isIdle = false;
  private snapshotUrl: string | null = null;
  private animationFrameId: number | null = null;
  private lastInteraction = Date.now();

  // Focus animation
  private cameraTarget = new THREE.Vector3(0, 0, 0);
  private targetCameraTarget = new THREE.Vector3(0, 0, 0);

  // Snap-back animation (400ms ease-in-out)
  private snapAnimation: {
    startRadius: number;
    startPhi: number;
    startTheta: number;
    startTarget: THREE.Vector3;
    startTime: number;
  } | null = null;
  private static readonly SNAP_DURATION = 400;

  // Data
  private edges: KnowledgeEdge[] = [];
  private neighborMap: Map<string, Set<string>> = new Map();

  // Callbacks
  private onNodeHover?: (node: KnowledgeNode | null) => void;
  private onNodeSelect?: (node: KnowledgeNode | null) => void;

  // Canvas dimensions
  private width: number;
  private height: number;

  // Node scale multiplier: physics radius → scene units
  private static readonly SCALE = 0.25;

  constructor(options: GraphRendererOptions) {
    this.width = options.width;
    this.height = options.height;
    this.onNodeHover = options.onNodeHover;
    this.onNodeSelect = options.onNodeSelect;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 1, 5000);
    this.updateCameraFromSpherical();

    // Renderer — transparent canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.6);
    directional.position.set(50, 100, 80);
    this.scene.add(directional);

    const backLight = new THREE.DirectionalLight(0x6ECFA3, 0.2);
    backLight.position.set(-50, -50, -80);
    this.scene.add(backLight);

    // Events
    const canvas = options.canvas;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });

    // Start render loop
    this.startRenderLoop();
  }

  // ─── Public API ───

  setData(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): void {
    this.edges = edges;
    this.buildNeighborMap(edges);
    this.createNodeMeshes(nodes);
    this.createEdgeGeometry(edges, nodes);
  }

  updatePositions(nodes: KnowledgeNode[]): void {
    for (const node of nodes) {
      const mesh = this.nodeMeshes.get(node.id);
      if (mesh && node.x != null && node.y != null && node.z != null) {
        mesh.group.position.set(node.x, node.y, node.z ?? 0);
      }
    }
    this.updateEdgePositions();
    this.autoFitCamera();
    this.wake();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.wake();
  }

  getSnapshotUrl(): string | null {
    return this.snapshotUrl;
  }

  getIsIdle(): boolean {
    return this.isIdle;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  clearSelection(): void {
    this.selectedId = null;
    this.neighborSet.clear();
    this.secondNeighborSet.clear();
    this.targetCameraTarget.set(0, 0, 0);
    this.targetSpherical.radius = 200;
    this.resetCamera();
    this.updateNodeVisuals();
    this.onNodeSelect?.(null);
    this.wake();
  }

  private resetCamera(): void {
    this.snapAnimation = {
      startRadius: this.spherical.radius,
      startPhi: this.spherical.phi,
      startTheta: this.spherical.theta,
      startTarget: this.cameraTarget.clone(),
      startTime: performance.now(),
    };
  }

  dispose(): void {
    if (this.animationFrameId != null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('wheel', this.handleWheel);

    // Dispose meshes
    this.nodeMeshes.forEach(nm => {
      (nm.core.material as THREE.Material).dispose();
      (nm.glow.material as THREE.SpriteMaterial).map?.dispose();
      (nm.glow.material as THREE.Material).dispose();
      if (nm.label) {
        (nm.label.material as THREE.SpriteMaterial).map?.dispose();
        (nm.label.material as THREE.Material).dispose();
      }
      if (nm.wireframe) {
        nm.wireframe.geometry.dispose();
        (nm.wireframe.material as THREE.Material).dispose();
      }
      if (nm.countSprite) {
        (nm.countSprite.material as THREE.SpriteMaterial).map?.dispose();
        (nm.countSprite.material as THREE.Material).dispose();
      }
      this.scene.remove(nm.group);
    });
    this.nodeMeshes.clear();

    if (this.edgeLines) {
      this.edgeLines.geometry.dispose();
      (this.edgeLines.material as THREE.Material).dispose();
      this.scene.remove(this.edgeLines);
    }

    this.renderer.dispose();
  }

  // ─── Node mesh creation ───

  private createNodeMeshes(nodes: KnowledgeNode[]): void {
    // Clear existing
    this.nodeMeshes.forEach(nm => this.scene.remove(nm.group));
    this.nodeMeshes.clear();

    for (const node of nodes) {
      const radius = getNodeRadius(node);
      const geo = getGeometryForType(node.type);
      const isCategory = node.type === 'category';

      // Resolve color — categories use metadata.color
      const baseColor = getNodeColor(node.type);
      const colorValue = isCategory && node.metadata?.color
        ? new THREE.Color(node.metadata.color).getHex()
        : baseColor;

      // Core mesh — categories are translucent orbs
      const coreMat = new THREE.MeshPhongMaterial({
        color: colorValue,
        emissive: colorValue,
        emissiveIntensity: isCategory ? 0.25 : 0.15,
        transparent: true,
        opacity: isCategory ? 0.12 : 0.9,
      });
      const core = new THREE.Mesh(geo, coreMat);
      const scale = radius * GraphRenderer.SCALE;
      core.scale.set(scale, scale, scale);
      core.userData = { nodeId: node.id };

      // Glow sprite (billboard, additive blending)
      const glow = this.createGlowSprite(node, radius);

      // Label sprite
      const label = this.createLabelSprite(node, radius);

      // Group
      const group = new THREE.Group();
      group.add(core);
      group.add(glow);
      if (label) group.add(label);
      group.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
      group.userData = { nodeId: node.id };

      // Category extras: dashed wireframe shell + count label
      let wireframe: THREE.LineSegments | undefined;
      let countSprite: THREE.Sprite | undefined;

      if (isCategory) {
        const catHex = node.metadata?.color ?? '#6ECFA3';
        const wireGeo = new THREE.EdgesGeometry(SHARED_GEO.categoryIcosa, 15);
        const wireMat = new THREE.LineDashedMaterial({
          color: new THREE.Color(catHex),
          dashSize: 0.3,
          gapSize: 0.15,
          transparent: true,
          opacity: 0.6,
        });
        wireframe = new THREE.LineSegments(wireGeo, wireMat);
        wireframe.computeLineDistances();
        const wireScale = scale * 1.15;
        wireframe.scale.set(wireScale, wireScale, wireScale);
        group.add(wireframe);

        if (node.metadata?.nodeCount != null) {
          countSprite = this.createCountSprite(node.metadata.nodeCount);
          group.add(countSprite);
        }
      }

      this.scene.add(group);
      this.nodeMeshes.set(node.id, { group, core, glow, label, wireframe, countSprite, node });
    }
  }

  private createGlowSprite(node: KnowledgeNode, radius: number): THREE.Sprite {
    const isCategory = node.type === 'category';
    const texture = isCategory
      ? getCategoryGlowTexture(node.metadata?.color ?? '#6ECFA3')
      : getGlowTexture(node.type);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: isCategory ? 0.45 : 0.6,
    });

    const sprite = new THREE.Sprite(material);
    const typeScale = isCategory ? 1.6 : (node.type === 'person' ? 1.4 : 1.0);
    const glowScale = radius * typeScale * GraphRenderer.SCALE;
    sprite.scale.set(glowScale, glowScale, 1);
    return sprite;
  }

  private createLabelSprite(node: KnowledgeNode, radius: number): THREE.Sprite | null {
    // Category nodes always get labels
    if (node.type === 'category') return this.buildLabelSprite(node, radius);
    // Topic nodes never get labels
    if (node.type === 'topic') return null;
    // Show labels for nodes with meaningful weight — legible at a glance
    if (node.weight < 5) return null;

    return this.buildLabelSprite(node, radius);
  }

  private buildLabelSprite(node: KnowledgeNode, radius: number): THREE.Sprite {
    const text = node.label;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Large canvas font for crisp rendering, then scale sprite down in scene
    const fontSize = 40;
    const font = `500 ${fontSize}px DM Sans, system-ui, sans-serif`;
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const pad = 32;
    const w = Math.ceil(metrics.width) + pad;
    const h = fontSize + 20;

    canvas.width = w;
    canvas.height = h;

    // Re-set font after canvas resize
    ctx.font = font;
    ctx.fillStyle = node.weight >= 12 ? '#EEF1F4' : '#B0B8C4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: node.weight >= 12 ? 0.95 : 0.7,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    const sceneScale = radius * GraphRenderer.SCALE;
    sprite.position.y = -(sceneScale + 4);
    // Scale factor: at camera distance 200, FOV 60, ~3.9px per scene unit.
    // Target: ~14px text on screen → need ~3.6 scene-unit height for text.
    // Canvas text is fontSize/h of total → sprite height = 3.6 / (fontSize/h) = 3.6 * h / fontSize
    // spriteHeight = 3.6 * 60 / 40 = 5.4 → scale = 5.4 / h = 5.4 / 60 = 0.09
    const scaleFactor = 0.09;
    sprite.scale.set(w * scaleFactor, h * scaleFactor, 1);
    sprite.userData = { isLabel: true };
    return sprite;
  }

  private createCountSprite(count: number): THREE.Sprite {
    const text = String(count);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const fontSize = 56;
    const font = `700 ${fontSize}px DM Mono, monospace`;
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const pad = 24;
    const w = Math.ceil(metrics.width) + pad;
    const h = fontSize + 16;

    canvas.width = w;
    canvas.height = h;

    ctx.font = font;
    ctx.fillStyle = '#EEF1F4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    const scaleFactor = 0.08;
    sprite.scale.set(w * scaleFactor, h * scaleFactor, 1);
    return sprite;
  }

  // ─── Edge geometry ───

  private createEdgeGeometry(edges: KnowledgeEdge[], nodes: KnowledgeNode[]): void {
    if (this.edgeLines) {
      this.edgeLines.geometry.dispose();
      (this.edgeLines.material as THREE.Material).dispose();
      this.scene.remove(this.edgeLines);
    }

    const positions = new Float32Array(edges.length * 6);
    const colors = new Float32Array(edges.length * 6); // 2 vertices × 3 RGB per edge
    this.edgePositions = positions;
    this.edgeColors = colors;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Max opacity across all edge types — used as material opacity
    // Cat-to-cat: 0.7, cross-category: 0.6, same: 0.25, fallback: 0.12
    const maxOpacity = 0.7;

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i]!;
      const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      const src = nodeMap.get(srcId);
      const tgt = nodeMap.get(tgtId);

      // Positions
      const pOff = i * 6;
      positions[pOff] = src?.x ?? 0;
      positions[pOff + 1] = src?.y ?? 0;
      positions[pOff + 2] = src?.z ?? 0;
      positions[pOff + 3] = tgt?.x ?? 0;
      positions[pOff + 4] = tgt?.y ?? 0;
      positions[pOff + 5] = tgt?.z ?? 0;

      // Colors — determine edge type and assign vertex colors
      const cOff = i * 6;
      if (!src || !tgt) {
        // Fallback: dim white
        const f = 0.12 / maxOpacity;
        colors[cOff] = f; colors[cOff + 1] = f; colors[cOff + 2] = f;
        colors[cOff + 3] = f; colors[cOff + 4] = f; colors[cOff + 5] = f;
        continue;
      }

      const srcColor = getEdgeNodeColor(src);
      const tgtColor = getEdgeNodeColor(tgt);
      const srcRgb = hexToRgb(srcColor);
      const tgtRgb = hexToRgb(tgtColor);
      const bothCategory = src.type === 'category' && tgt.type === 'category';
      const sameColor = srcColor.toLowerCase() === tgtColor.toLowerCase();

      let scale: number;
      if (bothCategory) {
        // Category-to-category: always full brightness at 0.7 opacity
        scale = 1.0;
      } else if (sameColor) {
        // Same category: flat color, 0.25 effective opacity
        scale = 0.25 / maxOpacity;
      } else {
        // Cross-category: gradient, 0.6 effective opacity
        scale = 0.6 / maxOpacity;
      }

      colors[cOff] = srcRgb[0] * scale;
      colors[cOff + 1] = srcRgb[1] * scale;
      colors[cOff + 2] = srcRgb[2] * scale;
      colors[cOff + 3] = tgtRgb[0] * scale;
      colors[cOff + 4] = tgtRgb[1] * scale;
      colors[cOff + 5] = tgtRgb[2] * scale;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: maxOpacity,
      depthWrite: false,
    });

    this.edgeLines = new THREE.LineSegments(geo, mat);
    this.scene.add(this.edgeLines);
  }

  private updateEdgePositions(): void {
    if (!this.edgeLines || !this.edgePositions) return;

    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i]!;
      const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      const srcMesh = this.nodeMeshes.get(srcId);
      const tgtMesh = this.nodeMeshes.get(tgtId);
      const offset = i * 6;
      if (srcMesh) {
        this.edgePositions[offset] = srcMesh.group.position.x;
        this.edgePositions[offset + 1] = srcMesh.group.position.y;
        this.edgePositions[offset + 2] = srcMesh.group.position.z;
      }
      if (tgtMesh) {
        this.edgePositions[offset + 3] = tgtMesh.group.position.x;
        this.edgePositions[offset + 4] = tgtMesh.group.position.y;
        this.edgePositions[offset + 5] = tgtMesh.group.position.z;
      }
    }

    const attr = this.edgeLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  // ─── Neighbor map ───

  private buildNeighborMap(edges: KnowledgeEdge[]): void {
    this.neighborMap.clear();
    for (const e of edges) {
      const srcId = typeof e.source === 'object' ? e.source.id : e.source;
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
      if (!this.neighborMap.has(srcId)) this.neighborMap.set(srcId, new Set());
      if (!this.neighborMap.has(tgtId)) this.neighborMap.set(tgtId, new Set());
      this.neighborMap.get(srcId)!.add(tgtId);
      this.neighborMap.get(tgtId)!.add(srcId);
    }
  }

  private getSecondNeighborIds(nodeId: string): Set<string> {
    const firstNeighbors = this.neighborMap.get(nodeId) ?? new Set<string>();
    const second = new Set<string>();
    firstNeighbors.forEach(id => {
      const nn = this.neighborMap.get(id);
      if (nn) {
        nn.forEach(n => {
          if (n !== nodeId && !firstNeighbors.has(n)) second.add(n);
        });
      }
    });
    return second;
  }

  // ─── Visual state updates ───

  private updateNodeVisuals(): void {
    const activeId = this.selectedId ?? this.hoveredId;

    this.nodeMeshes.forEach((nm, nodeId) => {
      const coreMat = nm.core.material as THREE.MeshPhongMaterial;
      const glowMat = nm.glow.material as THREE.SpriteMaterial;
      const isCategory = nm.node.type === 'category';
      const defaultOpacity = isCategory ? 0.12 : 0.9;

      if (!activeId) {
        // Default state
        coreMat.opacity = defaultOpacity;
        coreMat.emissiveIntensity = isCategory ? 0.25 : 0.15;
        glowMat.opacity = isCategory ? 0.45 : 0.6;
        if (nm.wireframe) (nm.wireframe.material as THREE.LineDashedMaterial).opacity = 0.6;
        if (nm.countSprite) (nm.countSprite.material as THREE.SpriteMaterial).opacity = 0.95;
        // Label visibility
        if (nm.label) {
          (nm.label.material as THREE.SpriteMaterial).opacity =
            isCategory ? 0.95 : (nm.node.weight >= 12 ? 0.9 : 0.6);
          nm.label.visible = true;
        }
      } else if (nodeId === activeId) {
        // Focused node — bright, stronger emissive for expanded anchor effect
        coreMat.opacity = isCategory ? 0.18 : 1.0;
        coreMat.emissiveIntensity = isCategory ? 0.4 : 0.5;
        glowMat.opacity = isCategory ? 0.7 : 1.0;
        if (nm.wireframe) (nm.wireframe.material as THREE.LineDashedMaterial).opacity = 0.9;
        if (nm.countSprite) (nm.countSprite.material as THREE.SpriteMaterial).opacity = 1.0;
        if (nm.label) {
          (nm.label.material as THREE.SpriteMaterial).opacity = 1.0;
          nm.label.visible = true;
        }
      } else if (this.neighborSet.has(nodeId)) {
        // Direct neighbor — clearly visible
        coreMat.opacity = isCategory ? 0.15 : 0.75;
        coreMat.emissiveIntensity = 0.2;
        glowMat.opacity = 0.5;
        if (nm.wireframe) (nm.wireframe.material as THREE.LineDashedMaterial).opacity = 0.4;
        if (nm.countSprite) (nm.countSprite.material as THREE.SpriteMaterial).opacity = 0.7;
        // Show label for neighbors on focus
        this.ensureLabel(nm);
        if (nm.label) {
          (nm.label.material as THREE.SpriteMaterial).opacity = 0.7;
          nm.label.visible = true;
        }
      } else if (this.secondNeighborSet.has(nodeId)) {
        // 2nd degree — faintly visible
        coreMat.opacity = isCategory ? 0.2 : 0.3;
        coreMat.emissiveIntensity = 0.05;
        glowMat.opacity = 0.15;
        if (nm.wireframe) (nm.wireframe.material as THREE.LineDashedMaterial).opacity = 0.15;
        if (nm.countSprite) (nm.countSprite.material as THREE.SpriteMaterial).opacity = 0.3;
        if (nm.label) nm.label.visible = false;
      } else {
        // Unrelated — nearly gone (categories stay slightly visible as landmarks)
        coreMat.opacity = isCategory ? 0.12 : 0.08;
        coreMat.emissiveIntensity = 0.0;
        glowMat.opacity = 0.0;
        if (nm.wireframe) (nm.wireframe.material as THREE.LineDashedMaterial).opacity = 0.08;
        if (nm.countSprite) (nm.countSprite.material as THREE.SpriteMaterial).opacity = 0.1;
        if (nm.label) nm.label.visible = false;
      }
    });

    // Edge opacity — dim during selection focus
    if (this.edgeLines) {
      const mat = this.edgeLines.material as THREE.LineBasicMaterial;
      mat.opacity = activeId ? 0.08 : 0.7;
    }
  }

  /** Ensure a node has a label sprite (create on-demand for neighbors during focus) */
  private ensureLabel(nm: NodeMesh): void {
    if (nm.label || nm.node.type === 'topic') return;
    const radius = getNodeRadius(nm.node);
    const label = this.buildLabelSprite(nm.node, radius);
    nm.label = label;
    nm.group.add(label);
  }

  // ─── Auto-fit camera ───

  private autoFitCamera(): void {
    // Don't fight the user's manual zoom
    if (this.userHasZoomed || this.selectedId) return;

    // Find the furthest node from the camera target
    let maxDist = 0;
    this.nodeMeshes.forEach(nm => {
      const dist = nm.group.position.distanceTo(this.targetCameraTarget);
      if (dist > maxDist) maxDist = dist;
    });

    if (maxDist === 0) return;

    // Camera distance needed to fit a sphere of radius `maxDist` in the frustum
    // visible half-height at distance d = d * tan(fov/2)
    // We need visible half-height >= maxDist + margin
    // d >= (maxDist + margin) / tan(fov/2)
    const margin = 40;
    const fovRad = (this.camera.fov / 2) * (Math.PI / 180);
    const neededDistance = (maxDist + margin) / Math.tan(fovRad);
    const minDistance = 100;

    const fitRadius = Math.max(neededDistance, minDistance);

    // Only push out, never pull in automatically (avoid jittery zoom)
    if (fitRadius > this.targetSpherical.radius) {
      this.targetSpherical.radius = fitRadius;
    }
  }

  // ─── Camera ───

  private updateCameraFromSpherical(): void {
    const pos = new THREE.Vector3().setFromSpherical(this.spherical);
    pos.add(this.cameraTarget);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.cameraTarget);
  }

  // ─── Render loop ───

  private startRenderLoop(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      if (this.snapAnimation) {
        // Time-based snap animation (400ms ease-in-out quad)
        const elapsed = performance.now() - this.snapAnimation.startTime;
        const t = Math.min(elapsed / GraphRenderer.SNAP_DURATION, 1);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        this.spherical.radius = this.snapAnimation.startRadius + (this.targetSpherical.radius - this.snapAnimation.startRadius) * eased;
        this.spherical.phi = this.snapAnimation.startPhi + (this.targetSpherical.phi - this.snapAnimation.startPhi) * eased;
        this.spherical.theta = this.snapAnimation.startTheta + (this.targetSpherical.theta - this.snapAnimation.startTheta) * eased;
        this.cameraTarget.lerpVectors(this.snapAnimation.startTarget, this.targetCameraTarget, eased);

        if (t >= 1) this.snapAnimation = null;
      } else {
        // Normal per-frame lerp
        this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * 0.08;
        this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * 0.08;
        this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * 0.08;
        this.cameraTarget.lerp(this.targetCameraTarget, 0.06);
      }

      this.updateCameraFromSpherical();

      this.renderer.render(this.scene, this.camera);

      // Check idle
      if (!this.isIdle && Date.now() - this.lastInteraction > 2000) {
        this.goIdle();
      }
    };
    animate();
  }

  private wake(): void {
    this.lastInteraction = Date.now();
    if (this.isIdle) {
      this.isIdle = false;
      this.snapshotUrl = null;
    }
  }

  private goIdle(): void {
    this.isIdle = true;
    try {
      this.renderer.render(this.scene, this.camera);
      this.snapshotUrl = this.renderer.domElement.toDataURL('image/png');
    } catch {
      this.snapshotUrl = null;
    }
  }

  // ─── Interaction handlers ───

  private handlePointerDown = (e: PointerEvent): void => {
    this.wake();
    this.snapAnimation = null; // cancel any running snap
    this.isDragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.dragSphericalStart.copy(this.targetSpherical);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    this.wake();
    const rect = this.renderer.domElement.getBoundingClientRect();

    if (this.isDragging) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;

      this.targetSpherical.theta = this.dragSphericalStart.theta - dx * 0.005;
      this.targetSpherical.phi = Math.max(
        0.1,
        Math.min(Math.PI - 0.1, this.dragSphericalStart.phi - dy * 0.005),
      );
      return;
    }

    // Hover detection via raycaster
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const coreObjects: THREE.Object3D[] = [];
    this.nodeMeshes.forEach(nm => coreObjects.push(nm.core));
    const intersects = this.raycaster.intersectObjects(coreObjects);

    const hitId = intersects.length > 0 ? intersects[0]!.object.userData.nodeId : null;

    if (hitId !== this.hoveredId) {
      this.hoveredId = hitId;
      if (!this.selectedId) {
        if (hitId) {
          this.neighborSet = this.neighborMap.get(hitId) ?? new Set();
          this.secondNeighborSet = this.getSecondNeighborIds(hitId);
        } else {
          this.neighborSet.clear();
          this.secondNeighborSet.clear();
        }
        this.updateNodeVisuals();
      }
      const hoveredNode = hitId ? this.nodeMeshes.get(hitId)?.node ?? null : null;
      this.onNodeHover?.(hoveredNode);
    }

    // Set cursor
    this.renderer.domElement.style.cursor = hitId ? 'pointer' : (this.isDragging ? 'grabbing' : 'grab');
  };

  private handlePointerUp = (e: PointerEvent): void => {
    const wasDragging = this.isDragging;
    const dx = Math.abs(e.clientX - this.dragStart.x);
    const dy = Math.abs(e.clientY - this.dragStart.y);
    const wasClick = dx < 5 && dy < 5;

    this.isDragging = false;

    if (!wasClick || !wasDragging) return;

    // Click detection
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const coreObjects: THREE.Object3D[] = [];
    this.nodeMeshes.forEach(nm => coreObjects.push(nm.core));
    const intersects = this.raycaster.intersectObjects(coreObjects);

    if (intersects.length > 0) {
      const nodeId = intersects[0]!.object.userData.nodeId as string;
      if (this.selectedId === nodeId) {
        this.clearSelection();
      } else {
        // Select
        this.selectedId = nodeId;
        this.neighborSet = this.neighborMap.get(nodeId) ?? new Set();
        this.secondNeighborSet = this.getSecondNeighborIds(nodeId);
        this.updateNodeVisuals();

        // Camera focus
        const nm = this.nodeMeshes.get(nodeId);
        if (nm) {
          this.targetCameraTarget.copy(nm.group.position);
          this.targetSpherical.radius = 120;
        }

        this.onNodeSelect?.(nm?.node ?? null);
      }
    } else {
      this.clearSelection();
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.wake();
    this.userHasZoomed = true;
    const delta = e.deltaY > 0 ? 1.08 : 0.92;
    this.targetSpherical.radius = Math.max(50, Math.min(1500, this.targetSpherical.radius * delta));
  };
}
