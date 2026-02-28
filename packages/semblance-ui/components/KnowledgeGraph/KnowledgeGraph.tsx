import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GraphRenderer } from './graph-renderer';
import { createSimulation, applyLayout, clampNodePositions } from './graph-physics';
import { DetailPanel } from './detail-panel';
import { CategoryLegend, deriveLegendCategories } from './CategoryLegend';
import type { KnowledgeNode, KnowledgeEdge, KnowledgeGraphProps } from './graph-types';
import './KnowledgeGraph.css';

export function KnowledgeGraph({
  nodes,
  edges,
  width = 600,
  height = 600,
  layoutMode = 'force',
  legendLeftOffset,
  onNodeSelect,
  stats,
  filterConfig,
}: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const simRef = useRef<ReturnType<typeof createSimulation> | null>(null);

  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [statsSheetOpen, setStatsSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const isMobile = width <= 600;
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

  const handleLegendCategoryClick = useCallback((categoryId: string) => {
    rendererRef.current?.focusNode(categoryId);
  }, []);

  const handleConnectionClick = useCallback((nodeId: string) => {
    rendererRef.current?.focusNode(nodeId);
  }, []);

  // Initialize renderer + simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create renderer
    const renderer = new GraphRenderer({
      canvas,
      width,
      height,
      isMobile,
      onNodeSelect: handleNodeSelect,
    });
    rendererRef.current = renderer;

    // Clone nodes for simulation (d3-force mutates them)
    const simNodes: KnowledgeNode[] = nodes.map(n => ({ ...n }));
    const simEdges: KnowledgeEdge[] = edges.map(e => ({ ...e }));

    // Apply layout mode (sets fx/fy/fz for radial/star before simulation)
    applyLayout(simNodes, layoutMode, width);

    // Set initial data
    renderer.setData(simNodes, simEdges);

    // Create force simulation
    const simulation = createSimulation(simNodes, simEdges);
    simRef.current = simulation;

    // Pre-settle: run simulation to near-equilibrium so nodes appear at final positions
    // 300 ticks with alphaDecay 0.015 → alpha ≈ 0.011 (near alphaMin 0.001)
    for (let i = 0; i < 300; i++) {
      simulation.tick();
    }
    clampNodePositions(simNodes);

    // Release category XY pins now that simulation is settled (alpha ≈ 0.01)
    // No visible jump — forces are near-zero, so categories stay in place
    // but are free to drift organically via the periodic nudge interval
    simNodes.forEach(node => {
      if (node.type === 'category') {
        node.fx = null;
        node.fy = null;
        // Keep fz for Z-depth anchoring
      }
    });

    renderer.updatePositions(simNodes);

    simulation.on('tick', () => {
      clampNodePositions(simNodes);
      renderer.updatePositions(simNodes);
    });

    // No simulation restart / drift interval — the render loop's sinusoidal
    // micro-drift handles all "alive" movement without centering force collapse

    return () => {
      simulation.stop();
      renderer.dispose();
      rendererRef.current = null;
      simRef.current = null;
    };
  }, [nodes, edges, width, height, layoutMode, isMobile, handleNodeSelect]);

  // Handle resize
  useEffect(() => {
    rendererRef.current?.resize(width, height);
  }, [width, height]);

  const hasActiveFilters = filterConfig
    ? filterConfig.categories.some(c => !filterConfig.enabled.has(c.id))
    : false;

  return (
    <div className="knowledge-graph" style={{ width, height }}>
      <canvas ref={canvasRef} className="knowledge-graph__canvas" />
      {legendCategories.length > 0 && (
        <CategoryLegend
          categories={legendCategories}
          leftOffset={legendLeftOffset}
          onCategoryClick={handleLegendCategoryClick}
          compact={isMobile}
        />
      )}

      {/* Mobile stats pill */}
      {isMobile && stats && (
        <>
          <div
            className="kg-stats-pill"
            onClick={() => setStatsSheetOpen(true)}
          >
            <span className="kg-stats-pill__text">
              {stats.entities.toLocaleString()} entities
            </span>
            <span className="kg-stats-pill__separator">&middot;</span>
            <span className="kg-stats-pill__insights">
              {stats.insights.toLocaleString()} insights
            </span>
            <span className="kg-stats-pill__arrow">&rsaquo;</span>
          </div>
          {statsSheetOpen && (
            <div
              className="kg-bottom-sheet__backdrop"
              onClick={() => setStatsSheetOpen(false)}
            >
              <div
                className="kg-bottom-sheet"
                onClick={e => e.stopPropagation()}
              >
                <div className="kg-bottom-sheet__handle" />
                <div className="kg-bottom-sheet__content">
                  <div style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 12,
                    color: '#A8B4C0',
                    lineHeight: 2,
                  }}>
                    <div>{stats.entities.toLocaleString()} entities</div>
                    <div>
                      <span style={{ color: '#6ECFA3' }}>{stats.insights.toLocaleString()}</span> cross-domain insights
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Mobile filter icon */}
      {isMobile && filterConfig && (
        <>
          <button
            className="kg-filter-icon"
            onClick={() => setFilterSheetOpen(true)}
            aria-label="Open filters"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <line x1="2" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="2" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="5" cy="4" r="1.5" fill="#0B0E11" stroke="currentColor" strokeWidth="1" />
              <circle cx="12" cy="9" r="1.5" fill="#0B0E11" stroke="currentColor" strokeWidth="1" />
              <circle cx="8" cy="14" r="1.5" fill="#0B0E11" stroke="currentColor" strokeWidth="1" />
            </svg>
            {hasActiveFilters && <span className="kg-filter-icon__indicator" />}
          </button>
          {filterSheetOpen && (
            <div
              className="kg-bottom-sheet__backdrop"
              onClick={() => setFilterSheetOpen(false)}
            >
              <div
                className="kg-bottom-sheet"
                onClick={e => e.stopPropagation()}
              >
                <div className="kg-bottom-sheet__handle" />
                <div className="kg-bottom-sheet__content">
                  <div style={{
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#EEF1F4',
                    marginBottom: 12,
                  }}>
                    Filter Categories
                  </div>
                  {filterConfig.categories.map(cat => {
                    const on = filterConfig.enabled.has(cat.id);
                    return (
                      <div
                        key={cat.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 0',
                          opacity: on ? 1 : 0.4,
                          cursor: 'pointer',
                        }}
                        onClick={() => filterConfig.onToggle(cat.id)}
                      >
                        <div style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: cat.color,
                          flexShrink: 0,
                        }} />
                        <div style={{
                          flex: 1,
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          fontSize: 13,
                          color: '#A8B4C0',
                        }}>
                          {cat.label}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    style={{
                      marginTop: 12,
                      padding: '6px 12px',
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.09)',
                      borderRadius: 4,
                      color: '#A8B4C0',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    onClick={filterConfig.onReset}
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <DetailPanel
        node={selectedNode}
        edges={edges}
        allNodes={nodes}
        onClose={handlePanelClose}
        onConnectionClick={handleConnectionClick}
      />
    </div>
  );
}

export type { KnowledgeNode, KnowledgeEdge, KnowledgeGraphProps, NodeType, LayoutMode } from './graph-types';
export type { CategoryLegendItem } from './graph-types';
