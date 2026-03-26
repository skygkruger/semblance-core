// Graph Visualization Provider — Queries all data stores and builds a unified
// visualization graph of nodes, edges, and clusters for the Knowledge Graph UI.
//
// CRITICAL: This file is in packages/core/. No network imports.
// Pure data aggregation from existing SQLite tables and stores.

import type { DatabaseHandle } from '../platform/types.js';
import type { ContactStore } from './contacts/contact-store.js';
import type { RelationshipAnalyzer } from './contacts/relationship-analyzer.js';
import type { ReminderStore } from './reminder-store.js';

// ─── Visualization Types ─────────────────────────────────────────────────────

export type VisualizationEntityType =
  | 'person'
  | 'topic'
  | 'document'
  | 'directory'
  | 'event'
  | 'email_thread'
  | 'reminder'
  | 'location'
  | 'category';

export interface VisualizationNode {
  id: string;
  label: string;
  type: VisualizationEntityType;
  size: number;            // Relative importance (interaction count, mention count, etc.)
  createdAt: string;       // ISO 8601 — for time slider filtering
  domain: string;          // 'work' | 'personal' | 'finance' | 'health' | 'general'
  metadata: Record<string, unknown>;
}

export interface VisualizationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;          // 0-1 normalized
  label: string;           // 'mentioned_in', 'attended', 'emailed', 'co-occurred', etc.
}

export interface VisualizationCluster {
  id: string;
  name: string;
  nodeIds: string[];
}

export interface VisualizationGraph {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  clusters: VisualizationCluster[];
  stats: GraphStats;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  averageConnections: number;
  mostConnectedNode: { id: string; label: string; connections: number } | null;
  graphDensity: number;
  growthRate: number;      // New nodes in last 7 days
  activeSources?: number;           // Count of categories with at least 1 node
  totalSources?: number;            // 10 (fixed)
  crossDomainInsights?: number;     // Count of cross-category edges
  nodesByCategory?: Record<string, number>;
  fastestGrowingCategory?: string;
}

export interface GrowthDataPoint {
  date: string;            // ISO date (YYYY-MM-DD)
  cumulative: number;
  newCount: number;
}

export interface NodeContent {
  type: 'document' | 'email' | 'event' | 'person' | 'reminder' | 'location' | 'topic';
  title: string;
  body?: string;
  metadata: Record<string, unknown>;
  chunks?: Array<{ content: string; chunkIndex: number }>;
}

export interface NodeContext {
  node: VisualizationNode;
  connections: Array<{ node: VisualizationNode; edge: VisualizationEdge }>;
  recentActivity: string[];
  content?: NodeContent;
}

export interface GraphOptions {
  maxNodes?: number;       // Default 200
  edgeCapMultiplier?: number; // Default 3 (3x nodes)
  includeReminders?: boolean;
  includeLocations?: boolean;
  daysBack?: number;       // For events, default 90
  daysForward?: number;    // For events, default 30
}

// ─── Category Types (for collapsed category node view) ───────────────────────

import {
  type VisualizationCategory,
  getCategoryForEntityType,
  CATEGORY_META,
} from './connector-category-map.js';

export interface CategoryNode {
  id: string;                      // 'cat_health', 'cat_people', etc.
  category: VisualizationCategory;
  label: string;
  color: string;
  icon: string;
  nodeCount: number;
  totalSize: number;
  nodeIds: string[];               // IDs of contained VisualizationNodes
}

export interface CategoryEdge {
  id: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  weight: number;                  // Aggregated 0-1
  edgeCount: number;               // Count of underlying entity edges
  relationshipTypes: string[];     // Distinct edge labels
}

// ─── Cache Table ─────────────────────────────────────────────────────────────

const CREATE_CACHE_TABLE = `
  CREATE TABLE IF NOT EXISTS graph_cache (
    id TEXT PRIMARY KEY DEFAULT 'default',
    graph_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

// ─── Provider ────────────────────────────────────────────────────────────────

export class GraphVisualizationProvider {
  private db: DatabaseHandle;
  private contactStore: ContactStore | null;
  private relationshipAnalyzer: RelationshipAnalyzer | null;
  private reminderStore: ReminderStore | null;

  constructor(config: {
    db: DatabaseHandle;
    contactStore: ContactStore | null;
    relationshipAnalyzer: RelationshipAnalyzer | null;
    reminderStore?: ReminderStore;
  }) {
    this.db = config.db;
    this.contactStore = config.contactStore;
    this.relationshipAnalyzer = config.relationshipAnalyzer;
    this.reminderStore = config.reminderStore ?? null;
  }

  initSchema(): void {
    this.db.exec(CREATE_CACHE_TABLE);

    // Ensure entities + entity_mentions + entity_relationships exist in this DB.
    // DocumentStore creates them in documents.db. CREATE IF NOT EXISTS is a
    // no-op if they already exist — safe to call on every init.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        aliases TEXT,
        first_seen TEXT NOT NULL DEFAULT '',
        last_seen TEXT NOT NULL DEFAULT '',
        metadata TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entity_mentions (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        chunk_id TEXT NOT NULL DEFAULT '',
        context TEXT,
        mentioned_at TEXT NOT NULL DEFAULT ''
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entity_relationships (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        strength REAL DEFAULT 1.0,
        first_seen TEXT,
        last_seen TEXT,
        metadata TEXT,
        FOREIGN KEY (source_id) REFERENCES entities(id),
        FOREIGN KEY (target_id) REFERENCES entities(id)
      )
    `);
  }

  /**
   * Build a complete visualization graph from all data stores.
   * Applies node/edge caps for performance.
   *
   * Auto-connection: When new connectors are added (e.g. email, calendar,
   * contacts), new nodes and edges are automatically included here because
   * this method queries all underlying data stores on every call. The
   * graph_cache table (TTL-based) should be invalidated whenever a connector
   * finishes an indexing pass — call setCachedGraph() after each import run
   * or rely on the 1-hour TTL expiry for eventual freshness.
   */
  getGraphData(options?: GraphOptions): VisualizationGraph {
    // Check cache first (only when using default options — custom options bypass cache)
    if (!options || Object.keys(options).length === 0) {
      const cached = this.getCachedGraph();
      if (cached) return cached;
    }

    const maxNodes = options?.maxNodes ?? 200;
    const edgeCap = maxNodes * (options?.edgeCapMultiplier ?? 3);
    const daysBack = options?.daysBack ?? 90;
    const daysForward = options?.daysForward ?? 30;

    const nodes: VisualizationNode[] = [];
    const edges: VisualizationEdge[] = [];
    const clusters: VisualizationCluster[] = [];

    // Track IDs to avoid duplicates
    const nodeIds = new Set<string>();
    const edgeKeys = new Set<string>();

    // 1. Person nodes from ContactStore + entities table
    this.addPersonNodes(nodes, nodeIds);

    // 2. Topic nodes from entities table
    this.addTopicNodes(nodes, nodeIds);

    // 3. Document nodes from documents table
    this.addDocumentNodes(nodes, nodeIds);

    // 4. Event nodes from indexed_calendar_events
    this.addEventNodes(nodes, nodeIds, daysBack, daysForward);

    // 5. Email thread nodes (top 50 by message count)
    this.addEmailThreadNodes(nodes, nodeIds);

    // 6. Reminder nodes (pending only)
    if (options?.includeReminders !== false && this.reminderStore) {
      this.addReminderNodes(nodes, nodeIds);
    }

    // 7. Location nodes from location_history
    if (options?.includeLocations !== false) {
      this.addLocationNodes(nodes, nodeIds);
    }

    // --- Edges ---

    // Person↔document edges via entity_mentions
    this.addMentionEdges(edges, edgeKeys, nodeIds);

    // Person↔event edges via calendar attendees
    this.addAttendeeEdges(edges, edgeKeys, nodeIds);

    // Person↔email_thread edges
    this.addEmailThreadEdges(edges, edgeKeys, nodeIds);

    // Person↔person edges from RelationshipAnalyzer
    this.addRelationshipEdges(edges, edgeKeys, nodeIds);

    // Directory↔file edges
    this.addDirectoryFileEdges(edges, edgeKeys, nodeIds);

    // --- Clusters from relationship graph ---
    const relGraph = this.relationshipAnalyzer?.buildRelationshipGraph();
    for (const cluster of relGraph?.clusters ?? []) {
      const clusterNodeIds = cluster.contactIds
        .map(cid => `person_${cid}`)
        .filter(nid => nodeIds.has(nid));
      if (clusterNodeIds.length >= 2) {
        clusters.push({
          id: cluster.id,
          name: cluster.name,
          nodeIds: clusterNodeIds,
        });
      }
    }

    // --- Apply caps ---
    let cappedNodes = this.capNodes(nodes, maxNodes);

    // Hard display safety valve — if still too many nodes after soft cap,
    // collapse the smallest into a summary node. This is a DISPLAY limit,
    // not a data limit — all files are still indexed and searchable.
    const MAX_DISPLAY_NODES = 500;
    if (cappedNodes.length > MAX_DISPLAY_NODES) {
      cappedNodes.sort((a, b) => b.size - a.size);
      const displayed = cappedNodes.slice(0, MAX_DISPLAY_NODES);
      const collapsed = cappedNodes.slice(MAX_DISPLAY_NODES);

      displayed.push({
        id: 'overflow_summary',
        label: `${collapsed.length} more items`,
        type: 'category',
        size: collapsed.length,
        createdAt: new Date().toISOString(),
        domain: 'general',
        metadata: { isOverflow: true, collapsedCount: collapsed.length },
      });

      cappedNodes = displayed;
    }

    const cappedNodeIds = new Set(cappedNodes.map(n => n.id));
    let cappedEdges = edges.filter(
      e => cappedNodeIds.has(e.sourceId) && cappedNodeIds.has(e.targetId)
    );
    cappedEdges = this.capEdges(cappedEdges, edgeCap);

    const stats = this.computeStats(cappedNodes, cappedEdges);

    const result: VisualizationGraph = {
      nodes: cappedNodes,
      edges: cappedEdges,
      clusters: clusters.filter(c => c.nodeIds.some(nid => cappedNodeIds.has(nid))),
      stats,
    };

    // Cache the result for subsequent calls (only when using default options)
    if (!options || Object.keys(options).length === 0) {
      try { this.setCachedGraph(result); } catch { /* cache write is best-effort */ }
    }

    return result;
  }

  /**
   * Get context for a specific node — connections, recent activity, related items.
   */
  getNodeContext(nodeId: string): NodeContext | null {
    // Handle synthetic category nodes (e.g., "cat_knowledge", "cat_people")
    if (nodeId.startsWith('cat_')) {
      const categoryKey = nodeId.slice(4) as VisualizationCategory;
      const catMeta = CATEGORY_META[categoryKey];
      if (catMeta) {
        const { nodes: catNodes } = this.getNodesForCategory(categoryKey);
        const syntheticNode: VisualizationNode = {
          id: nodeId,
          label: catMeta.displayName,
          type: 'category',
          size: catNodes.length,
          createdAt: new Date().toISOString(),
          domain: 'general',
          metadata: { category: categoryKey, color: catMeta.color, icon: catMeta.icon, nodeCount: catNodes.length },
        };
        const connections = catNodes.map(n => ({
          node: n,
          edge: {
            id: `cat_contains_${nodeId}_${n.id}`,
            sourceId: nodeId,
            targetId: n.id,
            weight: 1,
            label: 'contains',
          },
        }));
        const recentActivity = catNodes.slice(0, 5).map(n => `Contains ${n.label}`);
        return { node: syntheticNode, connections, recentActivity };
      }
    }

    const graph = this.getGraphData();
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    // Directory drill-down: show child files as connections
    if (node.type === 'directory') {
      const dirPath = node.metadata.path as string;
      if (dirPath) {
        try {
          const childDocs = this.db.prepare(
            "SELECT id, title, created_at, metadata FROM documents WHERE source = 'local_file' AND source_path LIKE ? || '%'"
          ).all(dirPath) as Array<{ id: string; title: string; created_at: string; metadata: string | null }>;

          const connections = childDocs.map(doc => {
            let meta: Record<string, unknown> = {};
            try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch { /* ignore */ }
            return {
              node: {
                id: `document_${doc.id}`,
                label: doc.title,
                type: 'document' as VisualizationEntityType,
                size: 1,
                createdAt: doc.created_at,
                domain: 'general',
                metadata: meta,
              },
              edge: {
                id: `contains_${node.id}_${doc.id}`,
                sourceId: node.id,
                targetId: `document_${doc.id}`,
                weight: 1,
                label: 'contains',
              },
            };
          });

          return {
            node,
            connections,
            recentActivity: [`${childDocs.length} files indexed`],
          };
        } catch {
          // Fall through to default behavior
        }
      }
    }

    const connections: NodeContext['connections'] = [];
    for (const edge of graph.edges) {
      if (edge.sourceId === nodeId) {
        const target = graph.nodes.find(n => n.id === edge.targetId);
        if (target) connections.push({ node: target, edge });
      } else if (edge.targetId === nodeId) {
        const source = graph.nodes.find(n => n.id === edge.sourceId);
        if (source) connections.push({ node: source, edge });
      }
    }

    // Build recent activity from connected nodes
    const recentActivity: string[] = [];
    for (const conn of connections.slice(0, 5)) {
      recentActivity.push(`Connected to ${conn.node.label} (${conn.edge.label})`);
    }

    // Fetch actual content based on node type
    const content = this.getNodeContent(node);

    return { node, connections, recentActivity, content };
  }

  /**
   * Get graph statistics.
   */
  getGraphStats(): GraphStats {
    const graph = this.getGraphData();
    return graph.stats;
  }

  /**
   * Get growth timeline — cumulative and new node counts over time.
   */
  getGrowthTimeline(granularity: 'day' | 'week' | 'month' = 'day'): GrowthDataPoint[] {
    // Query entities first_seen + documents created_at
    let entityDates: { date: string }[] = [];
    try {
      entityDates = this.db.prepare(
        'SELECT first_seen as date FROM entities ORDER BY first_seen ASC'
      ).all() as { date: string }[];
    } catch { /* entities table may not exist yet */ }

    let docDates: { date: string }[] = [];
    try {
      docDates = this.db.prepare(
        'SELECT created_at as date FROM documents ORDER BY created_at ASC'
      ).all() as { date: string }[];
    } catch { /* documents table may not exist yet */ }

    const allDates = [...entityDates, ...docDates]
      .map(r => r.date.substring(0, 10)) // YYYY-MM-DD
      .sort();

    if (allDates.length === 0) return [];

    // Group by granularity
    const grouped = new Map<string, number>();
    for (const date of allDates) {
      const key = this.dateToGranularity(date, granularity);
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }

    // Build cumulative timeline
    const points: GrowthDataPoint[] = [];
    let cumulative = 0;
    const sortedKeys = [...grouped.keys()].sort();
    for (const key of sortedKeys) {
      const newCount = grouped.get(key) ?? 0;
      cumulative += newCount;
      points.push({ date: key, cumulative, newCount });
    }

    return points;
  }

  /**
   * Get cached graph data if within TTL.
   */
  getCachedGraph(ttlMs: number = 60 * 60 * 1000): VisualizationGraph | null {
    try {
      const row = this.db.prepare(
        'SELECT graph_json, updated_at FROM graph_cache WHERE id = ?'
      ).get('default') as { graph_json: string; updated_at: string } | undefined;

      if (!row) return null;

      const age = Date.now() - new Date(row.updated_at).getTime();
      if (age > ttlMs) return null;

      return JSON.parse(row.graph_json) as VisualizationGraph;
    } catch {
      return null;
    }
  }

  /**
   * Store graph data in cache.
   */
  setCachedGraph(graph: VisualizationGraph): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO graph_cache (id, graph_json, updated_at)
      VALUES (?, ?, ?)
    `).run('default', JSON.stringify(graph), now);
  }

  /**
   * Build a category-level graph from the entity graph.
   * Groups nodes by visualization category, aggregates cross-category edges.
   */
  getCategoryGraph(options?: GraphOptions): VisualizationGraph & {
    categoryNodes: CategoryNode[];
    categoryEdges: CategoryEdge[];
  } {
    const baseGraph = this.getGraphData(options);

    // Assign each node to a category
    const categoryMap = new Map<VisualizationCategory, VisualizationNode[]>();
    for (const node of baseGraph.nodes) {
      if (node.type === 'category') continue;
      const cat = getCategoryForEntityType(node.type, node.metadata);
      const list = categoryMap.get(cat);
      if (list) {
        list.push(node);
      } else {
        categoryMap.set(cat, [node]);
      }
    }

    // Build CategoryNode for each non-empty category
    const categoryNodes: CategoryNode[] = [];
    for (const [cat, catNodes] of categoryMap) {
      const meta = CATEGORY_META[cat];
      categoryNodes.push({
        id: `cat_${cat}`,
        category: cat,
        label: meta.displayName,
        color: meta.color,
        icon: meta.icon,
        nodeCount: catNodes.length,
        totalSize: catNodes.reduce((sum, n) => sum + n.size, 0),
        nodeIds: catNodes.map(n => n.id),
      });
    }

    // Build cross-category edges
    const nodeToCat = new Map<string, VisualizationCategory>();
    for (const [cat, catNodes] of categoryMap) {
      for (const n of catNodes) {
        nodeToCat.set(n.id, cat);
      }
    }

    const catEdgeAgg = new Map<string, {
      sourceCat: VisualizationCategory;
      targetCat: VisualizationCategory;
      edgeCount: number;
      labels: Set<string>;
    }>();

    for (const edge of baseGraph.edges) {
      const srcCat = nodeToCat.get(edge.sourceId);
      const tgtCat = nodeToCat.get(edge.targetId);
      if (!srcCat || !tgtCat || srcCat === tgtCat) continue;

      const [a, b] = [srcCat, tgtCat].sort();
      const key = `${a}::${b}`;
      const existing = catEdgeAgg.get(key);
      if (existing) {
        existing.edgeCount++;
        existing.labels.add(edge.label);
      } else {
        catEdgeAgg.set(key, {
          sourceCat: a as VisualizationCategory,
          targetCat: b as VisualizationCategory,
          edgeCount: 1,
          labels: new Set([edge.label]),
        });
      }
    }

    const categoryEdges: CategoryEdge[] = [];
    for (const [key, agg] of catEdgeAgg) {
      const srcCount = categoryMap.get(agg.sourceCat)?.length ?? 1;
      const tgtCount = categoryMap.get(agg.targetCat)?.length ?? 1;
      const maxCat = Math.max(srcCount, tgtCount);
      const weight = Math.min(1, agg.edgeCount / maxCat);

      categoryEdges.push({
        id: `cat_edge_${key.replace('::', '_')}`,
        sourceCategoryId: `cat_${agg.sourceCat}`,
        targetCategoryId: `cat_${agg.targetCat}`,
        weight,
        edgeCount: agg.edgeCount,
        relationshipTypes: Array.from(agg.labels),
      });
    }

    // Build enhanced stats
    const nodesByCategory: Record<string, number> = {};
    for (const [cat, catNodes] of categoryMap) {
      nodesByCategory[cat] = catNodes.length;
    }

    // Fastest growing: category with most nodes created in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const growthByCategory = new Map<VisualizationCategory, number>();
    for (const [cat, catNodes] of categoryMap) {
      const recentCount = catNodes.filter(n => n.createdAt >= sevenDaysAgo).length;
      growthByCategory.set(cat, recentCount);
    }
    let fastestGrowingCategory: string | undefined;
    let maxGrowth = 0;
    for (const [cat, count] of growthByCategory) {
      if (count > maxGrowth) {
        maxGrowth = count;
        fastestGrowingCategory = CATEGORY_META[cat].displayName;
      }
    }

    const enhancedStats: GraphStats = {
      ...baseGraph.stats,
      activeSources: categoryMap.size,
      totalSources: 10,
      crossDomainInsights: categoryEdges.length,
      nodesByCategory,
      fastestGrowingCategory,
    };

    return {
      ...baseGraph,
      stats: enhancedStats,
      categoryNodes,
      categoryEdges,
    };
  }

  /**
   * Get entity nodes and edges for a specific category (used for expand-in-place).
   */
  getNodesForCategory(
    category: VisualizationCategory,
    options?: GraphOptions,
  ): { nodes: VisualizationNode[]; edges: VisualizationEdge[] } {
    const graph = this.getGraphData(options);
    const catNodes = graph.nodes.filter(n => {
      if (n.type === 'category') return false;
      return getCategoryForEntityType(n.type, n.metadata) === category;
    });
    const catNodeIds = new Set(catNodes.map(n => n.id));
    const catEdges = graph.edges.filter(
      e => catNodeIds.has(e.sourceId) && catNodeIds.has(e.targetId),
    );
    return { nodes: catNodes, edges: catEdges };
  }

  /**
   * Invalidate the graph cache. Call after indexing completes or when force-refreshing.
   */
  invalidateCache(): void {
    try {
      this.db.prepare('DELETE FROM graph_cache WHERE id = ?').run('default');
    } catch {
      // Cache table may not exist yet — safe to ignore
    }
  }

  // ─── Private: Content Fetchers ──────────────────────────────────────────────

  private getNodeContent(node: VisualizationNode): NodeContent | undefined {
    try {
      switch (node.type) {
        case 'person':
          return this.getPersonContent(node);
        case 'email_thread':
          return this.getEmailThreadContent(node);
        case 'event':
          return this.getEventContent(node);
        case 'reminder':
          return this.getReminderContent(node);
        case 'topic':
          return this.getTopicContent(node);
        case 'location':
          return this.getLocationContent(node);
        case 'document':
        case 'directory':
          return this.getDocumentContent(node);
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }

  private getPersonContent(node: VisualizationNode): NodeContent | undefined {
    // Try ContactStore first (richer data)
    const contactId = node.metadata.contactId as string | undefined;
    if (contactId && this.contactStore) {
      const contact = this.contactStore.getContact(contactId);
      if (contact) {
        const bodyParts: string[] = [];
        if (contact.organization) bodyParts.push(`Organization: ${contact.organization}`);
        if (contact.jobTitle) bodyParts.push(`Title: ${contact.jobTitle}`);
        if (contact.emails.length > 0) bodyParts.push(`Emails: ${contact.emails.join(', ')}`);
        if (contact.phones.length > 0) bodyParts.push(`Phones: ${contact.phones.join(', ')}`);
        if (contact.birthday) bodyParts.push(`Birthday: ${contact.birthday}`);
        if (contact.tags.length > 0) bodyParts.push(`Tags: ${contact.tags.join(', ')}`);

        return {
          type: 'person',
          title: contact.displayName,
          body: bodyParts.join('\n'),
          metadata: {
            relationshipType: contact.relationshipType,
            communicationFrequency: contact.communicationFrequency,
            lastContactDate: contact.lastContactDate,
            firstContactDate: contact.firstContactDate,
            interactionCount: contact.interactionCount,
            organization: contact.organization,
            jobTitle: contact.jobTitle,
            emails: contact.emails,
            phones: contact.phones,
          },
        };
      }
    }

    // Fallback: entity from entities table
    const entityId = node.metadata.entityId as string | undefined;
    if (entityId) {
      try {
        const entity = this.db.prepare(
          'SELECT name, type, aliases, metadata FROM entities WHERE id = ?'
        ).get(entityId) as { name: string; type: string; aliases: string | null; metadata: string | null } | undefined;
        if (entity) {
          let meta: Record<string, unknown> = {};
          try { meta = entity.metadata ? JSON.parse(entity.metadata) : {}; } catch { /* ignore */ }
          return {
            type: 'person',
            title: entity.name,
            body: entity.aliases ? `Also known as: ${entity.aliases}` : undefined,
            metadata: meta,
          };
        }
      } catch { /* ignore */ }
    }
    return undefined;
  }

  private getEmailThreadContent(node: VisualizationNode): NodeContent | undefined {
    const threadId = node.metadata.threadId as string | undefined;
    if (!threadId) return undefined;

    try {
      const emails = this.db.prepare(
        'SELECT subject, "from", from_name, snippet, received_at, priority FROM indexed_emails WHERE thread_id = ? ORDER BY received_at DESC LIMIT 20'
      ).all(threadId) as Array<{
        subject: string; from: string; from_name: string | null;
        snippet: string; received_at: string; priority: string | null;
      }>;

      if (emails.length === 0) return undefined;

      const body = emails.map(e =>
        `From: ${e.from_name || e.from}\nSubject: ${e.subject}\n${e.snippet}`
      ).join('\n---\n');

      return {
        type: 'email',
        title: node.label,
        body,
        metadata: {
          messageCount: emails.length,
          latestDate: emails[0]?.received_at,
          latestFrom: emails[0]?.from_name || emails[0]?.from,
        },
        chunks: emails.map((e, i) => ({
          content: `${e.from_name || e.from}: ${e.subject}\n${e.snippet}`,
          chunkIndex: i,
        })),
      };
    } catch { return undefined; }
  }

  private getEventContent(node: VisualizationNode): NodeContent | undefined {
    const eventId = node.metadata.calendarEventId as string | undefined;
    if (!eventId) return undefined;

    try {
      const event = this.db.prepare(
        'SELECT title, description, start_time, end_time, location, attendees, calendar_id FROM indexed_calendar_events WHERE id = ?'
      ).get(eventId) as {
        title: string; description: string | null; start_time: string;
        end_time: string | null; location: string | null;
        attendees: string; calendar_id: string | null;
      } | undefined;

      if (!event) return undefined;

      const bodyParts: string[] = [];
      bodyParts.push(`When: ${event.start_time}${event.end_time ? ` - ${event.end_time}` : ''}`);
      if (event.location) bodyParts.push(`Where: ${event.location}`);
      if (event.description) bodyParts.push(`\n${event.description}`);

      let attendeeList: string[] = [];
      try { attendeeList = JSON.parse(event.attendees) as string[]; } catch { /* ignore */ }
      if (attendeeList.length > 0) bodyParts.push(`Attendees: ${attendeeList.join(', ')}`);

      return {
        type: 'event',
        title: event.title,
        body: bodyParts.join('\n'),
        metadata: {
          startTime: event.start_time,
          endTime: event.end_time,
          location: event.location,
          attendeeCount: attendeeList.length,
          calendarId: event.calendar_id,
        },
      };
    } catch { return undefined; }
  }

  private getReminderContent(node: VisualizationNode): NodeContent | undefined {
    if (!this.reminderStore) return undefined;

    const reminderId = node.metadata.reminderId as string | undefined;
    if (!reminderId) return undefined;

    try {
      const reminder = this.reminderStore.findByStatus('pending')
        .find(r => r.id === reminderId);

      if (!reminder) return undefined;

      return {
        type: 'reminder',
        title: reminder.text,
        body: `Due: ${reminder.dueAt}\nStatus: ${reminder.status}\nRecurrence: ${reminder.recurrence}\nSource: ${reminder.source}`,
        metadata: {
          dueAt: reminder.dueAt,
          status: reminder.status,
          recurrence: reminder.recurrence,
          source: reminder.source,
          snoozedUntil: reminder.snoozedUntil,
        },
      };
    } catch { return undefined; }
  }

  private getTopicContent(node: VisualizationNode): NodeContent | undefined {
    const entityId = node.metadata.entityId as string | undefined;
    if (!entityId) return undefined;

    try {
      const mentions = this.db.prepare(
        'SELECT m.document_id, m.context, m.mentioned_at, d.title as doc_title FROM entity_mentions m LEFT JOIN documents d ON m.document_id = d.id WHERE m.entity_id = ? ORDER BY m.mentioned_at DESC LIMIT 20'
      ).all(entityId) as Array<{
        document_id: string; context: string | null;
        mentioned_at: string; doc_title: string | null;
      }>;

      if (mentions.length === 0) return undefined;

      const body = mentions
        .filter(m => m.doc_title || m.context)
        .map(m => `In "${m.doc_title || m.document_id}": ${m.context || '(no context)'}`)
        .join('\n');

      return {
        type: 'topic',
        title: node.label,
        body,
        metadata: { mentionCount: mentions.length },
        chunks: mentions.map((m, i) => ({
          content: `[${m.doc_title || m.document_id}] ${m.context || ''}`,
          chunkIndex: i,
        })),
      };
    } catch { return undefined; }
  }

  private getLocationContent(node: VisualizationNode): NodeContent | undefined {
    const lat = node.metadata.latitude as number | undefined;
    const lon = node.metadata.longitude as number | undefined;
    if (lat == null || lon == null) return undefined;

    try {
      const visits = this.db.prepare(
        'SELECT timestamp, accuracy FROM location_history WHERE ROUND(latitude, 2) = ? AND ROUND(longitude, 2) = ? ORDER BY timestamp DESC LIMIT 20'
      ).all(lat, lon) as Array<{ timestamp: string; accuracy: number | null }>;

      if (visits.length === 0) return undefined;

      return {
        type: 'location',
        title: node.label,
        body: `${visits.length} visits recorded\nFirst: ${visits[visits.length - 1]?.timestamp}\nLatest: ${visits[0]?.timestamp}`,
        metadata: {
          latitude: lat,
          longitude: lon,
          visitCount: visits.length,
          firstVisit: visits[visits.length - 1]?.timestamp,
          latestVisit: visits[0]?.timestamp,
        },
      };
    } catch { return undefined; }
  }

  private getDocumentContent(node: VisualizationNode): NodeContent | undefined {
    const documentId = node.metadata.documentId as string | undefined;
    if (!documentId) return undefined;

    try {
      // Note: the documents table does NOT have a 'content' column — content is
      // stored in the vector store (LanceDB). We query only the metadata columns.
      const doc = this.db.prepare(
        'SELECT id, title, source, source_path, mime_type, metadata, created_at, updated_at, indexed_at FROM documents WHERE id = ?'
      ).get(documentId) as {
        id: string; title: string;
        source: string; source_path: string | null;
        mime_type: string; metadata: string | null;
        created_at: string; updated_at: string; indexed_at: string;
      } | undefined;

      if (!doc) return undefined;

      let meta: Record<string, unknown> = {};
      try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch { /* ignore */ }

      // Build a human-readable body from available metadata
      const bodyParts: string[] = [];
      bodyParts.push(`Source: ${doc.source.replace(/_/g, ' ')}`);
      if (doc.source_path) bodyParts.push(`Path: ${doc.source_path}`);
      bodyParts.push(`Type: ${doc.mime_type}`);
      bodyParts.push(`Created: ${doc.created_at}`);
      bodyParts.push(`Indexed: ${doc.indexed_at}`);

      // Extract useful fields from metadata
      if (meta.subject) bodyParts.push(`Subject: ${meta.subject as string}`);
      if (meta.from) bodyParts.push(`From: ${meta.from as string}`);
      if (meta.to) bodyParts.push(`To: ${meta.to as string}`);
      if (meta.snippet) bodyParts.push(`\n${meta.snippet as string}`);
      if (meta.summary) bodyParts.push(`\n${meta.summary as string}`);
      if (meta.description) bodyParts.push(`\n${meta.description as string}`);

      // Try to get entity mentions for this document (provides context about content)
      try {
        const mentions = this.db.prepare(
          'SELECT e.name, e.type FROM entity_mentions m JOIN entities e ON m.entity_id = e.id WHERE m.document_id = ? LIMIT 20'
        ).all(documentId) as Array<{ name: string; type: string }>;
        if (mentions.length > 0) {
          bodyParts.push(`\nMentioned entities: ${mentions.map(m => `${m.name} (${m.type})`).join(', ')}`);
        }
      } catch { /* entity tables may not exist */ }

      return {
        type: 'document',
        title: doc.title,
        body: bodyParts.join('\n'),
        metadata: {
          ...meta,
          source: doc.source,
          sourcePath: doc.source_path,
          mimeType: doc.mime_type,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
          indexedAt: doc.indexed_at,
        },
      };
    } catch { return undefined; }
  }

  // ─── Private: Node Builders ────────────────────────────────────────────────

  private addPersonNodes(nodes: VisualizationNode[], nodeIds: Set<string>): void {
    // Pull contacts from ContactStore if available
    if (this.contactStore) {
      const contacts = this.contactStore.listContacts({ limit: 500 });
      for (const contact of contacts) {
        const id = `person_${contact.id}`;
        if (nodeIds.has(id)) continue;
        nodeIds.add(id);

        const domain = this.classifyPersonDomain(contact.organization ?? '', contact.emails);

        nodes.push({
          id,
          label: contact.displayName,
          type: 'person',
          size: Math.max(1, contact.interactionCount),
          createdAt: contact.createdAt,
          domain,
          metadata: {
            contactId: contact.id,
            organization: contact.organization,
            relationshipType: contact.relationshipType,
            activityScore: Math.min(1, contact.interactionCount / 50),
          },
        });
      }
    }

    // Also pull person entities from entities table (works even without contactStore)
    try {
      const entityPersons = this.db.prepare(
        "SELECT * FROM entities WHERE type = 'person' LIMIT 200"
      ).all() as Array<{ id: string; name: string; first_seen: string; last_seen: string; metadata: string | null }>;

      for (const entity of entityPersons) {
        const id = `person_entity_${entity.id}`;
        if (nodeIds.has(id)) continue;
        nodeIds.add(id);

        nodes.push({
          id,
          label: entity.name,
          type: 'person',
          size: 1,
          createdAt: entity.first_seen,
          domain: 'general',
          metadata: { entityId: entity.id },
        });
      }
    } catch {
      // entities table may not exist yet
    }
  }

  private addTopicNodes(nodes: VisualizationNode[], nodeIds: Set<string>): void {
    try {
      const topics = this.db.prepare(
        "SELECT e.id, e.name, e.first_seen, COUNT(m.id) as mention_count FROM entities e LEFT JOIN entity_mentions m ON e.id = m.entity_id WHERE e.type = 'topic' GROUP BY e.id ORDER BY mention_count DESC LIMIT 100"
      ).all() as Array<{ id: string; name: string; first_seen: string; mention_count: number }>;

      for (const topic of topics) {
        const id = `topic_${topic.id}`;
        if (nodeIds.has(id)) continue;
        nodeIds.add(id);

        nodes.push({
          id,
          label: topic.name,
          type: 'topic',
          size: Math.max(1, topic.mention_count),
          createdAt: topic.first_seen,
          domain: 'general',
          metadata: {
            entityId: topic.id,
            mentionCount: topic.mention_count,
            activityScore: Math.min(1, topic.mention_count / 20),
          },
        });
      }
    } catch {
      // entities/entity_mentions tables may not exist yet
    }
  }

  private addDocumentNodes(nodes: VisualizationNode[], nodeIds: Set<string>): void {
    try {
      const docs = this.db.prepare(
        "SELECT d.id, d.title, d.created_at, d.source, d.source_path, d.metadata, COUNT(m.id) as mention_count FROM documents d LEFT JOIN entity_mentions m ON d.id = m.document_id WHERE d.source != 'conversation' GROUP BY d.id ORDER BY mention_count DESC LIMIT 500"
      ).all() as Array<{ id: string; title: string; created_at: string; source: string; source_path: string | null; metadata: string | null; mention_count: number }>;

      // Separate directory docs from file docs
      const directoryDocs = docs.filter(d => d.source === 'directory');
      const directoryPaths = directoryDocs.map(d => d.source_path).filter(Boolean) as string[];

      for (const doc of docs) {
        if (doc.source === 'directory') {
          // Create a directory node
          const id = `directory_${doc.id}`;
          if (nodeIds.has(id)) continue;
          nodeIds.add(id);

          let meta: Record<string, unknown> = {};
          try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch { /* ignore */ }
          const fileCount = docs.filter(d =>
            d.source === 'local_file' && d.source_path?.startsWith(doc.source_path!)
          ).length;

          nodes.push({
            id,
            label: doc.title,
            type: 'directory',
            size: Math.min(fileCount, 20),
            createdAt: doc.created_at,
            domain: 'general',
            metadata: { ...meta, documentId: doc.id, childCount: fileCount, path: doc.source_path },
          });
        } else if (doc.source === 'local_file') {
          // Check if this file belongs to an indexed directory
          const parentDir = directoryPaths.find(dirPath => doc.source_path?.startsWith(dirPath));
          if (parentDir) {
            // File belongs to an indexed directory — still show it as a node
            // but create an edge from the directory to this file
            this.pushDocumentNode(nodes, nodeIds, doc);
            // Create edge from directory to file
            const dirDoc = directoryDocs.find(d => d.source_path === parentDir);
            if (dirDoc) {
              const dirNodeId = `directory_${dirDoc.id}`;
              const fileNodeId = `document_${doc.id}`;
              // Edge will be added below in addDocumentEdges if needed
              // For now just ensure the file node exists in the graph
            }
            continue;
          }

          // Standalone file — show as individual node
          this.pushDocumentNode(nodes, nodeIds, doc);
        } else {
          // Email, calendar, contact, etc. — show as individual node
          this.pushDocumentNode(nodes, nodeIds, doc);
        }
      }
    } catch (err) {
      // documents table might not exist if DocumentStore hasn't initialized yet
      console.error('[GraphVisualizationProvider] addDocumentNodes failed:', err);
    }
  }

  private pushDocumentNode(
    nodes: VisualizationNode[],
    nodeIds: Set<string>,
    doc: { id: string; title: string; created_at: string; source: string; mention_count: number },
  ): void {
    const id = `document_${doc.id}`;
    if (nodeIds.has(id)) return;
    nodeIds.add(id);

    nodes.push({
      id,
      label: doc.title,
      type: 'document',
      size: Math.max(1, doc.mention_count),
      createdAt: doc.created_at,
      domain: doc.source === 'financial' ? 'finance' : doc.source === 'health' ? 'health' : 'general',
      metadata: {
        documentId: doc.id,
        source: doc.source,
        activityScore: Math.min(1, doc.mention_count / 10),
      },
    });
  }

  private addDirectoryFileEdges(
    edges: VisualizationEdge[],
    edgeKeys: Set<string>,
    nodeIds: Set<string>,
  ): void {
    try {
      // Find all directory documents and their child files
      const dirs = this.db.prepare(
        "SELECT id, source_path FROM documents WHERE source = 'directory' AND source_path IS NOT NULL"
      ).all() as Array<{ id: string; source_path: string }>;

      for (const dir of dirs) {
        const dirNodeId = `directory_${dir.id}`;
        if (!nodeIds.has(dirNodeId)) continue;

        // Find files that are children of this directory
        const children = this.db.prepare(
          "SELECT id FROM documents WHERE source = 'local_file' AND source_path LIKE ? || '%'"
        ).all(dir.source_path) as Array<{ id: string }>;

        for (const child of children) {
          const fileNodeId = `document_${child.id}`;
          if (!nodeIds.has(fileNodeId)) continue;

          const edgeKey = `${dirNodeId}→${fileNodeId}`;
          if (edgeKeys.has(edgeKey)) continue;
          edgeKeys.add(edgeKey);

          edges.push({
            id: `edge_dir_file_${dir.id}_${child.id}`,
            sourceId: dirNodeId,
            targetId: fileNodeId,
            label: 'contains',
            weight: 0.5,
          });
        }
      }
    } catch (err) {
      console.error('[GraphVisualizationProvider] addDirectoryFileEdges failed:', err);
    }
  }

  private addEventNodes(
    nodes: VisualizationNode[],
    nodeIds: Set<string>,
    daysBack: number,
    daysForward: number,
  ): void {
    const pastCutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const futureCutoff = new Date(Date.now() + daysForward * 24 * 60 * 60 * 1000).toISOString();

    try {
      const events = this.db.prepare(
        'SELECT id, title, start_time, attendees FROM indexed_calendar_events WHERE start_time >= ? AND start_time <= ? ORDER BY start_time DESC LIMIT 100'
      ).all(pastCutoff, futureCutoff) as Array<{
        id: string; title: string; start_time: string; attendees: string;
      }>;

      for (const event of events) {
        const id = `event_${event.id}`;
        if (nodeIds.has(id)) continue;
        nodeIds.add(id);

        let attendeeCount = 1;
        try {
          const parsed = JSON.parse(event.attendees) as string[];
          attendeeCount = Math.max(1, parsed.length);
        } catch { /* ignore */ }

        nodes.push({
          id,
          label: event.title,
          type: 'event',
          size: attendeeCount,
          createdAt: event.start_time,
          domain: 'general',
          metadata: {
            calendarEventId: event.id,
            activityScore: Math.min(1, attendeeCount / 8),
          },
        });
      }
    } catch {
      // Table might not exist if calendar indexer hasn't run
    }
  }

  private addEmailThreadNodes(nodes: VisualizationNode[], nodeIds: Set<string>): void {
    try {
      const threads = this.db.prepare(
        'SELECT thread_id, MIN(subject) as subject, COUNT(*) as msg_count, MIN(received_at) as first_date FROM indexed_emails GROUP BY thread_id ORDER BY msg_count DESC LIMIT 50'
      ).all() as Array<{
        thread_id: string; subject: string; msg_count: number; first_date: string;
      }>;

      for (const thread of threads) {
        const id = `email_thread_${thread.thread_id}`;
        if (nodeIds.has(id)) continue;
        nodeIds.add(id);

        nodes.push({
          id,
          label: thread.subject || '(No subject)',
          type: 'email_thread',
          size: thread.msg_count,
          createdAt: thread.first_date,
          domain: 'general',
          metadata: {
            threadId: thread.thread_id,
            messageCount: thread.msg_count,
            activityScore: Math.min(1, thread.msg_count / 15),
          },
        });
      }
    } catch {
      // Table might not exist if email indexer hasn't run
    }
  }

  private addReminderNodes(nodes: VisualizationNode[], nodeIds: Set<string>): void {
    if (!this.reminderStore) return;

    const reminders = this.reminderStore.findByStatus('pending');
    for (const reminder of reminders) {
      const id = `reminder_${reminder.id}`;
      if (nodeIds.has(id)) continue;
      nodeIds.add(id);

      nodes.push({
        id,
        label: reminder.text,
        type: 'reminder',
        size: 1,
        createdAt: reminder.createdAt,
        domain: 'general',
        metadata: { reminderId: reminder.id, dueAt: reminder.dueAt },
      });
    }
  }

  private addLocationNodes(nodes: VisualizationNode[], nodeIds: Set<string>): void {
    try {
      // Group locations by rounded lat/lon (2 decimal places = ~1km)
      const locations = this.db.prepare(
        'SELECT ROUND(latitude, 2) as lat, ROUND(longitude, 2) as lon, COUNT(*) as visit_count, MIN(timestamp) as first_visit FROM location_history GROUP BY ROUND(latitude, 2), ROUND(longitude, 2) ORDER BY visit_count DESC LIMIT 30'
      ).all() as Array<{
        lat: number; lon: number; visit_count: number; first_visit: string;
      }>;

      for (const loc of locations) {
        const id = `location_${loc.lat}_${loc.lon}`;
        if (nodeIds.has(id)) continue;
        nodeIds.add(id);

        // Format human-readable label from coordinates
        const latDir = loc.lat >= 0 ? 'N' : 'S';
        const lonDir = loc.lon >= 0 ? 'E' : 'W';
        const locLabel = `Area near ${Math.abs(loc.lat).toFixed(1)}\u00B0${latDir}, ${Math.abs(loc.lon).toFixed(1)}\u00B0${lonDir}`;

        nodes.push({
          id,
          label: locLabel,
          type: 'location',
          size: loc.visit_count,
          createdAt: loc.first_visit,
          domain: 'general',
          metadata: { latitude: loc.lat, longitude: loc.lon, visitCount: loc.visit_count },
        });
      }
    } catch {
      // Table might not exist if location hasn't been configured
    }
  }

  // ─── Private: Edge Builders ────────────────────────────────────────────────

  private addMentionEdges(
    edges: VisualizationEdge[],
    edgeKeys: Set<string>,
    nodeIds: Set<string>,
  ): void {
    try {
      // entity_mentions links entity_id to document_id
      const mentions = this.db.prepare(
        'SELECT entity_id, document_id, COUNT(*) as count FROM entity_mentions GROUP BY entity_id, document_id'
      ).all() as Array<{ entity_id: string; document_id: string; count: number }>;

      for (const m of mentions) {
        // Try to find the node IDs — could be person or topic entity
        const entityNodeId = this.findEntityNodeId(m.entity_id, nodeIds);
        const docNodeId = `document_${m.document_id}`;

        if (!entityNodeId || !nodeIds.has(docNodeId)) continue;

        const key = [entityNodeId, docNodeId].sort().join('::');
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);

        edges.push({
          id: `edge_mention_${m.entity_id}_${m.document_id}`,
          sourceId: entityNodeId,
          targetId: docNodeId,
          weight: Math.min(1, m.count / 10),
          label: 'mentioned_in',
        });
      }
    } catch {
      // entity_mentions table may not exist yet
    }
  }

  private addAttendeeEdges(
    edges: VisualizationEdge[],
    edgeKeys: Set<string>,
    nodeIds: Set<string>,
  ): void {
    try {
      const events = this.db.prepare(
        'SELECT id, attendees FROM indexed_calendar_events'
      ).all() as Array<{ id: string; attendees: string }>;

      // Build email-to-contact-node map
      const emailToNodeId = this.buildEmailToNodeMap(nodeIds);

      for (const event of events) {
        const eventNodeId = `event_${event.id}`;
        if (!nodeIds.has(eventNodeId)) continue;

        let attendees: string[] = [];
        try {
          attendees = JSON.parse(event.attendees) as string[];
        } catch { continue; }

        for (const attendeeEmail of attendees) {
          const personNodeId = emailToNodeId.get(attendeeEmail.toLowerCase());
          if (!personNodeId) continue;

          const key = [personNodeId, eventNodeId].sort().join('::');
          if (edgeKeys.has(key)) continue;
          edgeKeys.add(key);

          edges.push({
            id: `edge_attendee_${personNodeId}_${event.id}`,
            sourceId: personNodeId,
            targetId: eventNodeId,
            weight: 0.5,
            label: 'attended',
          });
        }
      }
    } catch {
      // Calendar table might not exist
    }
  }

  private addEmailThreadEdges(
    edges: VisualizationEdge[],
    edgeKeys: Set<string>,
    nodeIds: Set<string>,
  ): void {
    try {
      const emails = this.db.prepare(
        'SELECT thread_id, "from", "to" FROM indexed_emails'
      ).all() as Array<{ thread_id: string; from: string; to: string }>;

      const emailToNodeId = this.buildEmailToNodeMap(nodeIds);

      for (const email of emails) {
        const threadNodeId = `email_thread_${email.thread_id}`;
        if (!nodeIds.has(threadNodeId)) continue;

        // From edge
        const fromNodeId = emailToNodeId.get(email.from.toLowerCase());
        if (fromNodeId) {
          const key = [fromNodeId, threadNodeId].sort().join('::');
          if (!edgeKeys.has(key)) {
            edgeKeys.add(key);
            edges.push({
              id: `edge_email_${fromNodeId}_${email.thread_id}`,
              sourceId: fromNodeId,
              targetId: threadNodeId,
              weight: 0.3,
              label: 'emailed',
            });
          }
        }

        // To edges
        let recipients: string[] = [];
        try {
          recipients = JSON.parse(email.to) as string[];
        } catch { continue; }

        for (const recipient of recipients) {
          const toNodeId = emailToNodeId.get(recipient.toLowerCase());
          if (!toNodeId) continue;

          const key = [toNodeId, threadNodeId].sort().join('::');
          if (edgeKeys.has(key)) continue;
          edgeKeys.add(key);

          edges.push({
            id: `edge_email_${toNodeId}_${email.thread_id}`,
            sourceId: toNodeId,
            targetId: threadNodeId,
            weight: 0.3,
            label: 'emailed',
          });
        }
      }
    } catch {
      // Email table might not exist
    }
  }

  private addRelationshipEdges(
    edges: VisualizationEdge[],
    edgeKeys: Set<string>,
    nodeIds: Set<string>,
  ): void {
    if (!this.relationshipAnalyzer) return; // No relationship analyzer — skip
    const relGraph = this.relationshipAnalyzer.buildRelationshipGraph();

    for (const edge of relGraph.edges) {
      const sourceNodeId = `person_${edge.sourceId}`;
      const targetNodeId = `person_${edge.targetId}`;

      if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) continue;

      const key = [sourceNodeId, targetNodeId].sort().join('::');
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);

      edges.push({
        id: `edge_rel_${edge.sourceId}_${edge.targetId}`,
        sourceId: sourceNodeId,
        targetId: targetNodeId,
        weight: Math.min(1, edge.weight / 20),
        label: 'co-occurred',
      });
    }
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────────

  private findEntityNodeId(entityId: string, nodeIds: Set<string>): string | null {
    // Check person entities
    const personId = `person_entity_${entityId}`;
    if (nodeIds.has(personId)) return personId;

    // Check topic entities
    const topicId = `topic_${entityId}`;
    if (nodeIds.has(topicId)) return topicId;

    return null;
  }

  private buildEmailToNodeMap(nodeIds: Set<string>): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.contactStore) return map; // No contact store — return empty map
    const contacts = this.contactStore.listContacts({ limit: 500 });
    for (const contact of contacts) {
      const nodeId = `person_${contact.id}`;
      if (!nodeIds.has(nodeId)) continue;
      for (const email of contact.emails) {
        map.set(email.toLowerCase(), nodeId);
      }
    }
    return map;
  }

  private classifyPersonDomain(organization: string, emails: string[]): string {
    if (!organization && emails.length === 0) return 'general';
    // Finance-related organization names
    const financeKeywords = ['bank', 'finance', 'capital', 'invest', 'insurance'];
    const orgLower = organization.toLowerCase();
    if (financeKeywords.some(k => orgLower.includes(k))) return 'finance';
    return 'general';
  }

  /**
   * Cap nodes by retaining the most-connected (highest size) nodes.
   */
  private capNodes(nodes: VisualizationNode[], max: number): VisualizationNode[] {
    if (nodes.length <= max) return nodes;
    return [...nodes].sort((a, b) => b.size - a.size).slice(0, max);
  }

  /**
   * Cap edges by retaining highest-weight edges.
   */
  private capEdges(edges: VisualizationEdge[], max: number): VisualizationEdge[] {
    if (edges.length <= max) return edges;
    return [...edges].sort((a, b) => b.weight - a.weight).slice(0, max);
  }

  private computeStats(nodes: VisualizationNode[], edges: VisualizationEdge[]): GraphStats {
    const nodesByType: Record<string, number> = {};
    for (const node of nodes) {
      nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
    }

    // Count connections per node
    const connectionCount = new Map<string, number>();
    for (const edge of edges) {
      connectionCount.set(edge.sourceId, (connectionCount.get(edge.sourceId) ?? 0) + 1);
      connectionCount.set(edge.targetId, (connectionCount.get(edge.targetId) ?? 0) + 1);
    }

    let mostConnectedNode: GraphStats['mostConnectedNode'] = null;
    let maxConnections = 0;
    for (const [nodeId, count] of connectionCount) {
      if (count > maxConnections) {
        maxConnections = count;
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          mostConnectedNode = { id: node.id, label: node.label, connections: count };
        }
      }
    }

    const totalConnections = [...connectionCount.values()].reduce((sum, c) => sum + c, 0);
    const averageConnections = nodes.length > 0 ? totalConnections / nodes.length : 0;

    // Graph density: actual edges / max possible edges
    const maxPossibleEdges = nodes.length * (nodes.length - 1) / 2;
    const graphDensity = maxPossibleEdges > 0 ? edges.length / maxPossibleEdges : 0;

    // Growth rate: nodes created in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const growthRate = nodes.filter(n => n.createdAt >= sevenDaysAgo).length;

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByType,
      averageConnections: Math.round(averageConnections * 100) / 100,
      mostConnectedNode,
      graphDensity: Math.round(graphDensity * 10000) / 10000,
      growthRate,
    };
  }

  private dateToGranularity(dateStr: string, granularity: 'day' | 'week' | 'month'): string {
    if (granularity === 'day') return dateStr;
    if (granularity === 'month') return dateStr.substring(0, 7); // YYYY-MM

    // Week: round to Monday
    const date = new Date(dateStr);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday offset
    date.setDate(date.getDate() + diff);
    return date.toISOString().substring(0, 10);
  }
}
