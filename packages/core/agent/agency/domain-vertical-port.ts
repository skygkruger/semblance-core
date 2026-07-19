/**
 * Agency domain vertical port — core-side types for DR vertical workflows.
 * Implementations register via ipAdapters at runtime.
 */

export type AgencyDomain =
  | 'representative'
  | 'forms'
  | 'finance'
  | 'relationships'
  | 'defense'
  | 'health'
  | 'digest'
  | 'alter-ego';

export interface DomainVerticalInput {
  readonly vaultDocumentIds?: string[];
  readonly payload?: Record<string, unknown>;
}

export interface DomainVerticalInsight {
  readonly title: string;
  readonly summary: string;
  readonly provenanceSourceIds: string[];
}

export interface DomainVerticalActionRecord {
  readonly mode: 'executed' | 'simulated';
  readonly actionType: string;
  readonly auditRef: string;
  readonly estimatedTimeSavedSeconds: number;
  readonly simulationLabel?: string;
}

export interface DomainVerticalResult {
  readonly domain: AgencyDomain;
  readonly success: boolean;
  readonly gated: boolean;
  readonly insight: DomainVerticalInsight | null;
  readonly action: DomainVerticalActionRecord | null;
  readonly linkId: string | null;
  readonly error?: string;
  readonly completedAt: string;
}

export type DomainVerticalRunner = (
  domain: AgencyDomain,
  input: DomainVerticalInput,
) => Promise<DomainVerticalResult>;

export type DomainVerticalResultsLister = (limit?: number) => DomainVerticalResult[];
