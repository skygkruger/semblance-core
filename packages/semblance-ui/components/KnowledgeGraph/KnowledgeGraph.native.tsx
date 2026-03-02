import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Circle, Line, vec, Skia, useFrameCallback } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { createSimulation, applyLayout, clampNodePositions } from './graph-physics';
import { projectGraph } from './graph-renderer.native';
import { DetailPanel } from './detail-panel.native';
import { CategoryLegend, deriveLegendCategories } from './CategoryLegend.native';
import type { KnowledgeNode, KnowledgeEdge, KnowledgeGraphProps } from './graph-types';

export function KnowledgeGraph({
  nodes,
  edges,
  width = 600,
  height = 600,
  layoutMode = 'force',
  onNodeSelect,
  isMobile,
}: KnowledgeGraphProps) {
  const simNodesRef = useRef<KnowledgeNode[]>([]);
  const simEdgesRef = useRef<KnowledgeEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const frameTs = useSharedValue(0);

  const compact = isMobile ?? width <= 600;
  const legendCategories = useMemo(() => deriveLegendCategories(nodes), [nodes]);

  const handleNodeSelect = useCallback((node: KnowledgeNode | null) => {
    setSelectedNode(node);
    onNodeSelect?.(node);
  }, [onNodeSelect]);

  const handlePanelClose = useCallback(() => {
    setSelectedNode(null);
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  const handleLegendCategoryClick = useCallback((categoryId: string) => {
    // Find category node and select it
    const node = simNodesRef.current.find(n => n.id === categoryId);
    if (node) handleNodeSelect(node);
  }, [handleNodeSelect]);

  const handleConnectionClick = useCallback((nodeId: string) => {
    const node = simNodesRef.current.find(n => n.id === nodeId);
    if (node) handleNodeSelect(node);
  }, [handleNodeSelect]);

  // Initialize simulation
  useEffect(() => {
    const simNodes: KnowledgeNode[] = nodes.map(n => ({ ...n }));
    const simEdges: KnowledgeEdge[] = edges.map(e => ({ ...e }));

    applyLayout(simNodes, layoutMode, width);

    const simulation = createSimulation(simNodes, simEdges);

    // Pre-settle
    for (let i = 0; i < 300; i++) {
      simulation.tick();
    }
    clampNodePositions(simNodes);

    // Release category XY pins after settle
    simNodes.forEach(node => {
      if (node.type === 'category') {
        node.fx = null;
        node.fy = null;
      }
    });

    simNodesRef.current = simNodes;
    simEdgesRef.current = simEdges;

    simulation.on('tick', () => {
      clampNodePositions(simNodes);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, width, height, layoutMode]);

  // Drive animation
  useFrameCallback((info) => {
    frameTs.value = info.timestamp ?? 0;
  });

  // Project 3D → 2D for current frame
  const projection = projectGraph(
    simNodesRef.current,
    simEdgesRef.current,
    width,
    height,
    frameTs.value,
  );

  // Handle tap on canvas to select nodes
  const handleCanvasTap = useCallback((x: number, y: number) => {
    const TAP_RADIUS = 24;
    let closest: KnowledgeNode | null = null;
    let closestDist = TAP_RADIUS;

    for (const pn of projection.nodes) {
      const dx = pn.x - x;
      const dy = pn.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = simNodesRef.current.find(n => n.id === pn.id) ?? null;
      }
    }

    handleNodeSelect(closest);
  }, [projection.nodes, handleNodeSelect]);

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={{ width, height }}>
        {/* Edges */}
        {projection.edges.map((edge, i) => (
          <Line
            key={`e-${i}`}
            p1={vec(edge.x1, edge.y1)}
            p2={vec(edge.x2, edge.y2)}
            color={edge.color}
            strokeWidth={0.5}
          />
        ))}
        {/* Node glows (drawn first, behind cores) */}
        {projection.nodes
          .filter(n => n.glowTier > 0 && n.glowTier <= 2)
          .map(n => (
            <Circle
              key={`glow-${n.id}`}
              cx={n.x}
              cy={n.y}
              r={n.radius * 1.8}
              color={Skia.Color(`${n.color}33`)}
            />
          ))}
        {/* Node cores */}
        {projection.nodes.map(n => (
          <Circle
            key={`node-${n.id}`}
            cx={n.x}
            cy={n.y}
            r={n.radius}
            color={Skia.Color(
              n.color + Math.round(n.alpha * 255).toString(16).padStart(2, '0'),
            )}
          />
        ))}
        {/* People node inner bright core */}
        {projection.nodes
          .filter(n => n.isPeople)
          .map(n => (
            <Circle
              key={`pcore-${n.id}`}
              cx={n.x}
              cy={n.y}
              r={n.radius * 0.55}
              color={Skia.Color('#F5E6C8CC')}
            />
          ))}
      </Canvas>

      {legendCategories.length > 0 && (
        <CategoryLegend
          categories={legendCategories}
          onCategoryClick={handleLegendCategoryClick}
          compact={compact}
        />
      )}

      <DetailPanel
        node={selectedNode}
        edges={edges}
        allNodes={nodes}
        onClose={handlePanelClose}
        onConnectionClick={handleConnectionClick}
      />
    </View>
  );
}

export type { KnowledgeNode, KnowledgeEdge, KnowledgeGraphProps } from './graph-types';
export type { CategoryLegendItem } from './graph-types';

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: '#0B0E11',
    overflow: 'hidden',
  },
});
