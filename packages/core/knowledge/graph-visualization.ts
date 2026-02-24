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
  | 'event'
  | 'email_thread'
  | 'reminder'
  | 'location';

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
}

export interface GrowthDataPoint {
  date: string;            // ISO date (YYYY-MM-DD)
  cumulative: number;
  newCount: number;
}

export interface NodeContext {
  node: VisualizationNode;
  connections: Array<{ node: VisualizationNode; edge: VisualizationEdge }>;
  recentActivity: string[];
}

export interface GraphOptions {
  maxNodes?: number;       // Default 200
  edgeCapMultiplier?: number; // Default 3 (3x nodes)
  includeReminders?: boolean;
  includeLocations?: boolean;
  daysBack?: number;       // For events, default 90
  daysForward?: number;    // For events, default 30
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
  private contactStore: ContactStore;
  private relationshipAnalyzer: RelationshipAnalyzer;
  private reminderStore: ReminderStore | null;

  constructor(config: {
    db: DatabaseHandle;
    contactStore: ContactStore;
    relationshipAnalyzer: RelationshipAnalyzer;
    reminderStore?: ReminderStore;
  }) {
    this.db = config.db;
    this.contactStore = config.contactStore;
    this.relationshipAnalyzer = config.relationshipAnalyzer;
    this.reminderStore = config.reminderStore ?? null;
  }

  initSchema(): void {
    this.db.exec(CREATE_CACHE_TABLE);
  }

  /**
   * Build a complete visualization graph from all data stores.
   * Applies node/edge caps for performance.
   */
  getGraphData(options?: GraphOptions): VisualizationGraph {
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

    // --- Clusters from relationship graph ---
    const relGraph = this.relationshipAnalyzer.buildRelationshipGraph();
    for (const cluster of relGraph.clusters) {
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
    const cappedNodes = this.capNodes(nodes, maxNodes);
    const cappedNodeIds = new Set(cappedNodes.map(n => n.id));
    let cappedEdges = edges.filter(
      e => cappedNodeIds.has(e.sourceId) && cappedNodeIds.has(e.targetId)
    );
    cappedEdges = this.capEdges(cappedEdges, edgeCap);

    const stats = this.computeStats(cappedNodes, cappedEdges);

    return {
      nodes: cappedNodes,
      edges: cappedEdges,
      clusters: clusters.filter(c => c.nodeIds.some(nid => cappedNodeIds.has(nid))),
      stats,
    };
  }

  /**
   * Get context for a specific node — connections, recent activity, related items.
   */
  getNodeContext(nodeId: string): NodeContext | null {
    const graph = this.getGraphData();
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return null;

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

    return { node, connections, recentActivity };
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
    const entityDates = this.db.prepare(
      'SELECT first_seen as date FROM entities ORDER BY first_seen ASC'
    ).all() as { date: string }[];

    const docDates = this.db.prepare(
      'SELECT created_at as date FROM documents ORDER BY created_at ASC'
    ).all() as { date: string }[];

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

  // ─── Private: Node Builders ────────────────────────────────────────────────

  private addPersonNodes(nodes: VisualizationNode[], nodeIds: Set<string>): void {
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
        },
      });
    }

    // Also pull person entities from entities table that aren't already contacts
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
  }

  private addTopicNodes(nodes: VisualizationNode[], nodeIds: Set<string>): void {
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
        metadata: { entityId: topic.id, mentionCount: topic.mention_count },
      });
    }
  }

  private addDocumentNodes(nodes: VisualizationNode[], nodeIds: Set<string>): void {
    const docs = this.db.prepare(
      'SELECT d.id, d.title, d.created_at, d.source, COUNT(m.id) as mention_count FROM documents d LEFT JOIN entity_mentions m ON d.id = m.document_id GROUP BY d.id ORDER BY mention_count DESC LIMIT 100'
    ).all() as Array<{ id: string; title: string; created_at: string; source: string; mention_count: number }>;

    for (const doc of docs) {
      const id = `document_${doc.id}`;
      if (nodeIds.has(id)) continue;
      nodeIds.add(id);

      nodes.push({
        id,
        label: doc.title,
        type: 'document',
        size: Math.max(1, doc.mention_count),
        createdAt: doc.created_at,
        domain: doc.source === 'financial' ? 'finance' : doc.source === 'health' ? 'health' : 'general',
        metadata: { documentId: doc.id, source: doc.source },
      });
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
          metadata: { calendarEventId: event.id },
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
          metadata: { threadId: thread.thread_id, messageCount: thread.msg_count },
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

        nodes.push({
          id,
          label: `${loc.lat}, ${loc.lon}`,
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
