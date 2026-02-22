// Contact Types — Shared type definitions for the contacts subsystem.
// No runtime dependencies — pure types only.

/** Relationship classification between the user and a contact. */
export type RelationshipType =
  | 'colleague'
  | 'client'
  | 'vendor'
  | 'friend'
  | 'family'
  | 'acquaintance'
  | 'unknown';

/** How communication frequency is trending. */
export type FrequencyTrend = 'increasing' | 'decreasing' | 'stable' | 'inactive';

/** Communication frequency metrics for a contact. */
export interface CommunicationFrequency {
  emailsPerWeek: number;
  meetingsPerMonth: number;
  lastEmailDate: string | null;
  lastMeetingDate: string | null;
  trend: FrequencyTrend;
  analyzedAt: string;
}

/** A contact entity stored in the local knowledge graph. */
export interface ContactEntity {
  id: string;
  deviceContactId: string | null;
  displayName: string;
  givenName: string;
  familyName: string;
  emails: string[];
  phones: string[];
  organization: string;
  jobTitle: string;
  birthday: string;
  addresses: ContactAddress[];
  relationshipType: RelationshipType;
  communicationFrequency: CommunicationFrequency | null;
  lastContactDate: string | null;
  firstContactDate: string | null;
  interactionCount: number;
  tags: string[];
  emailEntityIds: string[];
  calendarEntityIds: string[];
  documentEntityIds: string[];
  source: 'device' | 'email' | 'calendar' | 'manual';
  mergedFrom: string[];
  createdAt: string;
  updatedAt: string;
}

/** Address stored in a contact entity. */
export interface ContactAddress {
  label: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

/** Result from the contact ingestion pipeline. */
export interface ContactIngestionResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
}

/** Confidence level for entity resolution. */
export type ResolutionConfidence = 'high' | 'medium' | 'low';

/** Result from entity resolution for a single contact. */
export interface EntityResolutionResult {
  contactId: string;
  matchedEntityId: string | null;
  confidence: ResolutionConfidence;
  matchType: 'email' | 'name_org' | 'fuzzy_name' | 'new';
  needsConfirmation: boolean;
}

/** A node in the relationship graph. */
export interface RelationshipGraphNode {
  contactId: string;
  displayName: string;
  relationshipType: RelationshipType;
  interactionCount: number;
}

/** An edge in the relationship graph (co-occurrence). */
export interface RelationshipGraphEdge {
  sourceId: string;
  targetId: string;
  weight: number;
  sharedThreads: number;
  sharedMeetings: number;
}

/** A cluster of related contacts. */
export interface RelationshipCluster {
  id: string;
  name: string;
  contactIds: string[];
}

/** The full relationship graph. */
export interface RelationshipGraph {
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  clusters: RelationshipCluster[];
}

/** Resolved contact result from the contact resolver. */
export interface ResolvedContactResult {
  contact: ContactEntity | null;
  confidence: 'exact' | 'high' | 'ambiguous' | 'none';
  candidates?: ContactEntity[];
  disambiguationQuestion?: string;
}

/** Frequency alert for decreasing contact. */
export interface FrequencyAlert {
  contactId: string;
  displayName: string;
  relationshipType: RelationshipType;
  lastContactDate: string | null;
  gapDescription: string;
  trend: FrequencyTrend;
}
