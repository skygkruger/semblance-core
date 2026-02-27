import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GraphRenderer } from './graph-renderer';
import { createSimulation } from './graph-physics';
import { DetailPanel } from './detail-panel';
import { CategoryLegend, deriveLegendCategories } from './CategoryLegend';
import type { KnowledgeNode, KnowledgeEdge, KnowledgeGraphProps } from './graph-types';
import './KnowledgeGraph.css';

export function KnowledgeGraph({
  nodes,
  edges,
  width = 600,
  height = 600,
  onNodeSelect,
}: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const simRef = useRef<ReturnType<typeof createSimulation> | null>(null);
  const driftRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);

  const legendCategories = useMemo(() => deriveLegendCategories(nodes), [nodes]);

  // Handle node selection from renderer
  const handleNodeSelect = useCallback((node: KnowledgeNode | null) => {
    setSelectedNode(node);
    onNodeSelect?.(node);
  }, [onNodeSelect]);

  const handlePanelClose = useCallback(() => {
    setSelectedNode(null);
    rendererRef.current?.clearSelection();
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  // Initialize renderer + simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create renderer
    const renderer = new GraphRenderer({
      canvas,
      width,
      height,
      onNodeSelect: handleNodeSelect,
    });
    rendererRef.current = renderer;

    // Clone nodes for simulation (d3-force mutates them)
    const simNodes: KnowledgeNode[] = nodes.map(n => ({ ...n }));
    const simEdges: KnowledgeEdge[] = edges.map(e => ({ ...e }));

    // Set initial data
    renderer.setData(simNodes, simEdges);

    // Create force simulation
    const simulation = createSimulation(simNodes, simEdges);
    simRef.current = simulation;

    let driftDelayTimer: ReturnType<typeof setTimeout> | null = null;

    simulation.on('tick', () => {
      renderer.updatePositions(simNodes);
    });

    simulation.on('end', () => {
      // Simulation settled — wait 4s for natural spread before allowing drift + idle
      driftDelayTimer = setTimeout(() => {
        driftRef.current = setInterval(() => {
          simNodes.forEach(node => {
            if (node.fx != null) return;
            node.vx = (node.vx ?? 0) + (Math.random() - 0.5) * 0.008;
            node.vy = (node.vy ?? 0) + (Math.random() - 0.5) * 0.008;
            node.vz = (node.vz ?? 0) + (Math.random() - 0.5) * 0.008;
          });
          simulation.alpha(0.005).restart();
        }, 3000);
      }, 4000);
    });

    return () => {
      simulation.stop();
      if (driftDelayTimer) clearTimeout(driftDelayTimer);
      if (driftRef.current) clearInterval(driftRef.current);
      renderer.dispose();
      rendererRef.current = null;
      simRef.current = null;
    };
  }, [nodes, edges, width, height, handleNodeSelect]);

  // Handle resize
  useEffect(() => {
    rendererRef.current?.resize(width, height);
  }, [width, height]);

  return (
    <div className="knowledge-graph" style={{ width, height }}>
      <canvas ref={canvasRef} className="knowledge-graph__canvas" />
      {legendCategories.length > 0 && (
        <CategoryLegend categories={legendCategories} />
      )}
      <DetailPanel
        node={selectedNode}
        edges={edges}
        allNodes={nodes}
        onClose={handlePanelClose}
      />
    </div>
  );
}

export type { KnowledgeNode, KnowledgeEdge, KnowledgeGraphProps, NodeType } from './graph-types';
