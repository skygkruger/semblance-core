// Style Extractor — Analyzes sent emails to build a StyleProfile.
// Combines heuristic text analysis with LLM-assisted scoring.
// CRITICAL: This file is in packages/core/. No network imports.
// All LLM calls go through InferenceRouter (local inference only).

import type { LLMProvider } from '../llm/types.js';
import { createEmptyProfile, type StyleProfile } from './style-profile.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SentEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  date: string;
}

// ─── Heuristic Extraction Helpers ─────────────────────────────────────────────

/** Common greeting patterns (case-insensitive) */
const GREETING_PATTERNS = [
  /^(hi|hey|hello|dear|good\s+morning|good\s+afternoon|good\s+evening|greetings|yo)\b/i,
];

/** Forwarded/replied content markers */
const FORWARDED_MARKERS = [
  /^-+\s*Forwarded\s+message\s*-+/m,
  /^>\s/m,
  /^On\s.+wrote:$/m,
  /^From:\s/m,
];

/** Emoji regex — matches common Unicode emoji */
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{1F018}-\u{1F270}]/gu;

/** Common contractions */
const CONTRACTIONS = [
  /\bI'm\b/g, /\bI've\b/g, /\bI'll\b/g, /\bI'd\b/g,
  /\bdon't\b/gi, /\bdoesn't\b/gi, /\bdidn't\b/gi,
  /\bcan't\b/gi, /\bcouldn't\b/gi, /\bwouldn't\b/gi, /\bshouldn't\b/gi,
  /\bwon't\b/gi, /\bisn't\b/gi, /\baren't\b/gi, /\bwasn't\b/gi,
  /\bweren't\b/gi, /\bhasn't\b/gi, /\bhaven't\b/gi, /\bhadn't\b/gi,
  /\bwe're\b/gi, /\bwe've\b/gi, /\bwe'll\b/gi, /\bwe'd\b/gi,
  /\bthey're\b/gi, /\bthey've\b/gi, /\bthey'll\b/gi, /\bthey'd\b/gi,
  /\byou're\b/gi, /\byou've\b/gi, /\byou'll\b/gi, /\byou'd\b/gi,
  /\bthat's\b/gi, /\bthere's\b/gi, /\bhere's\b/gi, /\bwhat's\b/gi,
  /\bwho's\b/gi, /\blet's\b/gi, /\bit's\b/gi,
];

/** Expanded forms of contractions */
const EXPANDED_FORMS = [
  /\bI am\b/g, /\bI have\b/g, /\bI will\b/g, /\bI would\b/g,
  /\bdo not\b/gi, /\bdoes not\b/gi, /\bdid not\b/gi,
  /\bcan not\b/gi, /\bcannot\b/gi, /\bcould not\b/gi, /\bwould not\b/gi, /\bshould not\b/gi,
  /\bwill not\b/gi, /\bis not\b/gi, /\bare not\b/gi, /\bwas not\b/gi,
  /\bwere not\b/gi, /\bhas not\b/gi, /\bhave not\b/gi, /\bhad not\b/gi,
  /\bwe are\b/gi, /\bwe have\b/gi, /\bwe will\b/gi, /\bwe would\b/gi,
  /\bthey are\b/gi, /\bthey have\b/gi, /\bthey will\b/gi, /\bthey would\b/gi,
  /\byou are\b/gi, /\byou have\b/gi, /\byou will\b/gi, /\byou would\b/gi,
  /\bthat is\b/gi, /\bthere is\b/gi, /\bhere is\b/gi, /\bwhat is\b/gi,
  /\bwho is\b/gi, /\blet us\b/gi, /\bit is\b/gi,
];

/**
 * Extract only the user's own text from an email body,
 * stripping forwarded content and reply chains.
 */
export function extractUserText(body: string): string {
  let text = body;

  // Strip forwarded message blocks
  const fwdMatch = text.match(/^-+\s*Forwarded\s+message\s*-+/m);
  if (fwdMatch && fwdMatch.index !== undefined) {
    text = text.substring(0, fwdMatch.index);
  }

  // Strip reply chains: find "On ... wrote:" pattern and take text before it
  const replyMatch = text.match(/^On\s.+wrote:\s*$/m);
  if (replyMatch && replyMatch.index !== undefined) {
    text = text.substring(0, replyMatch.index);
  }

  // Strip quoted lines (lines starting with >)
  text = text.split('\n').filter(line => !line.startsWith('>')).join('\n');

  return text.trim();
}

/**
 * Detect greeting from the first line(s) of an email.
 */
export function detectGreeting(text: string): string | null {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return null;

  const firstLine = lines[0]!.trim();

  // Check against known greeting patterns
  for (const pattern of GREETING_PATTERNS) {
    const match = firstLine.match(pattern);
    if (match) {
      // Return the full greeting line (e.g., "Hi Sarah,")
      // But cap at reasonable length to avoid capturing the whole email
      const greeting = firstLine.length <= 60 ? firstLine : firstLine.substring(0, 60);
      // Remove trailing comma for the pattern text
      return greeting.replace(/,\s*$/, '').trim();
    }
  }

  return null;
}

/**
 * Detect sign-off from the last lines of an email.
 */
export function detectSignoff(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return null;

  // Common sign-off patterns
  const signoffPatterns = [
    /^(best|best regards|regards|thanks|thank you|cheers|sincerely|kind regards|warm regards|take care|all the best|many thanks|respectfully|yours truly|cordially|talk soon|later)\b/i,
  ];

  // Check last 3 lines (sign-off might be followed by name)
  const lastLines = lines.slice(-4);
  for (const line of lastLines) {
    for (const pattern of signoffPatterns) {
      if (pattern.test(line)) {
        return line.replace(/,\s*$/, '').trim();
      }
    }
  }

  return null;
}

/**
 * Split text into sentences (simple heuristic: split on .!? followed by space or end).
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.split(/\s+/).length >= 2);
}

/**
 * Count words in text.
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Count contraction occurrences in text.
 */
function countContractions(text: string): number {
  let count = 0;
  for (const pattern of CONTRACTIONS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Count expanded form occurrences in text.
 */
function countExpandedForms(text: string): number {
  let count = 0;
  for (const pattern of EXPANDED_FORMS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Detect if text uses lists/bullets.
 */
function detectLists(text: string): boolean {
  const listPattern = /^(\s*[-*\u2022]\s|\s*\d+[.)]\s)/m;
  return listPattern.test(text);
}

// ─── Main Extraction ──────────────────────────────────────────────────────────

/**
 * Extract a StyleProfile from a set of sent emails using heuristic analysis.
 * LLM-assisted features (formality, directness, warmth, common phrases, context)
 * use the provided LLMProvider.
 */
export async function extractStyleFromEmails(
  emails: SentEmail[],
  llm: LLMProvider,
  model: string = '',
): Promise<StyleProfile> {
  const profile = createEmptyProfile();
  profile.emailsAnalyzed = emails.length;
  profile.isActive = emails.length >= 20;
  profile.lastUpdatedAt = new Date().toISOString();

  if (emails.length === 0) return profile;

  // ─── Heuristic Extraction ─────────────────────────────────────────────

  const greetingCounts = new Map<string, number>();
  const signoffCounts = new Map<string, number>();
  let totalSentenceLength = 0;
  let sentenceCount = 0;
  let totalParagraphSentenceCount = 0;
  let paragraphCount = 0;
  let totalEmailWords = 0;
  let listEmails = 0;
  let totalContractions = 0;
  let totalExpandedForms = 0;
  let totalEmojiCount = 0;
  let exclamationEndings = 0;
  let totalSentenceEndings = 0;
  let recipientNameUsed = 0;
  let recipientNameChecked = 0;

  for (const email of emails) {
    const userText = extractUserText(email.body);
    if (userText.length === 0) continue;

    // Greeting detection
    const greeting = detectGreeting(userText);
    if (greeting) {
      // Normalize: extract just the greeting word
      const greetingWord = greeting.split(/[\s,]/)[0]!.toLowerCase();
      const normalized = greetingWord.charAt(0).toUpperCase() + greetingWord.slice(1);
      greetingCounts.set(normalized, (greetingCounts.get(normalized) ?? 0) + 1);

      // Check if recipient name is used
      recipientNameChecked++;
      const toName = email.to[0]?.split('@')[0] ?? '';
      if (toName && greeting.toLowerCase().includes(toName.toLowerCase().split('.')[0] ?? '')) {
        recipientNameUsed++;
      }
    }

    // Sign-off detection
    const signoff = detectSignoff(userText);
    if (signoff) {
      // Normalize to canonical form
      const words = signoff.split(/\s+/);
      const normalized = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      signoffCounts.set(normalized, (signoffCounts.get(normalized) ?? 0) + 1);
    }

    // Sentence and structure analysis
    const sentences = splitSentences(userText);
    for (const s of sentences) {
      const words = countWords(s);
      totalSentenceLength += words;
      sentenceCount++;

      if (s.endsWith('!')) exclamationEndings++;
      if (/[.!?]$/.test(s)) totalSentenceEndings++;
    }

    // Paragraph analysis
    const paragraphs = userText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    for (const p of paragraphs) {
      const pSentences = splitSentences(p);
      totalParagraphSentenceCount += pSentences.length;
      paragraphCount++;
    }

    // Word count
    totalEmailWords += countWords(userText);

    // List detection
    if (detectLists(userText)) {
      listEmails++;
    }

    // Contraction analysis
    totalContractions += countContractions(userText);
    totalExpandedForms += countExpandedForms(userText);

    // Emoji detection
    const emojiMatches = userText.match(EMOJI_REGEX);
    if (emojiMatches) {
      totalEmojiCount += emojiMatches.length;
    }
  }

  const validEmails = emails.filter(e => extractUserText(e.body).length > 0).length;

  // Build greeting patterns
  const totalGreetings = Array.from(greetingCounts.values()).reduce((a, b) => a + b, 0);
  profile.greetings.patterns = Array.from(greetingCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([text, count]) => ({
      text,
      frequency: totalGreetings > 0 ? count / totalGreetings : 0,
      contexts: [],
    }));
  profile.greetings.usesRecipientName = recipientNameChecked > 0
    ? recipientNameUsed / recipientNameChecked > 0.5
    : false;
  profile.greetings.usesNameVariant = profile.greetings.usesRecipientName ? 'first' : 'none';

  // Build sign-off patterns
  const totalSignoffs = Array.from(signoffCounts.values()).reduce((a, b) => a + b, 0);
  profile.signoffs.patterns = Array.from(signoffCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([text, count]) => ({
      text,
      frequency: totalSignoffs > 0 ? count / totalSignoffs : 0,
      contexts: [],
    }));
  profile.signoffs.includesName = false; // Will be refined by LLM

  // Structure
  profile.structure.avgSentenceLength = sentenceCount > 0
    ? Math.round((totalSentenceLength / sentenceCount) * 10) / 10
    : 0;
  profile.structure.avgParagraphLength = paragraphCount > 0
    ? Math.round((totalParagraphSentenceCount / paragraphCount) * 10) / 10
    : 0;
  profile.structure.avgEmailLength = validEmails > 0
    ? Math.round(totalEmailWords / validEmails)
    : 0;
  profile.structure.usesListsOrBullets = listEmails > 0;
  profile.structure.listFrequency = validEmails > 0
    ? Math.round((listEmails / validEmails) * 100) / 100
    : 0;

  // Vocabulary — contractions
  const totalContractionForms = totalContractions + totalExpandedForms;
  profile.vocabulary.contractionRate = totalContractionForms > 0
    ? Math.round((totalContractions / totalContractionForms) * 100) / 100
    : 0;
  profile.vocabulary.usesContractions = profile.vocabulary.contractionRate > 0.3;

  // Vocabulary — emoji
  profile.vocabulary.emojiFrequency = validEmails > 0
    ? Math.round((totalEmojiCount / validEmails) * 100) / 100
    : 0;
  profile.vocabulary.usesEmoji = totalEmojiCount > 0;

  // Vocabulary — exclamation
  profile.vocabulary.exclamationRate = totalSentenceEndings > 0
    ? Math.round((exclamationEndings / totalSentenceEndings) * 100) / 100
    : 0;
  profile.vocabulary.usesExclamation = profile.vocabulary.exclamationRate > 0.05;

  // ─── LLM-Assisted Extraction ──────────────────────────────────────────

  if (emails.length >= 3) {
    // Sample up to 10 emails for LLM analysis
    const sampleSize = Math.min(10, emails.length);
    const sampleEmails = emails.slice(0, sampleSize);
    const sampleBodies = sampleEmails.map((e, i) =>
      `--- Email ${i + 1} (to: ${e.to.join(', ')}) ---\n${extractUserText(e.body).substring(0, 500)}`
    ).join('\n\n');

    try {
      const toneResponse = await llm.chat({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are analyzing a user\'s email writing style. Respond ONLY with valid JSON.',
          },
          {
            role: 'user',
            content: `Analyze these sent emails and rate the writing style on three dimensions, each 0-100:
- formality: 0 = very casual (slang, fragments), 100 = very formal (full sentences, titles)
- directness: 0 = very hedging ("maybe we could"), 100 = very direct ("do this")
- warmth: 0 = cold/transactional, 100 = warm/personal

Also identify up to 10 recurring phrases the author uses frequently.

Emails:
${sampleBodies}

Respond with JSON: {"formality": number, "directness": number, "warmth": number, "commonPhrases": string[]}`,
          },
        ],
        temperature: 0.3,
        format: 'json',
      });

      const toneText = toneResponse.message.content.trim();
      const parsed = JSON.parse(toneText) as {
        formality?: number;
        directness?: number;
        warmth?: number;
        commonPhrases?: string[];
      };

      if (typeof parsed.formality === 'number') {
        profile.tone.formalityScore = Math.max(0, Math.min(100, Math.round(parsed.formality)));
      }
      if (typeof parsed.directness === 'number') {
        profile.tone.directnessScore = Math.max(0, Math.min(100, Math.round(parsed.directness)));
      }
      if (typeof parsed.warmth === 'number') {
        profile.tone.warmthScore = Math.max(0, Math.min(100, Math.round(parsed.warmth)));
      }
      if (Array.isArray(parsed.commonPhrases)) {
        profile.vocabulary.commonPhrases = parsed.commonPhrases
          .filter((p): p is string => typeof p === 'string')
          .slice(0, 10);
      }
    } catch {
      // LLM analysis failed — keep heuristic defaults
    }

    // Context classification
    try {
      const contextResponse = await llm.chat({
        model,
        messages: [
          {
            role: 'system',
            content: 'You classify email recipients. Respond ONLY with valid JSON.',
          },
          {
            role: 'user',
            content: `For each email, classify the recipient relationship as one of: colleague, client, friend, manager, report, unknown.

Emails:
${sampleEmails.map((e, i) => `${i + 1}. To: ${e.to.join(', ')}, Subject: ${e.subject}`).join('\n')}

Respond with JSON: {"classifications": [{"index": number, "context": string}]}`,
          },
        ],
        temperature: 0.3,
        format: 'json',
      });

      const ctxText = contextResponse.message.content.trim();
      const ctxParsed = JSON.parse(ctxText) as {
        classifications?: Array<{ index: number; context: string }>;
      };

      if (Array.isArray(ctxParsed.classifications)) {
        // Assign contexts to greetings and signoffs
        const contextCounts = new Map<string, number>();
        for (const c of ctxParsed.classifications) {
          if (typeof c.context === 'string') {
            contextCounts.set(c.context, (contextCounts.get(c.context) ?? 0) + 1);
          }
        }

        // Build context variations (simplified: note per context)
        profile.contextVariations = Array.from(contextCounts.entries())
          .filter(([ctx]) => ctx !== 'unknown')
          .map(([context]) => ({
            context,
            formalityDelta: 0,
            toneNotes: '',
          }));
      }
    } catch {
      // Context classification failed — keep empty
    }
  }

  return profile;
}

/**
 * Incrementally update an existing profile with newly sent emails.
 * Uses weighted merge: new data gets proportional weight based on count.
 */
export async function updateProfileWithNewEmails(
  existingProfile: StyleProfile,
  newEmails: SentEmail[],
  llm: LLMProvider,
  model: string = '',
): Promise<StyleProfile> {
  if (newEmails.length === 0) return existingProfile;

  // Extract profile from new emails
  const newProfile = await extractStyleFromEmails(newEmails, llm, model);

  const existingCount = existingProfile.emailsAnalyzed;
  const newCount = newEmails.length;
  const totalCount = existingCount + newCount;
  const existingWeight = existingCount / totalCount;
  const newWeight = newCount / totalCount;

  const merged: StyleProfile = {
    ...existingProfile,
    emailsAnalyzed: totalCount,
    isActive: totalCount >= 20,
    lastUpdatedAt: new Date().toISOString(),
  };

  // Merge greeting patterns
  merged.greetings = mergePatternLists(
    existingProfile.greetings.patterns,
    newProfile.greetings.patterns,
    existingWeight,
    newWeight,
  );
  merged.greetings.usesRecipientName = existingWeight > 0.5
    ? existingProfile.greetings.usesRecipientName
    : newProfile.greetings.usesRecipientName;
  merged.greetings.usesNameVariant = existingWeight > 0.5
    ? existingProfile.greetings.usesNameVariant
    : newProfile.greetings.usesNameVariant;

  // Merge sign-off patterns
  const mergedSignoffs = mergePatternLists(
    existingProfile.signoffs.patterns,
    newProfile.signoffs.patterns,
    existingWeight,
    newWeight,
  );
  merged.signoffs = {
    patterns: mergedSignoffs.patterns,
    includesName: existingProfile.signoffs.includesName,
  };

  // Merge tone (weighted average)
  merged.tone = {
    formalityScore: Math.round(
      existingProfile.tone.formalityScore * existingWeight +
      newProfile.tone.formalityScore * newWeight
    ),
    directnessScore: Math.round(
      existingProfile.tone.directnessScore * existingWeight +
      newProfile.tone.directnessScore * newWeight
    ),
    warmthScore: Math.round(
      existingProfile.tone.warmthScore * existingWeight +
      newProfile.tone.warmthScore * newWeight
    ),
  };

  // Merge structure (weighted average)
  merged.structure = {
    avgSentenceLength: Math.round(
      (existingProfile.structure.avgSentenceLength * existingWeight +
       newProfile.structure.avgSentenceLength * newWeight) * 10
    ) / 10,
    avgParagraphLength: Math.round(
      (existingProfile.structure.avgParagraphLength * existingWeight +
       newProfile.structure.avgParagraphLength * newWeight) * 10
    ) / 10,
    avgEmailLength: Math.round(
      existingProfile.structure.avgEmailLength * existingWeight +
      newProfile.structure.avgEmailLength * newWeight
    ),
    usesListsOrBullets: existingProfile.structure.usesListsOrBullets || newProfile.structure.usesListsOrBullets,
    listFrequency: Math.round(
      (existingProfile.structure.listFrequency * existingWeight +
       newProfile.structure.listFrequency * newWeight) * 100
    ) / 100,
  };

  // Merge vocabulary
  merged.vocabulary = {
    commonPhrases: deduplicateStrings([
      ...existingProfile.vocabulary.commonPhrases,
      ...newProfile.vocabulary.commonPhrases,
    ]).slice(0, 10),
    avoidedWords: existingProfile.vocabulary.avoidedWords,
    usesContractions: existingProfile.vocabulary.usesContractions || newProfile.vocabulary.usesContractions,
    contractionRate: Math.round(
      (existingProfile.vocabulary.contractionRate * existingWeight +
       newProfile.vocabulary.contractionRate * newWeight) * 100
    ) / 100,
    usesEmoji: existingProfile.vocabulary.usesEmoji || newProfile.vocabulary.usesEmoji,
    emojiFrequency: Math.round(
      (existingProfile.vocabulary.emojiFrequency * existingWeight +
       newProfile.vocabulary.emojiFrequency * newWeight) * 100
    ) / 100,
    commonEmoji: deduplicateStrings([
      ...existingProfile.vocabulary.commonEmoji,
      ...newProfile.vocabulary.commonEmoji,
    ]),
    usesExclamation: existingProfile.vocabulary.usesExclamation || newProfile.vocabulary.usesExclamation,
    exclamationRate: Math.round(
      (existingProfile.vocabulary.exclamationRate * existingWeight +
       newProfile.vocabulary.exclamationRate * newWeight) * 100
    ) / 100,
  };

  // Merge context variations
  const existingContexts = new Map(
    existingProfile.contextVariations.map(v => [v.context, v])
  );
  for (const newVar of newProfile.contextVariations) {
    if (!existingContexts.has(newVar.context)) {
      existingContexts.set(newVar.context, newVar);
    }
  }
  merged.contextVariations = Array.from(existingContexts.values());

  return merged;
}

// ─── Merge Helpers ────────────────────────────────────────────────────────────

function mergePatternLists(
  existing: Array<{ text: string; frequency: number; contexts: string[] }>,
  incoming: Array<{ text: string; frequency: number; contexts: string[] }>,
  existingWeight: number,
  newWeight: number,
): { patterns: Array<{ text: string; frequency: number; contexts: string[] }>; usesRecipientName: boolean; usesNameVariant: 'first' | 'full' | 'none' | 'mixed' } {
  const merged = new Map<string, { frequency: number; contexts: string[] }>();

  for (const p of existing) {
    merged.set(p.text, {
      frequency: p.frequency * existingWeight,
      contexts: [...p.contexts],
    });
  }

  for (const p of incoming) {
    const current = merged.get(p.text);
    if (current) {
      current.frequency += p.frequency * newWeight;
      current.contexts = deduplicateStrings([...current.contexts, ...p.contexts]);
    } else {
      merged.set(p.text, {
        frequency: p.frequency * newWeight,
        contexts: [...p.contexts],
      });
    }
  }

  // Normalize frequencies
  const totalFreq = Array.from(merged.values()).reduce((a, b) => a + b.frequency, 0);
  const patterns = Array.from(merged.entries())
    .map(([text, data]) => ({
      text,
      frequency: totalFreq > 0 ? Math.round((data.frequency / totalFreq) * 100) / 100 : 0,
      contexts: data.contexts,
    }))
    .sort((a, b) => b.frequency - a.frequency);

  return {
    patterns,
    usesRecipientName: false,
    usesNameVariant: 'none',
  };
}

function deduplicateStrings(arr: string[]): string[] {
  return [...new Set(arr)];
}
