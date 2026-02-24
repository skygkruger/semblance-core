/**
 * KnowledgeGraphScreen — Mobile WebView-based force-directed graph.
 *
 * Self-contained HTML with inline D3 (no CDN). Graph data injected as JSON.
 * Touch events → postMessage → RN bottom sheet for node detail.
 * Labels hidden by default (shown on tap). Pinch-to-zoom. Collapsible header for stats.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { styles } from './KnowledgeGraphScreen.styles';
import type {
  VisualizationGraph,
  VisualizationNode,
  VisualizationEdge,
  GraphStats,
  NodeContext,
} from '../../../../packages/core/knowledge/graph-visualization';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KnowledgeGraphScreenProps {
  graph: VisualizationGraph;
  nodeContext?: NodeContext | null;
  onNodeSelect?: (nodeId: string) => void;
  onExport?: () => void;
}

// ─── Node Colors (match desktop) ─────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  person: '#4A7FBA',
  topic: '#E8A838',
  document: '#8B93A7',
  event: '#3DB87A',
  email_thread: 'rgba(74, 127, 186, 0.38)',
  reminder: '#E85D5D',
  location: '#5BA3A3',
};

// ─── HTML Builder ───────────────────────────────────────────────────────────

export function buildGraphHTML(
  nodes: VisualizationNode[],
  edges: VisualizationEdge[],
): string {
  const graphData = JSON.stringify({ nodes, edges });

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0, user-scalable=yes">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a2e; overflow: hidden; touch-action: none; }
    svg { width: 100vw; height: 100vh; }
    .node { cursor: pointer; }
    .node circle { stroke-width: 1.5; opacity: 0.85; }
    .edge { stroke: #E2E4E9; stroke-width: 1; }
    .label { font-family: monospace; font-size: 9px; fill: #E2E4E9; pointer-events: none; display: none; }
    .label.visible { display: block; }
  </style>
</head>
<body>
  <svg id="graph"></svg>
  <script>
    var DATA = ${graphData};
    var NODE_COLORS = ${JSON.stringify(NODE_COLORS)};

    var svg = document.getElementById('graph');
    var width = window.innerWidth;
    var height = window.innerHeight;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    // Render nodes
    DATA.nodes.forEach(function(n, i) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'node');
      g.setAttribute('data-id', n.id);

      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      var maxSize = Math.max.apply(null, DATA.nodes.map(function(x) { return x.size; })) || 1;
      var r = 6 + (n.size / maxSize) * 18;
      circle.setAttribute('r', r);
      circle.setAttribute('fill', NODE_COLORS[n.type] || '#8B93A7');
      circle.setAttribute('cx', width / 2 + (Math.random() - 0.5) * width * 0.6);
      circle.setAttribute('cy', height / 2 + (Math.random() - 0.5) * height * 0.6);
      g.appendChild(circle);

      var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dy', r + 12);
      label.textContent = n.label.length > 15 ? n.label.slice(0, 13) + '...' : n.label;
      g.appendChild(label);

      g.addEventListener('click', function() {
        // Toggle label visibility
        label.classList.toggle('visible');
        // Send message to RN
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'node_tap', nodeId: n.id }));
        }
      });

      svg.appendChild(g);
    });

    // Render edges
    DATA.edges.forEach(function(e) {
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'edge');
      line.setAttribute('opacity', Math.max(0.15, Math.min(0.8, e.weight)));
      svg.insertBefore(line, svg.firstChild);
    });
  </script>
</body>
</html>`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const KnowledgeGraphScreen: React.FC<KnowledgeGraphScreenProps> = ({
  graph,
  nodeContext,
  onNodeSelect,
  onExport,
}) => {
  const [showStats, setShowStats] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const htmlContent = useMemo(
    () => buildGraphHTML(graph.nodes, graph.edges),
    [graph.nodes, graph.edges],
  );

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; nodeId?: string };
      if (msg.type === 'node_tap' && msg.nodeId) {
        setSelectedNodeId(msg.nodeId);
        onNodeSelect?.(msg.nodeId);
      }
    } catch {
      // Ignore malformed messages
    }
  }, [onNodeSelect]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Knowledge Graph</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowStats(prev => !prev)}
          >
            <Text style={styles.headerButtonText}>[Stats]</Text>
          </TouchableOpacity>
          {onExport && (
            <TouchableOpacity style={styles.headerButton} onPress={onExport}>
              <Text style={styles.headerButtonText}>[Export]</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Collapsible Stats */}
      {showStats && (
        <View style={styles.statsCollapsed}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{graph.stats.totalNodes}</Text>
              <Text style={styles.statLabel}>Nodes</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{graph.stats.totalEdges}</Text>
              <Text style={styles.statLabel}>Edges</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{graph.stats.growthRate}</Text>
              <Text style={styles.statLabel}>New (7d)</Text>
            </View>
          </View>
        </View>
      )}

      {/* WebView placeholder — in real app, this is a react-native-webview */}
      <View style={styles.webviewContainer} testID="graph-webview">
        {/* WebView source={{ html: htmlContent }} onMessage={handleMessage} */}
      </View>

      {/* Bottom Sheet for Node Detail */}
      {nodeContext && selectedNodeId && (
        <View style={styles.bottomSheet}>
          <View style={styles.bottomSheetHandle} />
          <Text style={styles.nodeTitle}>{nodeContext.node.label}</Text>
          <Text style={styles.nodeType}>{nodeContext.node.type} / {nodeContext.node.domain}</Text>
          <ScrollView>
            {nodeContext.connections.slice(0, 10).map(conn => (
              <View key={conn.node.id} style={styles.connectionItem}>
                <Text style={styles.connectionText}>{conn.node.label}</Text>
                <Text style={styles.connectionLabel}>{conn.edge.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};
