// Intent Layer Types — Core Values, Hard Limits, and Drift Detection.
//
// CRITICAL: This file is in packages/core/. No network imports.
// All intent data is stored locally in SQLite.

export interface HardLimit {
  id: string;
  rawText: string;       // exact user input, preserved forever
  parsedRule: ParsedRule;
  active: boolean;
  source: 'onboarding' | 'settings' | 'chat';
  createdAt: string;
  updatedAt: string;
}

export interface ParsedRule {
  action: 'never' | 'always_ask' | 'always';
  scope: string;        // 'email.send', 'finance.*', 'any'
  target?: string;      // "my ex", "crypto", etc.
  category?: 'person' | 'topic' | 'action' | 'data';
  confidence: number;   // 0-1 from LLM. 0 = unparsed (LLM unavailable)
}

export interface PersonalValue {
  id: string;
  rawText: string;
  theme: string;        // LLM-extracted: "family", "health", "privacy"
  source: 'onboarding' | 'settings' | 'chat';
  createdAt: string;
  active: boolean;
}

export interface UserIntent {
  primaryGoal: string | null;
  primaryGoalSetAt: string | null;
  hardLimits: HardLimit[];
  personalValues: PersonalValue[];
  updatedAt: string;
}

export interface IntentObservation {
  id: string;
  observedAt: string;
  type: 'drift' | 'alignment' | 'conflict';
  description: string;
  evidence: string[];
  surfacedMorningBrief: boolean;
  surfacedInChat: boolean;
  dismissed: boolean;
  dismissedAt?: string;
  userResponse?: string;
}

export interface IntentCheckResult {
  allowed: boolean;
  hardLimitTriggered?: HardLimit;
  matchedLimits: HardLimit[];
  alignmentScore: number;   // 0-1
  reasoning: string;
}
