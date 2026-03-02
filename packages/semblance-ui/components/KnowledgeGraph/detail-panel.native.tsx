import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { KnowledgeNode, KnowledgeEdge, NodeType } from './graph-types';

interface DetailPanelProps {
  node: KnowledgeNode | null;
  edges: KnowledgeEdge[];
  allNodes: KnowledgeNode[];
  onClose: () => void;
  onConnectionClick?: (nodeId: string) => void;
}

function getConnections(
  nodeId: string,
  edges: KnowledgeEdge[],
  allNodes: KnowledgeNode[],
): { node: KnowledgeNode; weight: number }[] {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const connections: { node: KnowledgeNode; weight: number }[] = [];

  for (const edge of edges) {
    const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
    const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;

    if (srcId === nodeId) {
      const target = nodeMap.get(tgtId);
      if (target) connections.push({ node: target, weight: edge.weight });
    } else if (tgtId === nodeId) {
      const source = nodeMap.get(srcId);
      if (source) connections.push({ node: source, weight: edge.weight });
    }
  }

  return connections.sort((a, b) => b.weight - a.weight);
}

const DOT_COLORS: Record<NodeType, string> = {
  person: '#6ECFA3',
  calendar: '#C9A85C',
  file: '#C8CAD0',
  email: '#8593A4',
  topic: '#4A5568',
  category: '#6ECFA3',
};

export function DetailPanel({ node, edges, allNodes, onClose, onConnectionClick }: DetailPanelProps) {
  const { t } = useTranslation();

  if (!node) return null;

  const connections = getConnections(node.id, edges, allNodes);
  const dotColor = node.type === 'category' && node.metadata?.color
    ? node.metadata.color
    : DOT_COLORS[node.type];

  return (
    <View style={styles.panel}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <Text style={styles.title} numberOfLines={1}>{node.label}</Text>
          </View>
          <Text style={styles.type}>
            {node.type === 'category' && node.metadata?.category
              ? node.metadata.category
              : node.type}
          </Text>
          {node.sublabel ? (
            <Text style={styles.sublabel} numberOfLines={2}>{node.sublabel}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={12}
          accessibilityLabel={t('a11y.close_panel')}
        >
          <Text style={styles.closeX}>x</Text>
        </Pressable>
      </View>

      {connections.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>
            Connections ({connections.length})
          </Text>
          <ScrollView style={styles.connectionsList} showsVerticalScrollIndicator={false}>
            {connections.map(conn => (
              <Pressable
                key={conn.node.id}
                style={styles.connectionRow}
                onPress={() => onConnectionClick?.(conn.node.id)}
              >
                <View style={[styles.connDot, { backgroundColor: DOT_COLORS[conn.node.type] }]} />
                <Text style={styles.connLabel} numberOfLines={1}>{conn.node.label}</Text>
                <Text style={styles.connWeight}>{conn.weight}</Text>
                <Text style={styles.connArrow}>&rsaquo;</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111518',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxHeight: 320,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: '#EEF1F4',
    flex: 1,
  },
  type: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    color: '#525A64',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
    marginLeft: 16,
  },
  sublabel: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#8593A4',
    marginTop: 4,
    marginLeft: 16,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    fontFamily: 'DMMono-Regular',
    fontSize: 14,
    color: '#8593A4',
  },
  sectionLabel: {
    fontFamily: 'DMMono-Regular',
    fontSize: 10,
    color: '#525A64',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  connectionsList: {
    maxHeight: 180,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
    minHeight: 44,
  },
  connDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connLabel: {
    flex: 1,
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#A8B4C0',
  },
  connWeight: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    color: '#5E6B7C',
  },
  connArrow: {
    fontFamily: 'DMSans-Regular',
    fontSize: 16,
    color: '#5E6B7C',
    marginLeft: 4,
  },
});
