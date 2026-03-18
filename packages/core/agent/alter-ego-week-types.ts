// Alter Ego Week Types — Public contracts for IP-separated Alter Ego Week engine.
// Implementation lives in @semblance/dr (private). These types stay public.
// CRITICAL: This file is in packages/core/. No implementation logic. Types only.

// ─── Types ──────────────────────────────────────────────────────────────────

export type AlterEgoDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AlterEgoWeekState {
  active: boolean;
  currentDay: AlterEgoDay | null;
  completedDays: AlterEgoDay[];
  startedAt: string | null;
  completedAt: string | null;
  activationOffered: boolean;
  userActivated: boolean;
}

export interface DayDemoResult {
  day: AlterEgoDay;
  title: string;
  summary: string;
  actionsTaken: string[];
  shareableCardData: Record<string, unknown>;
}

// ─── Adapter Interface ──────────────────────────────────────────────────────

export interface IAlterEgoWeekEngine {
  start(): Promise<AlterEgoWeekState>;
  runDayDemo(day: AlterEgoDay): Promise<DayDemoResult>;
  advanceDay(): Promise<AlterEgoWeekState>;
  skip(): void;
  acceptActivation(): Promise<void>;
  getState(): AlterEgoWeekState;
  reset(): void;
}
