// Digest Adapter Interfaces — Public contracts for IP-separated digest modules.
// Implementation lives in @semblance/dr (private). These interfaces stay public.
// CRITICAL: This file is in packages/core/. No implementation logic. Types only.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WeeklyDigestData {
  id: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  totalActions: number;
  actionsByType: Record<string, number>;
  totalTimeSavedSeconds: number;
  timeSavedByType: Record<string, number>;
  timeSavedFormatted: string;
  emailsProcessed: number;
  emailsArchived: number;
  emailsDrafted: number;
  emailsSent: number;
  conflictsDetected: number;
  conflictsResolved: number;
  meetingPrepsGenerated: number;
  subscriptionsAnalyzed: number;
  forgottenSubscriptions: number;
  potentialSavings: number;
  followUpReminders: number;
  deadlineAlerts: number;
  actionsAutoExecuted: number;
  actionsApproved: number;
  actionsRejected: number;
  autonomyAccuracy: number;
  alterEgoActionsExecuted: number;
  alterEgoActionsUndone: number;
  alterEgoActionsBatched: number;
  narrative: string;
  highlights: DigestHighlight[];
}

export interface DigestHighlight {
  type: 'subscription_savings' | 'time_saved_milestone' | 'autonomy_accuracy' | 'notable_action';
  title: string;
  description: string;
  impact: string;
}

export interface DigestSummary {
  id: string;
  weekStart: string;
  weekEnd: string;
  totalActions: number;
  timeSavedFormatted: string;
  generatedAt: string;
}

// ─── Adapter Interface ──────────────────────────────────────────────────────

export interface IWeeklyDigestGenerator {
  generate(weekStart: string, weekEnd: string): Promise<WeeklyDigestData>;
  getLatest(): WeeklyDigestData | null;
  list(): DigestSummary[];
}
