// Style Correction Processor — Detects, classifies, and applies user corrections to the style profile.
// When a user edits a draft, the correction is stored, classified, and periodically applied to the profile.
// CRITICAL: This file is in packages/core/. No network imports.

import type { LLMProvider } from '../llm/types.js';
import type { StyleProfileStore, StyleProfile, StyleCorrection } from './style-profile.js';
import { detectGreeting, detectSignoff } from './style-extractor.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CorrectionClassification {
  type: StyleCorrection['correctionType'];
  confidence: 'high' | 'low';
}

export interface CorrectionApplicationResult {
  applied: boolean;
  correctionsApplied: number;
  profileUpdated: boolean;
  changes: string[];
}

// ─── Correction Classifier ───────────────────────────────────────────────────

/**
 * Classify a correction by comparing original and corrected drafts.
 * Uses heuristic analysis first; falls back to LLM for ambiguous cases.
 */
export async function classifyCorrection(
  originalDraft: string,
  correctedDraft: string,
  llm?: LLMProvider,
  model?: string,
): Promise<CorrectionClassification> {
  // Try heuristic classification first
  const heuristic = classifyCorrectionHeuristic(originalDraft, correctedDraft);
  if (heuristic.confidence === 'high') {
    return heuristic;
  }

  // If heuristic is low-confidence and LLM is available, use LLM
  if (llm && model) {
    try {
      return await classifyCorrectionWithLLM(originalDraft, correctedDraft, llm, model);
    } catch {
      // LLM failed — return heuristic result
      return heuristic;
    }
  }

  return heuristic;
}

/**
 * Heuristic correction classification based on text comparison.
 */
export function classifyCorrectionHeuristic(
  originalDraft: string,
  correctedDraft: string,
): CorrectionClassification {
  const origLines = originalDraft.split('\n').filter(l => l.trim().length > 0);
  const corrLines = correctedDraft.split('\n').filter(l => l.trim().length > 0);

  if (origLines.length === 0 || corrLines.length === 0) {
    return { type: 'other', confidence: 'low' };
  }

  // Check greeting change
  const origGreeting = detectGreeting(originalDraft);
  const corrGreeting = detectGreeting(correctedDraft);
  const greetingChanged = origGreeting !== corrGreeting;

  // Check signoff change
  const origSignoff = detectSignoff(originalDraft);
  const corrSignoff = detectSignoff(correctedDraft);
  const signoffChanged = origSignoff !== corrSignoff;

  // Check if only greeting changed
  if (greetingChanged && !signoffChanged) {
    // Verify the body is mostly the same
    const origBody = stripGreetingAndSignoff(originalDraft);
    const corrBody = stripGreetingAndSignoff(correctedDraft);
    if (similarText(origBody, corrBody) > 0.8) {
      return { type: 'greeting', confidence: 'high' };
    }
  }

  // Check if only signoff changed
  if (signoffChanged && !greetingChanged) {
    const origBody = stripGreetingAndSignoff(originalDraft);
    const corrBody = stripGreetingAndSignoff(correctedDraft);
    if (similarText(origBody, corrBody) > 0.8) {
      return { type: 'signoff', confidence: 'high' };
    }
  }

  // Check vocabulary changes (contractions, emoji, exclamation)
  const vocabChange = detectVocabularyChange(originalDraft, correctedDraft);
  if (vocabChange) {
    return { type: 'vocabulary', confidence: 'high' };
  }

  // Check structure changes (paragraph breaks, list format)
  const structureChange = detectStructureChange(originalDraft, correctedDraft);
  if (structureChange) {
    return { type: 'structure', confidence: 'high' };
  }

  // If greeting and signoff both changed or body significantly different → tone
  if (greetingChanged && signoffChanged) {
    return { type: 'tone', confidence: 'low' };
  }

  // Default: could be tone or other
  return { type: 'other', confidence: 'low' };
}

/**
 * LLM-assisted correction classification for ambiguous cases.
 */
async function classifyCorrectionWithLLM(
  originalDraft: string,
  correctedDraft: string,
  llm: LLMProvider,
  model: string,
): Promise<CorrectionClassification> {
  const response = await llm.chat({
    model,
    messages: [
      {
        role: 'system',
        content: 'You classify email draft corrections. Respond ONLY with valid JSON.',
      },
      {
        role: 'user',
        content: `A user edited an AI-generated email draft. Classify the primary type of correction.

Original draft:
${originalDraft.substring(0, 1000)}

Corrected draft:
${correctedDraft.substring(0, 1000)}

Classify as one of: "greeting", "signoff", "tone", "vocabulary", "structure", "other"

Respond with JSON: {"type": string, "reason": string}`,
      },
    ],
    temperature: 0.3,
    format: 'json',
  });

  const parsed = JSON.parse(response.message.content.trim()) as { type?: string };
  const validTypes = ['greeting', 'signoff', 'tone', 'vocabulary', 'structure', 'other'];
  const type = validTypes.includes(parsed.type ?? '')
    ? parsed.type as StyleCorrection['correctionType']
    : 'other';

  return { type, confidence: 'high' };
}

// ─── Correction Application ──────────────────────────────────────────────────

/**
 * Apply accumulated corrections to the style profile.
 * Requires 3+ corrections of the same type before applying.
 */
export function applyCorrections(
  profileStore: StyleProfileStore,
  profileId: string,
): CorrectionApplicationResult {
  const result: CorrectionApplicationResult = {
    applied: false,
    correctionsApplied: 0,
    profileUpdated: false,
    changes: [],
  };

  const profile = profileStore.getProfileById(profileId);
  if (!profile) return result;

  const typeCounts = profileStore.countUnappliedCorrectionsByType(profileId);
  const updates: Partial<StyleProfile> = {};
  let hasUpdates = false;

  for (const [type, count] of Object.entries(typeCounts)) {
    if (count < 3) continue; // Need at least 3 corrections of the same type

    const corrections = profileStore.getCorrectionsByType(profileId, type)
      .filter(c => !c.applied);

    switch (type) {
      case 'greeting': {
        const greetingUpdate = applyGreetingCorrections(corrections, profile);
        if (greetingUpdate) {
          updates.greetings = greetingUpdate;
          hasUpdates = true;
          result.changes.push('Updated greeting patterns from corrections');
        }
        break;
      }
      case 'signoff': {
        const signoffUpdate = applySignoffCorrections(corrections, profile);
        if (signoffUpdate) {
          updates.signoffs = signoffUpdate;
          hasUpdates = true;
          result.changes.push('Updated sign-off patterns from corrections');
        }
        break;
      }
      case 'vocabulary': {
        const vocabUpdate = applyVocabularyCorrections(corrections, profile);
        if (vocabUpdate) {
          updates.vocabulary = vocabUpdate;
          hasUpdates = true;
          result.changes.push('Updated vocabulary patterns from corrections');
        }
        break;
      }
      case 'tone': {
        const toneUpdate = applyToneCorrections(corrections, profile);
        if (toneUpdate) {
          updates.tone = toneUpdate;
          hasUpdates = true;
          result.changes.push('Updated tone settings from corrections');
        }
        break;
      }
      case 'structure': {
        // Structure corrections are complex — just mark them applied without auto-updating
        break;
      }
    }

    // Mark corrections as applied
    for (const c of corrections) {
      profileStore.markCorrectionApplied(c.id);
      result.correctionsApplied++;
    }
  }

  if (hasUpdates) {
    profileStore.updateProfile(profileId, updates);
    result.profileUpdated = true;
  }

  result.applied = result.correctionsApplied > 0;
  return result;
}

// ─── Per-Type Correction Application ─────────────────────────────────────────

function applyGreetingCorrections(
  corrections: StyleCorrection[],
  profile: StyleProfile,
): StyleProfile['greetings'] | null {
  // Count which greetings the user prefers
  const preferredGreetings = new Map<string, number>();

  for (const c of corrections) {
    const correctedGreeting = detectGreeting(c.correctedDraft);
    if (correctedGreeting) {
      const word = correctedGreeting.split(/[\s,]/)[0].toLowerCase();
      const normalized = word.charAt(0).toUpperCase() + word.slice(1);
      preferredGreetings.set(normalized, (preferredGreetings.get(normalized) ?? 0) + 1);
    }
  }

  if (preferredGreetings.size === 0) return null;

  // Build new greeting patterns with boosted frequencies for corrected patterns
  const totalCorrections = Array.from(preferredGreetings.values()).reduce((a, b) => a + b, 0);
  const existingPatterns = new Map(profile.greetings.patterns.map(p => [p.text, p]));

  // Merge corrected preferences into existing patterns
  for (const [text, count] of preferredGreetings) {
    const existing = existingPatterns.get(text);
    if (existing) {
      // Boost existing pattern
      existingPatterns.set(text, {
        ...existing,
        frequency: Math.min(1, existing.frequency + (count / totalCorrections) * 0.3),
      });
    } else {
      // Add new pattern
      existingPatterns.set(text, {
        text,
        frequency: (count / totalCorrections) * 0.3,
        contexts: [],
      });
    }
  }

  // Normalize frequencies
  const patterns = Array.from(existingPatterns.values());
  const totalFreq = patterns.reduce((a, b) => a + b.frequency, 0);
  const normalized = patterns
    .map(p => ({ ...p, frequency: Math.round((p.frequency / totalFreq) * 100) / 100 }))
    .sort((a, b) => b.frequency - a.frequency);

  return {
    ...profile.greetings,
    patterns: normalized,
  };
}

function applySignoffCorrections(
  corrections: StyleCorrection[],
  profile: StyleProfile,
): StyleProfile['signoffs'] | null {
  const preferredSignoffs = new Map<string, number>();

  for (const c of corrections) {
    const correctedSignoff = detectSignoff(c.correctedDraft);
    if (correctedSignoff) {
      const words = correctedSignoff.split(/\s+/);
      const normalized = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      preferredSignoffs.set(normalized, (preferredSignoffs.get(normalized) ?? 0) + 1);
    }
  }

  if (preferredSignoffs.size === 0) return null;

  const totalCorrections = Array.from(preferredSignoffs.values()).reduce((a, b) => a + b, 0);
  const existingPatterns = new Map(profile.signoffs.patterns.map(p => [p.text, p]));

  for (const [text, count] of preferredSignoffs) {
    const existing = existingPatterns.get(text);
    if (existing) {
      existingPatterns.set(text, {
        ...existing,
        frequency: Math.min(1, existing.frequency + (count / totalCorrections) * 0.3),
      });
    } else {
      existingPatterns.set(text, {
        text,
        frequency: (count / totalCorrections) * 0.3,
        contexts: [],
      });
    }
  }

  const patterns = Array.from(existingPatterns.values());
  const totalFreq = patterns.reduce((a, b) => a + b.frequency, 0);
  const normalized = patterns
    .map(p => ({ ...p, frequency: Math.round((p.frequency / totalFreq) * 100) / 100 }))
    .sort((a, b) => b.frequency - a.frequency);

  return {
    ...profile.signoffs,
    patterns: normalized,
  };
}

function applyVocabularyCorrections(
  corrections: StyleCorrection[],
  profile: StyleProfile,
): StyleProfile['vocabulary'] | null {
  const CONTRACTIONS_REGEX = /\b(I'm|I've|I'll|I'd|don't|doesn't|didn't|can't|couldn't|wouldn't|shouldn't|won't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|we're|we've|we'll|we'd|they're|they've|they'll|they'd|you're|you've|you'll|you'd|that's|there's|here's|what's|who's|let's|it's)\b/gi;

  let contractionAdditions = 0;
  let contractionRemovals = 0;
  let exclamationAdditions = 0;
  let exclamationRemovals = 0;

  for (const c of corrections) {
    const origContractions = (c.originalDraft.match(CONTRACTIONS_REGEX) ?? []).length;
    const corrContractions = (c.correctedDraft.match(CONTRACTIONS_REGEX) ?? []).length;
    CONTRACTIONS_REGEX.lastIndex = 0;

    if (corrContractions > origContractions) contractionAdditions++;
    if (corrContractions < origContractions) contractionRemovals++;

    const origExcl = (c.originalDraft.match(/!/g) ?? []).length;
    const corrExcl = (c.correctedDraft.match(/!/g) ?? []).length;

    if (corrExcl > origExcl) exclamationAdditions++;
    if (corrExcl < origExcl) exclamationRemovals++;
  }

  const vocab = { ...profile.vocabulary };
  let changed = false;

  // Adjust contraction rate based on corrections
  if (contractionAdditions > contractionRemovals && contractionAdditions >= 2) {
    vocab.contractionRate = Math.min(1, vocab.contractionRate + 0.1);
    vocab.usesContractions = vocab.contractionRate > 0.3;
    changed = true;
  } else if (contractionRemovals > contractionAdditions && contractionRemovals >= 2) {
    vocab.contractionRate = Math.max(0, vocab.contractionRate - 0.1);
    vocab.usesContractions = vocab.contractionRate > 0.3;
    changed = true;
  }

  // Adjust exclamation rate based on corrections
  if (exclamationAdditions > exclamationRemovals && exclamationAdditions >= 2) {
    vocab.exclamationRate = Math.min(1, vocab.exclamationRate + 0.05);
    vocab.usesExclamation = vocab.exclamationRate > 0.05;
    changed = true;
  } else if (exclamationRemovals > exclamationAdditions && exclamationRemovals >= 2) {
    vocab.exclamationRate = Math.max(0, vocab.exclamationRate - 0.05);
    vocab.usesExclamation = vocab.exclamationRate > 0.05;
    changed = true;
  }

  return changed ? vocab : null;
}

function applyToneCorrections(
  corrections: StyleCorrection[],
  profile: StyleProfile,
): StyleProfile['tone'] | null {
  // Analyze tone drift in corrections
  // If user consistently makes drafts more/less formal, adjust
  let formalityDelta = 0;
  let warmthDelta = 0;

  for (const c of corrections) {
    const origLength = c.originalDraft.length;
    const corrLength = c.correctedDraft.length;

    // Longer corrections tend to be more formal
    if (corrLength > origLength * 1.3) formalityDelta += 5;
    if (corrLength < origLength * 0.7) formalityDelta -= 5;

    // Check for warmth indicators
    const warmthWords = /\b(great|wonderful|amazing|appreciate|thank|love|excited|happy)\b/gi;
    const origWarmth = (c.originalDraft.match(warmthWords) ?? []).length;
    const corrWarmth = (c.correctedDraft.match(warmthWords) ?? []).length;
    warmthWords.lastIndex = 0;

    if (corrWarmth > origWarmth) warmthDelta += 5;
    if (corrWarmth < origWarmth) warmthDelta -= 5;
  }

  // Only apply if there's a clear trend
  const avgFormalityDelta = formalityDelta / corrections.length;
  const avgWarmthDelta = warmthDelta / corrections.length;

  if (Math.abs(avgFormalityDelta) < 2 && Math.abs(avgWarmthDelta) < 2) return null;

  return {
    formalityScore: Math.max(0, Math.min(100, profile.tone.formalityScore + Math.round(avgFormalityDelta))),
    directnessScore: profile.tone.directnessScore,
    warmthScore: Math.max(0, Math.min(100, profile.tone.warmthScore + Math.round(avgWarmthDelta))),
  };
}

// ─── Text Comparison Helpers ─────────────────────────────────────────────────

/**
 * Strip greeting and signoff from text, returning the body.
 */
function stripGreetingAndSignoff(text: string): string {
  const lines = text.split('\n');
  const nonEmpty = lines.filter(l => l.trim().length > 0);

  if (nonEmpty.length <= 2) return text;

  // Remove first line if it's a greeting
  const greeting = detectGreeting(text);
  let startIdx = 0;
  if (greeting) {
    startIdx = 1;
  }

  // Remove last few lines if they contain a signoff
  const signoff = detectSignoff(text);
  let endIdx = nonEmpty.length;
  if (signoff) {
    // Find the signoff line and trim from there
    for (let i = nonEmpty.length - 1; i >= Math.max(0, nonEmpty.length - 4); i--) {
      if (nonEmpty[i].trim().toLowerCase().startsWith(signoff.toLowerCase())) {
        endIdx = i;
        break;
      }
    }
  }

  return nonEmpty.slice(startIdx, endIdx).join('\n').trim();
}

/**
 * Simple text similarity (Jaccard similarity on words).
 */
function similarText(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 0));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 0));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Detect vocabulary-level changes (contractions, emoji, exclamation).
 */
function detectVocabularyChange(original: string, corrected: string): boolean {
  const CONTRACTIONS_REGEX = /\b(I'm|I've|I'll|I'd|don't|doesn't|didn't|can't|couldn't|wouldn't|shouldn't|won't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|we're|we've|we'll|we'd|they're|they've|they'll|they'd|you're|you've|you'll|you'd|that's|there's|here's|what's|who's|let's|it's)\b/gi;

  const origContractions = (original.match(CONTRACTIONS_REGEX) ?? []).length;
  const corrContractions = (corrected.match(CONTRACTIONS_REGEX) ?? []).length;
  CONTRACTIONS_REGEX.lastIndex = 0;

  // Significant contraction change
  if (Math.abs(origContractions - corrContractions) >= 2) return true;

  // Exclamation mark change
  const origExcl = (original.match(/!/g) ?? []).length;
  const corrExcl = (corrected.match(/!/g) ?? []).length;
  if (Math.abs(origExcl - corrExcl) >= 2) return true;

  // Emoji change
  const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/gu;
  const origEmoji = (original.match(EMOJI_REGEX) ?? []).length;
  const corrEmoji = (corrected.match(EMOJI_REGEX) ?? []).length;
  EMOJI_REGEX.lastIndex = 0;
  if (origEmoji !== corrEmoji) return true;

  return false;
}

/**
 * Detect structure changes (paragraph count, list usage).
 */
function detectStructureChange(original: string, corrected: string): boolean {
  const origParas = original.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
  const corrParas = corrected.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

  // Significant paragraph count change
  if (Math.abs(origParas - corrParas) >= 2) return true;

  // List added or removed
  const listPattern = /^\s*[-*\u2022]\s/m;
  const origHasList = listPattern.test(original);
  const corrHasList = listPattern.test(corrected);
  if (origHasList !== corrHasList) return true;

  return false;
}
