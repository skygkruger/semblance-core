// Barrel export for the contacts subsystem.

export { ContactStore } from './contact-store.js';
export { ContactIngestionPipeline } from './contact-ingestion.js';
export { ContactEntityResolver, levenshteinDistance } from './entity-resolver.js';
export { RelationshipAnalyzer } from './relationship-analyzer.js';
export type {
  ContactEntity,
  RelationshipType,
  CommunicationFrequency,
  FrequencyTrend,
  ContactIngestionResult,
  EntityResolutionResult,
  ResolutionConfidence,
  RelationshipGraph,
  RelationshipGraphNode,
  RelationshipGraphEdge,
  RelationshipCluster,
  ResolvedContactResult,
  FrequencyAlert,
  ContactAddress,
} from './contact-types.js';
