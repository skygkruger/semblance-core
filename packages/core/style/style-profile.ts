// Style Profile — Data model, SQLite schema, and storage layer for communication style learning.
// Stores the user's writing style characteristics extracted from sent emails.
// All data stored locally in SQLite. Never transmitted through Gateway.
// CRITICAL: This file is in packages/core/. No network imports.

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

// ─── Style Profile Interface ──────────────────────────────────────────────────

export interface StyleProfile {
  id: string;
  version: number;
  emailsAnalyzed: number;
  isActive: boolean;
  lastUpdatedAt: string;

  greetings: {
    patterns: Array<{
      text: string;
      frequency: number;
      contexts: string[];
    }>;
    usesRecipientName: boolean;
    usesNameVariant: 'first' | 'full' | 'none' | 'mixed';
  };

  signoffs: {
    patterns: Array<{
      text: string;
      frequency: number;
      contexts: string[];
    }>;
    includesName: boolean;
  };

  tone: {
    formalityScore: number;
    directnessScore: number;
    warmthScore: number;
  };

  structure: {
    avgSentenceLength: number;
    avgParagraphLength: number;
    avgEmailLength: number;
    usesListsOrBullets: boolean;
    listFrequency: number;
  };

  vocabulary: {
    commonPhrases: string[];
    avoidedWords: string[];
    usesContractions: boolean;
    contractionRate: number;
    usesEmoji: boolean;
    emojiFrequency: number;
    commonEmoji: string[];
    usesExclamation: boolean;
    exclamationRate: number;
  };

  contextVariations: Array<{
    context: string;
    formalityDelta: number;
    toneNotes: string;
  }>;
}

export interface StyleCorrection {
  id: string;
  profileId: string;
  originalDraft: string;
  correctedDraft: string;
  correctionType: 'greeting' | 'signoff' | 'tone' | 'vocabulary' | 'structure' | 'other' | null;
  createdAt: string;
  applied: boolean;
}

export interface StyleProfileHistoryEntry {
  id: string;
  profileId: string;
  version: number;
  profileJson: string;
  createdAt: string;
}

// ─── SQLite Schema ────────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS style_profiles (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    user_id TEXT NOT NULL DEFAULT 'default',
    profile_json TEXT NOT NULL,
    emails_analyzed INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS style_profile_history (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (profile_id) REFERENCES style_profiles(id)
  );

  CREATE TABLE IF NOT EXISTS style_corrections (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    original_draft TEXT NOT NULL,
    corrected_draft TEXT NOT NULL,
    correction_type TEXT,
    created_at TEXT NOT NULL,
    applied INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (profile_id) REFERENCES style_profiles(id)
  );
`;

// ─── Default Empty Profile ────────────────────────────────────────────────────

export function createEmptyProfile(): StyleProfile {
  return {
    id: '',
    version: 1,
    emailsAnalyzed: 0,
    isActive: false,
    lastUpdatedAt: new Date().toISOString(),
    greetings: {
      patterns: [],
      usesRecipientName: false,
      usesNameVariant: 'none',
    },
    signoffs: {
      patterns: [],
      includesName: false,
    },
    tone: {
      formalityScore: 50,
      directnessScore: 50,
      warmthScore: 50,
    },
    structure: {
      avgSentenceLength: 0,
      avgParagraphLength: 0,
      avgEmailLength: 0,
      usesListsOrBullets: false,
      listFrequency: 0,
    },
    vocabulary: {
      commonPhrases: [],
      avoidedWords: [],
      usesContractions: false,
      contractionRate: 0,
      usesEmoji: false,
      emojiFrequency: 0,
      commonEmoji: [],
      usesExclamation: false,
      exclamationRate: 0,
    },
    contextVariations: [],
  };
}

// ─── Profile Store ────────────────────────────────────────────────────────────

export class StyleProfileStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLES);
  }

  /**
   * Create a new style profile. Returns the created profile.
   */
  createProfile(profile: StyleProfile, userId: string = 'default'): StyleProfile {
    const id = `sp_${nanoid()}`;
    const now = new Date().toISOString();
    const profileWithId = { ...profile, id, lastUpdatedAt: now };

    this.db.prepare(`
      INSERT INTO style_profiles (id, version, user_id, profile_json, emails_analyzed, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      profileWithId.version,
      userId,
      JSON.stringify(profileWithId),
      profileWithId.emailsAnalyzed,
      profileWithId.isActive ? 1 : 0,
      now,
      now,
    );

    return profileWithId;
  }

  /**
   * Get the currently active profile for a user, or null if none exists.
   */
  getActiveProfile(userId: string = 'default'): StyleProfile | null {
    const row = this.db.prepare(
      'SELECT profile_json FROM style_profiles WHERE user_id = ? ORDER BY rowid DESC LIMIT 1'
    ).get(userId) as { profile_json: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.profile_json) as StyleProfile;
  }

  /**
   * Get a profile by its ID.
   */
  getProfileById(id: string): StyleProfile | null {
    const row = this.db.prepare(
      'SELECT profile_json FROM style_profiles WHERE id = ?'
    ).get(id) as { profile_json: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.profile_json) as StyleProfile;
  }

  /**
   * Update an existing profile. Increments version and copies previous version to history.
   */
  updateProfile(id: string, updates: Partial<StyleProfile>): StyleProfile | null {
    const existing = this.getProfileById(id);
    if (!existing) return null;

    // Save current version to history before updating
    const historyId = `sph_${nanoid()}`;
    const historyNow = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO style_profile_history (id, profile_id, version, profile_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(historyId, id, existing.version, JSON.stringify(existing), historyNow);

    // Build updated profile
    const now = new Date().toISOString();
    const newVersion = existing.version + 1;
    const updated: StyleProfile = {
      ...existing,
      ...updates,
      id, // preserve ID
      version: newVersion,
      lastUpdatedAt: now,
      isActive: (updates.emailsAnalyzed ?? existing.emailsAnalyzed) >= 20,
    };

    this.db.prepare(`
      UPDATE style_profiles
      SET version = ?, profile_json = ?, emails_analyzed = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      newVersion,
      JSON.stringify(updated),
      updated.emailsAnalyzed,
      updated.isActive ? 1 : 0,
      now,
      id,
    );

    return updated;
  }

  /**
   * Get version history for a profile.
   */
  getProfileHistory(profileId: string): StyleProfileHistoryEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM style_profile_history WHERE profile_id = ? ORDER BY version ASC'
    ).all(profileId) as Array<{
      id: string;
      profile_id: string;
      version: number;
      profile_json: string;
      created_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      profileId: r.profile_id,
      version: r.version,
      profileJson: r.profile_json,
      createdAt: r.created_at,
    }));
  }

  /**
   * Check if a profile is active (has analyzed 20+ emails).
   */
  isProfileActive(profileId: string): boolean {
    const profile = this.getProfileById(profileId);
    if (!profile) return false;
    return profile.emailsAnalyzed >= 20;
  }

  // ─── Correction Tracking ──────────────────────────────────────────────────

  /**
   * Add a style correction — records a diff between original draft and user's edit.
   */
  addCorrection(input: {
    profileId: string;
    originalDraft: string;
    correctedDraft: string;
    correctionType?: StyleCorrection['correctionType'];
  }): StyleCorrection {
    const id = `sc_${nanoid()}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO style_corrections (id, profile_id, original_draft, corrected_draft, correction_type, created_at, applied)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(
      id,
      input.profileId,
      input.originalDraft,
      input.correctedDraft,
      input.correctionType ?? null,
      now,
    );

    return {
      id,
      profileId: input.profileId,
      originalDraft: input.originalDraft,
      correctedDraft: input.correctedDraft,
      correctionType: input.correctionType ?? null,
      createdAt: now,
      applied: false,
    };
  }

  /**
   * Get all unapplied corrections for a profile.
   */
  getUnappliedCorrections(profileId: string): StyleCorrection[] {
    const rows = this.db.prepare(
      'SELECT * FROM style_corrections WHERE profile_id = ? AND applied = 0 ORDER BY created_at ASC'
    ).all(profileId) as Array<{
      id: string;
      profile_id: string;
      original_draft: string;
      corrected_draft: string;
      correction_type: string | null;
      created_at: string;
      applied: number;
    }>;

    return rows.map(r => ({
      id: r.id,
      profileId: r.profile_id,
      originalDraft: r.original_draft,
      correctedDraft: r.corrected_draft,
      correctionType: r.correction_type as StyleCorrection['correctionType'],
      createdAt: r.created_at,
      applied: r.applied === 1,
    }));
  }

  /**
   * Get all corrections of a specific type for a profile.
   */
  getCorrectionsByType(profileId: string, type: string): StyleCorrection[] {
    const rows = this.db.prepare(
      'SELECT * FROM style_corrections WHERE profile_id = ? AND correction_type = ? ORDER BY created_at ASC'
    ).all(profileId, type) as Array<{
      id: string;
      profile_id: string;
      original_draft: string;
      corrected_draft: string;
      correction_type: string | null;
      created_at: string;
      applied: number;
    }>;

    return rows.map(r => ({
      id: r.id,
      profileId: r.profile_id,
      originalDraft: r.original_draft,
      correctedDraft: r.corrected_draft,
      correctionType: r.correction_type as StyleCorrection['correctionType'],
      createdAt: r.created_at,
      applied: r.applied === 1,
    }));
  }

  /**
   * Mark a correction as applied to the profile.
   */
  markCorrectionApplied(correctionId: string): void {
    this.db.prepare(
      'UPDATE style_corrections SET applied = 1 WHERE id = ?'
    ).run(correctionId);
  }

  /**
   * Count corrections by type for a profile (for determining when to apply).
   */
  countUnappliedCorrectionsByType(profileId: string): Record<string, number> {
    const rows = this.db.prepare(
      'SELECT correction_type, COUNT(*) as count FROM style_corrections WHERE profile_id = ? AND applied = 0 AND correction_type IS NOT NULL GROUP BY correction_type'
    ).all(profileId) as Array<{ correction_type: string; count: number }>;

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.correction_type] = row.count;
    }
    return counts;
  }

  /**
   * Delete a profile and all associated history and corrections.
   */
  deleteProfile(id: string): boolean {
    this.db.prepare('DELETE FROM style_corrections WHERE profile_id = ?').run(id);
    this.db.prepare('DELETE FROM style_profile_history WHERE profile_id = ?').run(id);
    const result = this.db.prepare('DELETE FROM style_profiles WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
