# Step 24 — Visual Knowledge Graph

## Date: February 24, 2026
## Sprint: 5 — Becomes Permanent (Sovereignty + Trust)
## Builds On: Knowledge Graph (Sprint 1), Contacts + Relationship Intelligence (Step 14), all indexed data sources from Sprints 1–4
## Repo: semblance-core (free-tier feature)
## Baseline: 3,185 tests, 0 failures, TypeScript clean

---

## Context

This is the second step of Sprint 5. The knowledge graph has been populated by 23 steps of data ingestion — emails, calendar events, documents, contacts, relationships, web search results, reminders, clipboard captures, financial data. Users can *feel* compound knowledge through the chat and Morning Brief. They can't *see* it.

The Visual Knowledge Graph makes the invisible visible. It's an interactive visualization showing every entity Semblance knows about, how they're connected, and how the graph has grown over time. This is the "look what it knows about my life" moment — shareable, impressive, and impossible for any cloud AI to replicate because no cloud AI has this data.

**This is a pure visualization step.** No new data collection. No new data sources. No new Gateway calls. Everything displayed comes from existing knowledge graph entities and relationship mappings already stored locally.

**Risk level: LOW.** D3.js is mature. The data already exists. This is rendering, not reasoning.

---

## Deliverable A: Knowledge Graph Data Provider

### What It Is

A backend service that queries the existing knowledge graph, entity stores, and relationship mappings to produce structured data suitable for visualization. The visualization layer must never query databases directly — it receives pre-structured graph data.

### Implementation

```typescript
// packages/core/knowledge/graph-visualization.ts
export class GraphVisualizationProvider {
  constructor(deps: {
    db: DatabaseHandle;
    contactStore: ContactStore;
    relationshipAnalyzer: RelationshipAnalyzer;
    semanticSearch: SemanticSearch;
    knowledgeGraph: KnowledgeGraph;
  });

  // Get the full graph for visualization
  async getGraphData(options?: {
    maxNodes?: number;          // Default: 200 (performance guard)
    includeTypes?: EntityType[];  // Filter by entity type
    since?: Date;               // For time slider — entities added after this date
    clusterBy?: 'domain' | 'type' | 'time';
  }): Promise<VisualizationGraph>;

  // Get context for a specific node (on tap/click)
  async getNodeContext(nodeId: string): Promise<NodeContext>;

  // Get graph statistics
  async getGraphStats(): Promise<GraphStatistics>;

  // Get growth data for the time slider
  async getGrowthTimeline(
    granularity: 'day' | 'week' | 'month'
  ): Promise<GrowthDataPoint[]>;
}

type EntityType = 'person' | 'topic' | 'document' | 'event' | 'email_thread' | 'reminder' | 'location';

interface VisualizationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  stats: GraphStatistics;
}

interface GraphNode {
  id: string;
  label: string;              // Display name
  type: EntityType;
  domain: 'work' | 'personal' | 'finance' | 'health' | 'general';
  size: number;               // Relative importance (connection count)
  createdAt: string;          // ISO timestamp — for time slider
  metadata: Record<string, unknown>;  // Type-specific data
}

interface GraphEdge {
  id: string;
  source: string;             // Node ID
  target: string;             // Node ID
  type: string;               // Relationship type: 'mentioned_in', 'attended', 'related_to', 'sent_by'
  weight: number;             // Strength of connection (interaction frequency)
  label?: string;             // Optional edge label
}

interface GraphCluster {
  id: string;
  label: string;              // "Work", "Personal", "Finance", etc.
  domain: string;
  nodeIds: string[];          // Nodes in this cluster
  color: string;              // Cluster color from design system
}

interface NodeContext {
  node: GraphNode;
  connections: { node: GraphNode; edge: GraphEdge }[];
  recentActivity: ActivityItem[];    // Last 5 interactions involving this entity
  relatedDocuments?: string[];       // Document titles
  relatedEmails?: string[];          // Email subjects
  relatedEvents?: string[];          // Calendar event titles
}

interface GraphStatistics {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<EntityType, number>;
  averageConnections: number;
  mostConnectedNode: { id: string; label: string; connections: number };
  graphDensity: number;       // edges / possible edges
  growthRate: {               // Compared to previous period
    nodesAdded: number;
    edgesAdded: number;
    period: string;           // "past 7 days"
  };
}

interface GrowthDataPoint {
  date: string;               // ISO date
  cumulativeNodes: number;
  cumulativeEdges: number;
  newNodes: number;
  newEdges: number;
}

interface ActivityItem {
  type: string;               // 'email', 'meeting', 'document_edit', etc.
  description: string;
  timestamp: string;
}
```

### Entity Source Mapping

The provider maps existing data stores to graph nodes:

| Entity Type | Source | How Nodes Are Created |
|-------------|--------|----------------------|
| `person` | ContactStore + email sender/recipients | One node per unique contact. Size = email count + meeting count |
| `topic` | Semantic clustering of email subjects + document titles | LLM extracts topic labels from clusters. Size = document/email count in cluster |
| `document` | Knowledge graph indexed files | One node per indexed document. Size = reference count |
| `event` | Calendar events (past 90 days + future 30 days) | One node per event. Edges to attendee person nodes |
| `email_thread` | Top email threads by activity | One node per active thread (top 50). Edges to participants |
| `reminder` | Active reminders | One node per active reminder. Edges to related entities if linked |
| `location` | Location store frequent locations | One node per frequent location. Edges to events/contacts at that location |

### Edge Creation

Edges are derived from existing relationship data:

| Edge Type | Source | Logic |
|-----------|--------|-------|
| `mentioned_in` | Email/document content → entity | Person mentioned in email thread or document |
| `attended` | Calendar event attendees | Person attended event |
| `related_to` | Semantic similarity | Documents/emails with high cosine similarity (>0.8) |
| `sent_by` | Email sender field | Person → email thread |
| `located_at` | Event location + contact location | Event or person associated with location |
| `follows_up` | Follow-up tracker | Email thread has follow-up relationship |

### Domain Classification

Nodes are assigned to domains using a simple heuristic:
- `work`: entities from work email domain, work calendar, work contacts
- `personal`: entities from personal email, personal calendar
- `finance`: entities tagged with financial keywords or from RecurringDetector
- `health`: entities from health-related data (if DR loaded, otherwise omitted)
- `general`: everything else

The work/personal split uses the user's email domains. If only one email is connected, default to `general`.

### Performance Guards

- **Node cap:** Default 200 nodes. Larger graphs get the most-connected nodes. User can expand in UI.
- **Edge cap:** Maximum 3× node count. Weakest edges pruned first.
- **Caching:** Graph data cached in SQLite table `graph_cache` with 1-hour TTL. Invalidated when new data is indexed.
- **Time slider queries:** Pre-computed growth timeline stored during indexing, not computed on demand.

---

## Deliverable B: Desktop Visualization

### Technology Choice

**D3.js force-directed graph** in the Tauri webview. D3 is:
- Mature, well-documented, handles thousands of nodes
- Already renderable in any web context (Tauri webview is Chromium)
- Supports zoom, pan, drag, click interactions natively
- Force simulation naturally clusters related nodes

### Implementation

```typescript
// packages/desktop/src/components/KnowledgeGraphView.tsx
// Main visualization component

// Layout:
// ┌─────────────────────────────────────────────────────┐
// │ Knowledge Graph                    [Stats] [Export] │
// │ ┌─────────────────────────────────────────────────┐ │
// │ │                                                 │ │
// │ │           D3 Force-Directed Graph               │ │
// │ │                                                 │ │
// │ │                                                 │ │
// │ └─────────────────────────────────────────────────┘ │
// │ ◀═══════════════╤══════════════════▶   Time Slider  │
// │ ┌───────────────┴──────────────────┐                │
// │ │ Node Detail Panel (on tap)       │                │
// │ │ Name, type, connections, context │                │
// │ └─────────────────────────────────┘                │
// └─────────────────────────────────────────────────────┘
```

**Visual Design (per DESIGN_SYSTEM.md):**

Node colors by type:
| Type | Color | Design Token |
|------|-------|-------------|
| Person | Semblance Blue `#4A7FBA` | `--color-primary` |
| Topic | Warm Amber `#E8A838` | `--color-accent` |
| Document | Muted Slate `#8B93A7` | `--color-muted` |
| Event | Living Green `#3DB87A` | `--color-success` |
| Email Thread | Soft tint of Blue | `--color-primary` at 60% |
| Reminder | Alert Coral `#E85D5D` | `--color-attention` |
| Location | Teal variant | `#5BA3A3` |

Node sizing: Radius proportional to `node.size` (connection count), min 6px, max 24px.

Edge styling: Thin lines (`1px`), color `--color-border` (`#E2E4E9`), opacity proportional to `edge.weight`. Hover highlights the edge and connected nodes.

Cluster backgrounds: Soft convex hull with domain color at 8% opacity.

**Interactions:**
- **Zoom/Pan:** Mouse wheel zoom, click-drag pan. Pinch zoom on trackpad.
- **Node drag:** Click-drag any node to reposition. Other nodes adjust via force simulation.
- **Node click:** Opens the detail panel below the graph with NodeContext data.
- **Node hover:** Highlights the node, its edges, and connected nodes. Dims everything else.
- **Time slider:** Range input below the graph. Dragging filters nodes by `createdAt`. Graph animates as nodes appear/disappear.
- **Export:** Button captures the SVG as a PNG image. Uses `html2canvas` or SVG-to-canvas conversion.

**Statistics Overlay:**
- Floating panel (top-right corner) with key stats: total entities, connections, most connected, growth rate
- Uses `--color-surface-2` background, `--radius-lg` corners
- Toggleable via the [Stats] button

**Navigation:**
- Accessible from sidebar navigation: "Knowledge Graph" item with graph icon
- Also accessible from the Knowledge Moment card: "See your knowledge graph →" link

### Graph Rendering with D3

```typescript
// packages/desktop/src/components/d3/ForceGraph.tsx
// Wrapper component that manages D3 force simulation in React

// Key D3 configuration:
// - d3.forceSimulation(nodes)
// - d3.forceLink(edges).id(d => d.id).distance(80)
// - d3.forceManyBody().strength(-120)
// - d3.forceCenter(width/2, height/2)
// - d3.forceCollide().radius(d => d.radius + 4)

// SVG structure:
// <svg>
//   <g class="clusters">   <!-- Convex hull backgrounds -->
//   <g class="edges">      <!-- Lines -->
//   <g class="nodes">      <!-- Circles + labels -->
// </svg>
```

**D3 dependency:** Add `d3` to `packages/desktop/package.json` devDependencies. D3 is pre-approved per the design system (visualization library). Use `d3-force`, `d3-selection`, `d3-zoom`, `d3-shape` (for convex hulls). Import modularly, not the full d3 bundle.

---

## Deliverable C: Mobile Visualization

### Technology Choice

**WebView-based rendering** using the same D3 visualization. React Native's WebView loads an HTML page containing the D3 graph. This avoids maintaining two separate graph implementations and guarantees visual parity.

### Implementation

```typescript
// packages/mobile/src/screens/KnowledgeGraphScreen.tsx
// Uses react-native-webview to render the D3 graph

// The WebView loads a self-contained HTML string that includes:
// 1. D3.js (bundled inline, not CDN — no network)
// 2. Graph data (injected as JSON)
// 3. The same ForceGraph rendering logic as desktop
// 4. Touch event handlers mapped to postMessage for React Native

// Communication:
// RN → WebView: inject graph data via injectJavaScript()
// WebView → RN: postMessage() on node tap → RN shows detail panel natively
```

**Mobile-specific adjustments:**
- Node labels hidden by default (shown on tap) to reduce visual clutter on small screens
- Pinch-to-zoom for graph navigation
- Node tap opens a bottom sheet (not side panel) with NodeContext
- Time slider is a horizontal scroll bar at bottom
- Export uses WebView screenshot capture
- Statistics shown in a collapsible header, not a floating overlay

**Navigation:**
- Tab bar item or sidebar menu item: "Knowledge" with graph icon
- Also accessible from Morning Brief: "Explore your knowledge graph →"

---

## Deliverable D: Image Export

### Implementation

```typescript
// packages/core/knowledge/graph-export.ts
export class GraphExporter {
  // Export current graph view as PNG
  // Desktop: SVG → Canvas → PNG blob → save via Tauri dialog
  // Mobile: WebView screenshot → save to camera roll or share sheet

  async exportAsPng(options: {
    width?: number;        // Default: 1920
    height?: number;       // Default: 1080
    includeStats?: boolean; // Overlay statistics
    includeTimestamp?: boolean; // "Generated by Semblance — Feb 24, 2026"
    backgroundColor?: string;  // Default: --color-background
  }): Promise<Uint8Array>;
}
```

**Export includes:**
- The graph in its current zoom/pan state
- Optional statistics overlay
- "Generated by Semblance" watermark (subtle, bottom-right)
- No user-identifying information in the export by default (node labels use first names only)
- User can toggle "include full names" before export

---

## Scope Boundaries

**This step does NOT include:**
- New data ingestion or data sources
- Gateway calls of any kind
- Changes to the knowledge graph storage schema
- Premium/DR features — this is entirely free tier
- Real-time graph updates (graph refreshes on navigation, not live)
- 3D visualization (2D force-directed is sufficient for v1)
- Graph search/filter UI (tap + time slider is sufficient for v1)

**This step DOES include:**
- Backend data provider that queries existing stores
- Desktop D3.js interactive visualization
- Mobile WebView-based visualization
- Node detail panel with context
- Time slider for growth history
- Statistics overlay
- PNG export
- Performance guards (node cap, edge cap, caching)

---

## Commit Strategy

6 commits. Each compiles, passes all tests, and leaves the codebase working.

| Commit | Deliverable | Description | Tests |
|--------|-------------|-------------|-------|
| 1 | A | GraphVisualizationProvider — entity/edge extraction from existing stores | 8+ |
| 2 | A | Graph statistics + growth timeline + caching | 5+ |
| 3 | B | Desktop KnowledgeGraphView with D3 force-directed graph | 4+ |
| 4 | B | Desktop interactions — node click detail panel, hover, time slider, stats overlay | 4+ |
| 5 | C | Mobile KnowledgeGraphScreen with WebView rendering + native detail bottom sheet | 3+ |
| 6 | D | Image export (desktop + mobile) + navigation wiring | 4+ |

**Minimum 28 new tests. Target: 35+.**

---

## Verification Checks

Run ALL of these. Report raw terminal output for each.

### Standard Battery
```bash
/step-verify
/extension-audit
/privacy-check
/stub-scan
```

### Step-Specific Checks

```bash
# 1. GraphVisualizationProvider exists and has all methods
grep -rn "GraphVisualizationProvider" packages/core/knowledge/ --include="*.ts"
grep -n "getGraphData\|getNodeContext\|getGraphStats\|getGrowthTimeline" packages/core/knowledge/graph-visualization.ts

# 2. Entity types covered
grep -n "person\|topic\|document\|event\|email_thread\|reminder\|location" packages/core/knowledge/graph-visualization.ts | head -20

# 3. Edge types covered
grep -n "mentioned_in\|attended\|related_to\|sent_by\|located_at\|follows_up" packages/core/knowledge/graph-visualization.ts

# 4. Performance guards in place
grep -n "maxNodes\|nodeLimit\|NODE_CAP\|EDGE_CAP\|cache\|TTL" packages/core/knowledge/graph-visualization.ts

# 5. Desktop visualization component exists
grep -rn "KnowledgeGraphView\|ForceGraph" packages/desktop/src/components/ --include="*.tsx"

# 6. D3 dependency added
grep "d3" packages/desktop/package.json

# 7. Mobile visualization exists
grep -rn "KnowledgeGraphScreen" packages/mobile/src/ --include="*.tsx"

# 8. Export functionality exists
grep -rn "GraphExporter\|exportAsPng" packages/core/knowledge/ --include="*.ts"

# 9. No Gateway/network imports in visualization code
grep -rn "gateway\|Gateway\|ipcClient\|IPC" packages/core/knowledge/graph-visualization.ts
grep -rn "fetch\|http\|net\b" packages/core/knowledge/graph-visualization.ts

# 10. No premium/DR imports
grep -rn "from.*representative\|from.*@semblance/dr\|from.*forms\|from.*health" packages/core/knowledge/graph-visualization.ts

# 11. Statistics include required fields
grep -n "totalNodes\|totalEdges\|mostConnected\|growthRate" packages/core/knowledge/graph-visualization.ts

# 12. Time slider data (growth timeline)
grep -n "GrowthDataPoint\|getGrowthTimeline\|cumulativeNodes" packages/core/knowledge/graph-visualization.ts

# 13. Test count
/test-count
```

---

## Exit Criteria

Step 24 is complete when ALL of the following are true:

1. ✅ Knowledge graph visualization renders with real data from existing knowledge graph entities.
2. ✅ Nodes represent actual entities: people, topics, documents, events, email threads, reminders, locations.
3. ✅ Edges show real relationships derived from data (mentioned_in, attended, related_to, sent_by, located_at).
4. ✅ Visual clusters group nodes by domain (work, personal, finance, general) with distinct colors from the design system.
5. ✅ Time slider filters nodes by creation date and graph animates as nodes appear/disappear.
6. ✅ Node tap/click shows detail panel with connections, recent activity, and related content.
7. ✅ Statistics overlay shows total entities, connections, most connected node, and growth rate.
8. ✅ Graph exportable as PNG image on both desktop and mobile.
9. ✅ Desktop visualization uses D3.js force-directed graph with zoom, pan, drag, hover interactions.
10. ✅ Mobile visualization renders via WebView with touch interactions and native detail bottom sheet.
11. ✅ Performance guards enforced: node cap (default 200), edge cap, and graph caching with TTL.
12. ✅ Zero Gateway/network calls — pure local data visualization.
13. ✅ 25+ new tests. All existing tests pass. Privacy audit clean.
14. ✅ TypeScript compiles cleanly (`npx tsc --noEmit` at root).

---

## Autonomous Decision Authority

You may make these decisions without asking:

- **D3 module selection** — which specific d3-* packages to import (prefer modular over full bundle)
- **Force simulation parameters** — strength, distance, collision radius tuning for visual quality
- **Node cap adjustments** — if 200 feels too sparse or too dense, adjust with rationale
- **Cluster algorithm** — convex hull, voronoi, or simple background shapes for domain clusters
- **Mobile WebView implementation details** — HTML string construction, message passing protocol
- **Cache TTL tuning** — 1 hour is a starting point, adjust based on graph computation cost
- **Edge pruning heuristic** — how to select which edges to prune when over cap
- **Export image dimensions** — whatever produces good quality at reasonable file size

## Escalation Required

Stop and ask before:

- **Adding new data sources** — this step visualizes existing data only
- **Modifying the knowledge graph schema** — no schema changes
- **Adding any Gateway or network calls** — zero network in this step
- **Adding dependencies beyond D3** — no new charting libraries without justification
- **Changing the entity type taxonomy** — the 7 entity types are specified
- **Making visualization a premium feature** — this is free tier, full stop
