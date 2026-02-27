import * as THREE from 'three';
import type { KnowledgeNode, KnowledgeEdge, NodeType } from './graph-types';
import { getNodeRadius, getNodeColor, getNodeColorHex } from './graph-physics';

// ─── Types ───

interface NodeMesh {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Sprite;
  label: THREE.Sprite | null;
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
};

function getGeometryForType(type: NodeType): THREE.BufferGeometry {
  switch (type) {
    case 'person': return SHARED_GEO.personSphere;
    case 'email': return SHARED_GEO.emailSphere;
    case 'file': return SHARED_GEO.fileBox;
    case 'calendar': return SHARED_GEO.calendarOcta;
    case 'topic': return SHARED_GEO.topicSphere;
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
    this.updateNodeVisuals();
    this.onNodeSelect?.(null);
    this.wake();
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
      const color = getNodeColor(node.type);
      const geo = getGeometryForType(node.type);

      // Core mesh
      const coreMat = new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.9,
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

      this.scene.add(group);
      this.nodeMeshes.set(node.id, { group, core, glow, label, node });
    }
  }

  private createGlowSprite(node: KnowledgeNode, radius: number): THREE.Sprite {
    const texture = getGlowTexture(node.type);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.6,
    });

    const sprite = new THREE.Sprite(material);
    const glowScale = radius * (node.type === 'person' ? 1.4 : 1.0) * GraphRenderer.SCALE;
    sprite.scale.set(glowScale, glowScale, 1);
    return sprite;
  }

  private createLabelSprite(node: KnowledgeNode, radius: number): THREE.Sprite | null {
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

  // ─── Edge geometry ───

  private createEdgeGeometry(edges: KnowledgeEdge[], nodes: KnowledgeNode[]): void {
    if (this.edgeLines) {
      this.edgeLines.geometry.dispose();
      (this.edgeLines.material as THREE.Material).dispose();
      this.scene.remove(this.edgeLines);
    }

    const positions = new Float32Array(edges.length * 6);
    this.edgePositions = positions;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i]!;
      const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      const src = nodeMap.get(srcId);
      const tgt = nodeMap.get(tgtId);
      const offset = i * 6;
      positions[offset] = src?.x ?? 0;
      positions[offset + 1] = src?.y ?? 0;
      positions[offset + 2] = src?.z ?? 0;
      positions[offset + 3] = tgt?.x ?? 0;
      positions[offset + 4] = tgt?.y ?? 0;
      positions[offset + 5] = tgt?.z ?? 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0x6ECFA3,
      transparent: true,
      opacity: 0.35,
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

      if (!activeId) {
        // Default state
        coreMat.opacity = 0.9;
        coreMat.emissiveIntensity = 0.15;
        glowMat.opacity = 0.6;
        // Label visibility
        if (nm.label) {
          (nm.label.material as THREE.SpriteMaterial).opacity =
            nm.node.weight >= 12 ? 0.9 : 0.6;
          nm.label.visible = true;
        }
      } else if (nodeId === activeId) {
        // Focused node — bright
        coreMat.opacity = 1.0;
        coreMat.emissiveIntensity = 0.5;
        glowMat.opacity = 1.0;
        if (nm.label) {
          (nm.label.material as THREE.SpriteMaterial).opacity = 1.0;
          nm.label.visible = true;
        }
      } else if (this.neighborSet.has(nodeId)) {
        // Direct neighbor — clearly visible
        coreMat.opacity = 0.75;
        coreMat.emissiveIntensity = 0.2;
        glowMat.opacity = 0.5;
        // Show label for neighbors on focus
        this.ensureLabel(nm);
        if (nm.label) {
          (nm.label.material as THREE.SpriteMaterial).opacity = 0.7;
          nm.label.visible = true;
        }
      } else if (this.secondNeighborSet.has(nodeId)) {
        // 2nd degree — faintly visible
        coreMat.opacity = 0.3;
        coreMat.emissiveIntensity = 0.05;
        glowMat.opacity = 0.15;
        if (nm.label) nm.label.visible = false;
      } else {
        // Unrelated — nearly gone
        coreMat.opacity = 0.08;
        coreMat.emissiveIntensity = 0.0;
        glowMat.opacity = 0.0;
        if (nm.label) nm.label.visible = false;
      }
    });

    // Edge opacity
    if (this.edgeLines) {
      const mat = this.edgeLines.material as THREE.LineBasicMaterial;
      mat.opacity = activeId ? 0.06 : 0.35;
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

      // Lerp spherical toward target
      this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * 0.08;
      this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * 0.08;
      this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * 0.08;

      // Lerp camera target
      this.cameraTarget.lerp(this.targetCameraTarget, 0.06);

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
