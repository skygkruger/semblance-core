export interface TodayDocumentChange {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly sourcePath: string | null;
  readonly updatedAt: string;
  readonly changeType: 'indexed' | 'updated';
}

export interface TodayRisk {
  readonly id: string;
  readonly kind: 'pending_approval' | 'proposed_action' | 'proactive_insight' | 'failed_action';
  readonly title: string;
  readonly description: string;
  readonly domain: string;
  readonly severity: 'high' | 'medium' | 'low';
  readonly source: string;
  readonly createdAt: string;
}

export interface TodayCompletedAction {
  readonly id: string;
  readonly actionType: string;
  readonly description: string;
  readonly completedAt: string;
  readonly estimatedTimeSavedSeconds: number;
  readonly auditRef: string | null;
  readonly source: string;
}

export interface TodayPendingDecision {
  readonly id: string;
  readonly kind: 'approval' | 'intent_observation' | 'workflow';
  readonly title: string;
  readonly description: string;
  readonly domain: string;
  readonly createdAt: string;
  readonly source: string;
}

export interface TodayMeasuredOutcome {
  readonly id: string;
  readonly title: string;
  readonly measuredAt: string;
  readonly timeSavedSeconds: number;
  readonly source: string;
  readonly auditRef: string | null;
}

export interface TodayProvenanceSummary {
  readonly documentCountBySource: Record<string, number>;
  readonly totalDocuments: number;
  readonly lastIndexedAt: string | null;
  readonly auditChainValid: boolean | null;
  readonly connectedSources: string[];
}

export interface TodayInboxTriageItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: 'high' | 'medium' | 'low';
  readonly source: string;
  readonly createdAt: string;
}

export interface TodayInboxReplyItem {
  readonly id: string;
  readonly subject: string;
  readonly from: string;
  readonly snippet: string;
  readonly receivedAt: string;
  readonly priority: 'high' | 'normal' | 'low';
}

export interface TodayRepresentativeActionItem {
  readonly id: string;
  readonly subject: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly source: string;
}

export interface TodayInboxStrip {
  readonly triage: TodayInboxTriageItem[];
  readonly pendingReplies: TodayInboxReplyItem[];
  readonly representativeActions: TodayRepresentativeActionItem[];
}

export interface TodaySnapshot {
  readonly assembledAt: string;
  readonly date: string;
  readonly changes: TodayDocumentChange[];
  readonly risks: TodayRisk[];
  readonly completedActions: TodayCompletedAction[];
  readonly pendingDecisions: TodayPendingDecision[];
  readonly outcomes: TodayMeasuredOutcome[];
  readonly provenance: TodayProvenanceSummary;
  readonly inbox: TodayInboxStrip;
  readonly isEmpty: boolean;
}
