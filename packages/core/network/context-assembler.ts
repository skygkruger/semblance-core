// Context Assembler — Produces derived summaries from safe stores.
//
// ARCHITECTURAL EXCLUSION: This class receives ONLY 5 safe store dependencies
// via constructor injection. It physically cannot access financial, health,
// credential, audit trail, Living Will, or Inheritance stores because they
// are never injected. Dependency injection IS the enforcement.
//
// Each category assembler produces a human-readable summary, NEVER raw data
// (no email bodies, no GPS coordinates, no financial data).
//
// CRITICAL: No networking imports. Pure data transformation.

import type { StyleProfileStore } from '../style/style-profile.js';
import type { CalendarIndexer } from '../knowledge/calendar-indexer.js';
import type { DocumentStore } from '../knowledge/document-store.js';
import type { ContactStore } from '../knowledge/contacts/contact-store.js';
import type { LocationStore } from '../location/location-store.js';
import type { AssembledContext, SharingCategory } from './types.js';

/**
 * ContextAssembler — Assembles derived context summaries per category.
 *
 * 5 safe store dependencies (and ONLY these 5):
 * 1. StyleProfileStore — communication style summary
 * 2. CalendarIndexer — calendar availability (free/busy, not event details)
 * 3. DocumentStore — project/topic summaries (titles only, not content)
 * 4. ContactStore — shared contact context (names only, not contact details)
 * 5. LocationStore — city-level location (reduced precision, not GPS)
 */
export class ContextAssembler {
  private styleStore: StyleProfileStore | null;
  private calendarIndexer: CalendarIndexer | null;
  private documentStore: DocumentStore | null;
  private contactStore: ContactStore | null;
  private locationStore: LocationStore | null;

  constructor(deps: {
    styleStore?: StyleProfileStore | null;
    calendarIndexer?: CalendarIndexer | null;
    documentStore?: DocumentStore | null;
    contactStore?: ContactStore | null;
    locationStore?: LocationStore | null;
  }) {
    this.styleStore = deps.styleStore ?? null;
    this.calendarIndexer = deps.calendarIndexer ?? null;
    this.documentStore = deps.documentStore ?? null;
    this.contactStore = deps.contactStore ?? null;
    this.locationStore = deps.locationStore ?? null;
  }

  /**
   * Assemble context for a specific category.
   * Returns null if the required store is unavailable or has no data.
   */
  assemble(category: SharingCategory): AssembledContext | null {
    switch (category) {
      case 'calendar-availability':
        return this.assembleCalendarAvailability();
      case 'communication-style':
        return this.assembleCommunicationStyle();
      case 'project-context':
        return this.assembleProjectContext();
      case 'topic-expertise':
        return this.assembleTopicExpertise();
      case 'location-context':
        return this.assembleLocationContext();
      default:
        return null;
    }
  }

  /**
   * Assemble context for multiple categories at once.
   */
  assembleMultiple(categories: SharingCategory[]): AssembledContext[] {
    const results: AssembledContext[] = [];
    for (const category of categories) {
      const ctx = this.assemble(category);
      if (ctx) results.push(ctx);
    }
    return results;
  }

  // ─── Category Assemblers ──────────────────────────────────────────────────

  /**
   * Calendar availability — free/busy blocks only, not event details.
   * Shares: time ranges when busy, next 7 days.
   * Does NOT share: event titles, attendees, descriptions, locations.
   */
  private assembleCalendarAvailability(): AssembledContext | null {
    if (!this.calendarIndexer) return null;

    const events = this.calendarIndexer.getUpcomingEvents({ daysAhead: 7, limit: 50 });
    if (events.length === 0) {
      return {
        category: 'calendar-availability',
        summaryText: 'No upcoming events in the next 7 days.',
        structuredData: { busyBlocks: [] },
        assembledAt: new Date().toISOString(),
      };
    }

    // Extract busy blocks — time ranges only, no event details
    const busyBlocks = events.map(e => ({
      start: e.startTime,
      end: e.endTime,
      isAllDay: e.isAllDay,
    }));

    const summaryText = `${events.length} event(s) in the next 7 days. ` +
      `Busy periods include ${busyBlocks.slice(0, 3).map(b =>
        b.isAllDay ? 'all-day event' : `${b.start} to ${b.end}`
      ).join(', ')}${events.length > 3 ? ` and ${events.length - 3} more` : ''}.`;

    return {
      category: 'calendar-availability',
      summaryText,
      structuredData: { busyBlocks },
      assembledAt: new Date().toISOString(),
    };
  }

  /**
   * Communication style — tone and pattern summary.
   * Shares: formality level, directness, warmth, contraction usage.
   * Does NOT share: actual greetings/signoffs, email content, phrases.
   */
  private assembleCommunicationStyle(): AssembledContext | null {
    if (!this.styleStore) return null;

    const profile = this.styleStore.getActiveProfile();
    if (!profile) return null;

    const { tone, structure, vocabulary } = profile;

    const formalityLabel =
      tone.formalityScore > 70 ? 'formal' :
      tone.formalityScore > 40 ? 'moderate' : 'casual';

    const directnessLabel =
      tone.directnessScore > 70 ? 'direct' :
      tone.directnessScore > 40 ? 'balanced' : 'indirect';

    const warmthLabel =
      tone.warmthScore > 70 ? 'warm' :
      tone.warmthScore > 40 ? 'neutral' : 'reserved';

    const summaryText = `Communication style: ${formalityLabel}, ${directnessLabel}, ${warmthLabel}. ` +
      `Average email length: ${structure.avgEmailLength} characters. ` +
      `${vocabulary.usesContractions ? 'Uses' : 'Avoids'} contractions. ` +
      `${vocabulary.usesEmoji ? 'Uses' : 'Does not use'} emoji.`;

    return {
      category: 'communication-style',
      summaryText,
      structuredData: {
        formality: formalityLabel,
        directness: directnessLabel,
        warmth: warmthLabel,
        avgEmailLength: structure.avgEmailLength,
        usesContractions: vocabulary.usesContractions,
        usesEmoji: vocabulary.usesEmoji,
      },
      assembledAt: new Date().toISOString(),
    };
  }

  /**
   * Project context — document source statistics and recent titles.
   * Shares: number of documents by source, recent document titles.
   * Does NOT share: document content, file paths, metadata.
   */
  private assembleProjectContext(): AssembledContext | null {
    if (!this.documentStore) return null;

    const stats = this.documentStore.getStats();
    if (stats.totalDocuments === 0) return null;

    const recentDocs = this.documentStore.listDocuments({ limit: 10 });
    const titles = recentDocs.map(d => d.title).filter(t => t.length > 0);

    const summaryText = `${stats.totalDocuments} document(s) indexed. ` +
      `Sources: ${Object.entries(stats.sources).map(([s, c]) => `${s} (${c})`).join(', ')}. ` +
      `Recent topics: ${titles.slice(0, 5).join(', ')}.`;

    return {
      category: 'project-context',
      summaryText,
      structuredData: {
        totalDocuments: stats.totalDocuments,
        sources: stats.sources,
        recentTitles: titles.slice(0, 5),
      },
      assembledAt: new Date().toISOString(),
    };
  }

  /**
   * Topic expertise — inferred from document and entity distribution.
   * Shares: broad topic areas and document count per source type.
   * Does NOT share: entity details, document content, specific knowledge.
   */
  private assembleTopicExpertise(): AssembledContext | null {
    if (!this.documentStore) return null;

    const stats = this.documentStore.getStats();
    if (stats.totalDocuments === 0) return null;

    const summaryText = `Expertise areas inferred from ${stats.totalDocuments} document(s) ` +
      `across ${Object.keys(stats.sources).length} source type(s): ` +
      `${Object.keys(stats.sources).join(', ')}.`;

    return {
      category: 'topic-expertise',
      summaryText,
      structuredData: {
        totalDocuments: stats.totalDocuments,
        sourceTypes: Object.keys(stats.sources),
      },
      assembledAt: new Date().toISOString(),
    };
  }

  /**
   * Location context — city-level only, not precise coordinates.
   * Shares: approximate area (city-level precision from LocationStore's 3-decimal reduction).
   * Does NOT share: exact GPS coordinates, location history, addresses.
   */
  private assembleLocationContext(): AssembledContext | null {
    if (!this.locationStore) return null;

    const last = this.locationStore.getLastKnownLocation();
    if (!last) return null;

    // Round to 1 decimal place (~11km precision) for sharing — much coarser than stored
    const lat = Math.round(last.coordinate.latitude * 10) / 10;
    const lon = Math.round(last.coordinate.longitude * 10) / 10;

    const summaryText = `Approximate location: ${lat}, ${lon} (city-level precision).`;

    return {
      category: 'location-context',
      summaryText,
      structuredData: {
        approximateLatitude: lat,
        approximateLongitude: lon,
        precisionKm: 11,
        lastUpdated: last.timestamp,
      },
      assembledAt: new Date().toISOString(),
    };
  }
}
