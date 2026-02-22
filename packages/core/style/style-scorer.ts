// Style Scorer — Heuristic quality validator for generated email drafts.
// Compares a draft against the StyleProfile to produce a match score (0-100).
// MUST be fast (< 50ms) — pure heuristic analysis, no LLM calls.
// CRITICAL: This file is in packages/core/. No network imports.

import type { StyleProfile } from './style-profile.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StyleScore {
  overall: number;           // 0-100 composite score
  breakdown: {
    greeting: number;        // 0-100
    signoff: number;         // 0-100
    sentenceLength: number;  // 0-100
    formality: number;       // 0-100
    vocabulary: number;      // 0-100
  };
}

// ─── Scoring Weights ──────────────────────────────────────────────────────────

const WEIGHTS = {
  greeting: 0.25,
  signoff: 0.25,
  sentenceLength: 0.15,
  formality: 0.20,
  vocabulary: 0.15,
};

// ─── Contraction Patterns ─────────────────────────────────────────────────────

const CONTRACTIONS_REGEX = /\b(I'm|I've|I'll|I'd|don't|doesn't|didn't|can't|couldn't|wouldn't|shouldn't|won't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|we're|we've|we'll|we'd|they're|they've|they'll|they'd|you're|you've|you'll|you'd|that's|there's|here's|what's|who's|let's|it's)\b/gi;

const EXPANDED_REGEX = /\b(I am|I have|I will|I would|do not|does not|did not|can not|cannot|could not|would not|should not|will not|is not|are not|was not|were not|has not|have not|had not|we are|we have|we will|we would|they are|they have|they will|they would|you are|you have|you will|you would|that is|there is|here is|what is|who is|let us|it is)\b/gi;

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;

// ─── Main Scorer ──────────────────────────────────────────────────────────────

/**
 * Score a generated draft against a StyleProfile.
 * Returns a StyleScore with overall (0-100) and per-dimension breakdown.
 * Pure heuristic — no LLM calls, targets < 50ms execution.
 */
export function scoreDraft(draft: string, profile: StyleProfile): StyleScore {
  const breakdown = {
    greeting: scoreGreeting(draft, profile),
    signoff: scoreSignoff(draft, profile),
    sentenceLength: scoreSentenceLength(draft, profile),
    formality: scoreFormality(draft, profile),
    vocabulary: scoreVocabulary(draft, profile),
  };

  const overall = Math.round(
    breakdown.greeting * WEIGHTS.greeting +
    breakdown.signoff * WEIGHTS.signoff +
    breakdown.sentenceLength * WEIGHTS.sentenceLength +
    breakdown.formality * WEIGHTS.formality +
    breakdown.vocabulary * WEIGHTS.vocabulary
  );

  return { overall, breakdown };
}

// ─── Dimension Scorers ────────────────────────────────────────────────────────

/**
 * Score greeting match. Exact match = 100, partial = 60, no match = 20.
 */
function scoreGreeting(draft: string, profile: StyleProfile): number {
  if (profile.greetings.patterns.length === 0) return 80; // No pattern to match against

  const lines = draft.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return 20;

  const firstLine = lines[0]!.trim().toLowerCase();
  const profileGreetings = profile.greetings.patterns.map(p => p.text.toLowerCase());

  // Exact match (greeting word appears at start of first line)
  for (const greeting of profileGreetings) {
    if (firstLine.startsWith(greeting.toLowerCase())) return 100;
  }

  // Partial match — right format (a greeting word), wrong specific word
  const commonGreetings = ['hi', 'hey', 'hello', 'dear', 'good morning', 'good afternoon'];
  for (const g of commonGreetings) {
    if (firstLine.startsWith(g)) return 60;
  }

  return 20;
}

/**
 * Score sign-off match. Exact match = 100, partial = 60, no match = 20.
 */
function scoreSignoff(draft: string, profile: StyleProfile): number {
  if (profile.signoffs.patterns.length === 0) return 80;

  const lines = draft.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return 20;

  const lastLines = lines.slice(-4);
  const profileSignoffs = profile.signoffs.patterns.map(p => p.text.toLowerCase());

  for (const line of lastLines) {
    const lower = line.toLowerCase().replace(/,\s*$/, '');
    // Exact match
    for (const signoff of profileSignoffs) {
      if (lower === signoff || lower.startsWith(signoff)) return 100;
    }
  }

  // Partial match — any standard sign-off
  const commonSignoffs = ['best', 'thanks', 'thank you', 'cheers', 'regards', 'sincerely', 'best regards', 'kind regards', 'warm regards', 'take care'];
  for (const line of lastLines) {
    const lower = line.toLowerCase().replace(/,\s*$/, '');
    for (const s of commonSignoffs) {
      if (lower === s || lower.startsWith(s)) return 60;
    }
  }

  return 20;
}

/**
 * Score sentence length match. Within ±20% = 100, ±40% = 70, beyond = 40.
 */
function scoreSentenceLength(draft: string, profile: StyleProfile): number {
  if (profile.structure.avgSentenceLength === 0) return 80;

  const sentences = draft
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.split(/\s+/).length >= 2);

  if (sentences.length === 0) return 40;

  const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
  const avgLength = totalWords / sentences.length;
  const target = profile.structure.avgSentenceLength;
  const deviation = Math.abs(avgLength - target) / target;

  if (deviation <= 0.2) return 100;
  if (deviation <= 0.4) return 70;
  return 40;
}

/**
 * Score formality match using proxies: contraction rate, exclamation rate, vocabulary.
 */
function scoreFormality(draft: string, profile: StyleProfile): number {
  // Compute draft's contraction rate
  const draftContractions = (draft.match(CONTRACTIONS_REGEX) ?? []).length;
  const draftExpanded = (draft.match(EXPANDED_REGEX) ?? []).length;
  const draftTotal = draftContractions + draftExpanded;
  const draftContractionRate = draftTotal > 0 ? draftContractions / draftTotal : 0.5;

  // Compute draft's exclamation rate
  const draftSentences = draft.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  const draftExclamations = draftSentences.filter(s => s.trim().endsWith('!')).length;
  const draftExclamationRate = draftSentences.length > 0 ? draftExclamations / draftSentences.length : 0;

  // Compare contraction rate
  const contractionDiff = Math.abs(draftContractionRate - profile.vocabulary.contractionRate);
  const contractionScore = contractionDiff < 0.2 ? 100 : contractionDiff < 0.4 ? 70 : 40;

  // Compare exclamation rate
  const exclamationDiff = Math.abs(draftExclamationRate - profile.vocabulary.exclamationRate);
  const exclamationScore = exclamationDiff < 0.15 ? 100 : exclamationDiff < 0.3 ? 70 : 40;

  return Math.round((contractionScore + exclamationScore) / 2);
}

/**
 * Score vocabulary match: contraction usage, emoji presence, exclamation rate.
 */
function scoreVocabulary(draft: string, profile: StyleProfile): number {
  let score = 0;
  let checks = 0;

  // Contraction usage match
  const hasContractions = CONTRACTIONS_REGEX.test(draft);
  // Reset regex lastIndex after test()
  CONTRACTIONS_REGEX.lastIndex = 0;
  if (profile.vocabulary.usesContractions === hasContractions) {
    score += 100;
  } else {
    score += 40;
  }
  checks++;

  // Emoji match
  const hasEmoji = EMOJI_REGEX.test(draft);
  EMOJI_REGEX.lastIndex = 0;
  if (profile.vocabulary.usesEmoji === hasEmoji) {
    score += 100;
  } else {
    score += 40;
  }
  checks++;

  // Exclamation presence match
  const hasExclamation = draft.includes('!');
  if (profile.vocabulary.usesExclamation === hasExclamation) {
    score += 100;
  } else {
    score += 50;
  }
  checks++;

  return checks > 0 ? Math.round(score / checks) : 80;
}
