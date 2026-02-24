/**
 * Step 28 — ContextAssembler tests.
 * Verifies derived summaries from 5 safe stores, never raw data.
 */

import { describe, it, expect } from 'vitest';
import { ContextAssembler } from '@semblance/core/network/context-assembler';

// ─── Mock stores ──────────────────────────────────────────────────────────────

function mockCalendarIndexer(events: Array<{
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  title: string;
}>) {
  return {
    getUpcomingEvents: () => events.map((e, i) => ({
      id: `id-${i}`,
      uid: `uid-${i}`,
      calendarId: 'cal-1',
      title: e.title,
      description: '',
      startTime: e.startTime,
      endTime: e.endTime,
      isAllDay: e.isAllDay,
      location: '',
      attendees: '[]',
      organizer: '',
      status: 'confirmed' as const,
      recurrenceRule: null,
      accountId: 'acc-1',
      indexedAt: new Date().toISOString(),
    })),
  };
}

function mockStyleProfileStore(profile: {
  formalityScore: number;
  directnessScore: number;
  warmthScore: number;
  avgEmailLength: number;
  usesContractions: boolean;
  usesEmoji: boolean;
} | null) {
  return {
    getActiveProfile: () => profile ? {
      id: 'sp_test',
      version: 1,
      emailsAnalyzed: 30,
      isActive: true,
      lastUpdatedAt: new Date().toISOString(),
      greetings: { patterns: [], usesRecipientName: false, usesNameVariant: 'none' as const },
      signoffs: { patterns: [], includesName: false },
      tone: {
        formalityScore: profile.formalityScore,
        directnessScore: profile.directnessScore,
        warmthScore: profile.warmthScore,
      },
      structure: {
        avgSentenceLength: 15,
        avgParagraphLength: 3,
        avgEmailLength: profile.avgEmailLength,
        usesListsOrBullets: false,
        listFrequency: 0,
      },
      vocabulary: {
        commonPhrases: ['sounds good'],
        avoidedWords: [],
        usesContractions: profile.usesContractions,
        contractionRate: 0.5,
        usesEmoji: profile.usesEmoji,
        emojiFrequency: 0,
        commonEmoji: [],
        usesExclamation: false,
        exclamationRate: 0,
      },
      contextVariations: [],
    } : null,
  };
}

function mockDocumentStore(docs: Array<{ title: string; source: string }>) {
  const sources: Record<string, number> = {};
  for (const d of docs) {
    sources[d.source] = (sources[d.source] ?? 0) + 1;
  }
  return {
    getStats: () => ({
      totalDocuments: docs.length,
      sources,
    }),
    listDocuments: () => docs.map((d, i) => ({
      id: `doc-${i}`,
      source: d.source,
      title: d.title,
      content: '',
      contentHash: `hash-${i}`,
      mimeType: 'text/plain',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      indexedAt: new Date().toISOString(),
      metadata: {},
    })),
  };
}

function mockLocationStore(location: { latitude: number; longitude: number } | null) {
  return {
    getLastKnownLocation: () => location ? {
      id: 'loc_test',
      coordinate: location,
      accuracyMeters: 50,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    } : null,
  };
}

describe('ContextAssembler (Step 28)', () => {
  it('assembles calendar availability as busy blocks without event details', () => {
    const assembler = new ContextAssembler({
      calendarIndexer: mockCalendarIndexer([
        { startTime: '2026-02-25T09:00:00Z', endTime: '2026-02-25T10:00:00Z', isAllDay: false, title: 'Secret Meeting' },
        { startTime: '2026-02-26T14:00:00Z', endTime: '2026-02-26T15:00:00Z', isAllDay: false, title: 'Private Call' },
      ]) as never,
    });

    const ctx = assembler.assemble('calendar-availability');
    expect(ctx).not.toBeNull();
    expect(ctx!.summaryText).toContain('2 event(s)');
    // Must NOT contain event titles (privacy)
    expect(ctx!.summaryText).not.toContain('Secret Meeting');
    expect(ctx!.summaryText).not.toContain('Private Call');
    // Structured data has busy blocks with times only
    const blocks = (ctx!.structuredData as { busyBlocks: unknown[] }).busyBlocks;
    expect(blocks).toHaveLength(2);
  });

  it('assembles communication style summary without raw patterns', () => {
    const assembler = new ContextAssembler({
      styleStore: mockStyleProfileStore({
        formalityScore: 75,
        directnessScore: 80,
        warmthScore: 30,
        avgEmailLength: 200,
        usesContractions: true,
        usesEmoji: false,
      }) as never,
    });

    const ctx = assembler.assemble('communication-style');
    expect(ctx).not.toBeNull();
    expect(ctx!.summaryText).toContain('formal');
    expect(ctx!.summaryText).toContain('direct');
    expect(ctx!.summaryText).toContain('reserved');
    expect(ctx!.summaryText).toContain('Uses contractions');
    // Must NOT contain "sounds good" (raw phrase)
    expect(ctx!.summaryText).not.toContain('sounds good');
  });

  it('assembles project context with document titles only', () => {
    const assembler = new ContextAssembler({
      documentStore: mockDocumentStore([
        { title: 'Architecture Overview', source: 'file' },
        { title: 'API Design', source: 'file' },
        { title: 'Quarterly Report', source: 'email' },
      ]) as never,
    });

    const ctx = assembler.assemble('project-context');
    expect(ctx).not.toBeNull();
    expect(ctx!.summaryText).toContain('3 document(s)');
    expect(ctx!.summaryText).toContain('Architecture Overview');
    expect((ctx!.structuredData as { recentTitles: string[] }).recentTitles).toHaveLength(3);
  });

  it('assembles topic expertise from document distribution', () => {
    const assembler = new ContextAssembler({
      documentStore: mockDocumentStore([
        { title: 'Doc A', source: 'file' },
        { title: 'Doc B', source: 'email' },
      ]) as never,
    });

    const ctx = assembler.assemble('topic-expertise');
    expect(ctx).not.toBeNull();
    expect(ctx!.summaryText).toContain('2 document(s)');
    expect(ctx!.summaryText).toContain('2 source type(s)');
  });

  it('returns null gracefully when store is unavailable', () => {
    const assembler = new ContextAssembler({});
    expect(assembler.assemble('calendar-availability')).toBeNull();
    expect(assembler.assemble('communication-style')).toBeNull();
    expect(assembler.assemble('project-context')).toBeNull();
    expect(assembler.assemble('topic-expertise')).toBeNull();
    expect(assembler.assemble('location-context')).toBeNull();

    // Multiple returns empty array
    expect(assembler.assembleMultiple(['calendar-availability', 'communication-style'])).toEqual([]);
  });
});
