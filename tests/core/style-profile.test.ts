// Tests for StyleProfileStore — CRUD, versioning, correction tracking, isActive threshold.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  StyleProfileStore,
  createEmptyProfile,
  type StyleProfile,
} from '@semblance/core/style/style-profile.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

describe('StyleProfileStore', () => {
  let db: Database.Database;
  let store: StyleProfileStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new StyleProfileStore(db as unknown as DatabaseHandle);
  });

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  it('creates a profile and retrieves it', () => {
    const profile = createEmptyProfile();
    profile.emailsAnalyzed = 5;
    profile.greetings.patterns = [{ text: 'Hi', frequency: 0.8, contexts: ['colleague'] }];

    const created = store.createProfile(profile);
    expect(created.id).toMatch(/^sp_/);
    expect(created.emailsAnalyzed).toBe(5);
    expect(created.greetings.patterns[0]!.text).toBe('Hi');

    const retrieved = store.getProfileById(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.greetings.patterns[0]!.text).toBe('Hi');
  });

  it('getActiveProfile returns the most recent profile for user', () => {
    const p1 = createEmptyProfile();
    p1.emailsAnalyzed = 3;
    store.createProfile(p1, 'user-1');

    const p2 = createEmptyProfile();
    p2.emailsAnalyzed = 7;
    store.createProfile(p2, 'user-1');

    const active = store.getActiveProfile('user-1');
    expect(active).not.toBeNull();
    expect(active!.emailsAnalyzed).toBe(7);
  });

  it('getActiveProfile returns null when no profile exists', () => {
    const result = store.getActiveProfile('nonexistent');
    expect(result).toBeNull();
  });

  it('deleteProfile removes profile and associated data', () => {
    const created = store.createProfile(createEmptyProfile());
    store.addCorrection({
      profileId: created.id,
      originalDraft: 'test',
      correctedDraft: 'corrected',
    });

    expect(store.deleteProfile(created.id)).toBe(true);
    expect(store.getProfileById(created.id)).toBeNull();
    expect(store.getUnappliedCorrections(created.id)).toHaveLength(0);
  });

  // ─── Versioning ──────────────────────────────────────────────────────────

  it('updateProfile increments version and creates history entry', () => {
    const created = store.createProfile(createEmptyProfile());
    expect(created.version).toBe(1);

    const updated = store.updateProfile(created.id, { emailsAnalyzed: 10 });
    expect(updated).not.toBeNull();
    expect(updated!.version).toBe(2);
    expect(updated!.emailsAnalyzed).toBe(10);

    const history = store.getProfileHistory(created.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.version).toBe(1);
  });

  it('multiple updates create multiple history entries', () => {
    const created = store.createProfile(createEmptyProfile());

    store.updateProfile(created.id, { emailsAnalyzed: 5 });
    store.updateProfile(created.id, { emailsAnalyzed: 15 });
    store.updateProfile(created.id, { emailsAnalyzed: 25 });

    const history = store.getProfileHistory(created.id);
    expect(history).toHaveLength(3);
    expect(history[0]!.version).toBe(1);
    expect(history[1]!.version).toBe(2);
    expect(history[2]!.version).toBe(3);

    const current = store.getProfileById(created.id);
    expect(current!.version).toBe(4);
  });

  it('updateProfile returns null for nonexistent ID', () => {
    const result = store.updateProfile('nonexistent', { emailsAnalyzed: 5 });
    expect(result).toBeNull();
  });

  it('history entries preserve previous profile state', () => {
    const initial = createEmptyProfile();
    initial.greetings.patterns = [{ text: 'Hey', frequency: 0.9, contexts: ['colleague'] }];
    const created = store.createProfile(initial);

    store.updateProfile(created.id, {
      greetings: {
        patterns: [{ text: 'Hi', frequency: 0.7, contexts: ['colleague'] }],
        usesRecipientName: true,
        usesNameVariant: 'first',
      },
    });

    const history = store.getProfileHistory(created.id);
    const historyProfile = JSON.parse(history[0]!.profileJson) as StyleProfile;
    expect(historyProfile.greetings.patterns[0]!.text).toBe('Hey');

    const current = store.getProfileById(created.id);
    expect(current!.greetings.patterns[0]!.text).toBe('Hi');
  });

  // ─── isActive Threshold ──────────────────────────────────────────────────

  it('isProfileActive returns false when emailsAnalyzed < 20', () => {
    const created = store.createProfile(createEmptyProfile());
    store.updateProfile(created.id, { emailsAnalyzed: 19 });
    expect(store.isProfileActive(created.id)).toBe(false);
  });

  it('isProfileActive returns true when emailsAnalyzed >= 20', () => {
    const created = store.createProfile(createEmptyProfile());
    store.updateProfile(created.id, { emailsAnalyzed: 20 });
    expect(store.isProfileActive(created.id)).toBe(true);
  });

  it('updateProfile auto-sets isActive based on emailsAnalyzed', () => {
    const created = store.createProfile(createEmptyProfile());

    const under = store.updateProfile(created.id, { emailsAnalyzed: 15 });
    expect(under!.isActive).toBe(false);

    const atThreshold = store.updateProfile(created.id, { emailsAnalyzed: 20 });
    expect(atThreshold!.isActive).toBe(true);
  });

  // ─── Correction Tracking ─────────────────────────────────────────────────

  it('addCorrection stores a correction record', () => {
    const profile = store.createProfile(createEmptyProfile());
    const correction = store.addCorrection({
      profileId: profile.id,
      originalDraft: 'Dear Bob,\n\nPlease find attached.',
      correctedDraft: 'Hey Bob,\n\nHere is the file.',
      correctionType: 'greeting',
    });

    expect(correction.id).toMatch(/^sc_/);
    expect(correction.correctionType).toBe('greeting');
    expect(correction.applied).toBe(false);
  });

  it('getUnappliedCorrections returns only unapplied', () => {
    const profile = store.createProfile(createEmptyProfile());

    const c1 = store.addCorrection({
      profileId: profile.id,
      originalDraft: 'draft1',
      correctedDraft: 'corrected1',
      correctionType: 'greeting',
    });
    store.addCorrection({
      profileId: profile.id,
      originalDraft: 'draft2',
      correctedDraft: 'corrected2',
      correctionType: 'tone',
    });

    store.markCorrectionApplied(c1.id);

    const unapplied = store.getUnappliedCorrections(profile.id);
    expect(unapplied).toHaveLength(1);
    expect(unapplied[0]!.correctionType).toBe('tone');
  });

  it('countUnappliedCorrectionsByType groups correctly', () => {
    const profile = store.createProfile(createEmptyProfile());

    store.addCorrection({ profileId: profile.id, originalDraft: 'a', correctedDraft: 'b', correctionType: 'greeting' });
    store.addCorrection({ profileId: profile.id, originalDraft: 'c', correctedDraft: 'd', correctionType: 'greeting' });
    store.addCorrection({ profileId: profile.id, originalDraft: 'e', correctedDraft: 'f', correctionType: 'greeting' });
    store.addCorrection({ profileId: profile.id, originalDraft: 'g', correctedDraft: 'h', correctionType: 'tone' });

    const counts = store.countUnappliedCorrectionsByType(profile.id);
    expect(counts['greeting']).toBe(3);
    expect(counts['tone']).toBe(1);
  });

  it('getCorrectionsByType filters by type', () => {
    const profile = store.createProfile(createEmptyProfile());

    store.addCorrection({ profileId: profile.id, originalDraft: 'a', correctedDraft: 'b', correctionType: 'greeting' });
    store.addCorrection({ profileId: profile.id, originalDraft: 'c', correctedDraft: 'd', correctionType: 'tone' });
    store.addCorrection({ profileId: profile.id, originalDraft: 'e', correctedDraft: 'f', correctionType: 'greeting' });

    const greetings = store.getCorrectionsByType(profile.id, 'greeting');
    expect(greetings).toHaveLength(2);
    expect(greetings.every(c => c.correctionType === 'greeting')).toBe(true);
  });
});
