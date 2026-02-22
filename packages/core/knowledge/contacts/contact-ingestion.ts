// Contact Ingestion Pipeline — Fetches contacts from device, normalizes, deduplicates,
// and indexes into the knowledge graph.
//
// Pattern: Follows EmailIndexer — batch processing, dedup, progress events.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { ContactsAdapter, DeviceContact } from '../../platform/types.js';
import type { ContactStore } from './contact-store.js';
import type { ContactIngestionResult } from './contact-types.js';

export type IngestionEventHandler = (event: string, data: unknown) => void;

export class ContactIngestionPipeline {
  private contactsAdapter: ContactsAdapter;
  private contactStore: ContactStore;
  private eventHandler: IngestionEventHandler | null = null;

  constructor(config: {
    contactsAdapter: ContactsAdapter;
    contactStore: ContactStore;
  }) {
    this.contactsAdapter = config.contactsAdapter;
    this.contactStore = config.contactStore;
  }

  onEvent(handler: IngestionEventHandler): void {
    this.eventHandler = handler;
  }

  private emit(event: string, data: unknown): void {
    if (this.eventHandler) {
      this.eventHandler(event, data);
    }
  }

  /**
   * Ingest contacts from the device store.
   * Fetches all contacts, normalizes, deduplicates by device_contact_id then email match.
   */
  async ingestFromDevice(): Promise<ContactIngestionResult> {
    const permission = await this.contactsAdapter.checkPermission();
    if (permission !== 'authorized') {
      return { imported: 0, updated: 0, skipped: 0, total: 0 };
    }

    const deviceContacts = await this.contactsAdapter.getAllContacts();
    const total = deviceContacts.length;
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < deviceContacts.length; i++) {
      const dc = deviceContacts[i]!;

      this.emit('semblance://contact-ingestion-progress', {
        processed: i + 1,
        total,
        currentName: dc.displayName,
      });

      try {
        const result = this.ingestSingleContact(dc);
        if (result === 'imported') imported++;
        else if (result === 'updated') updated++;
        else skipped++;
      } catch (err) {
        console.error(`[ContactIngestion] Failed to ingest ${dc.displayName}:`, err);
        skipped++;
      }
    }

    this.emit('semblance://contact-ingestion-complete', {
      imported,
      updated,
      skipped,
      total,
    });

    return { imported, updated, skipped, total };
  }

  /**
   * Ingest a single device contact.
   * Dedup: first by device_contact_id, then by email match.
   */
  private ingestSingleContact(dc: DeviceContact): 'imported' | 'updated' | 'skipped' {
    const emails = dc.emails.map(e => e.value.toLowerCase());

    // Try insert (dedup by device_contact_id handled in ContactStore)
    const result = this.contactStore.insertContact({
      deviceContactId: dc.deviceContactId,
      displayName: dc.displayName,
      givenName: dc.givenName,
      familyName: dc.familyName,
      emails,
      phones: dc.phones.map(p => p.value),
      organization: dc.organization,
      jobTitle: dc.jobTitle,
      birthday: dc.birthday,
      addresses: dc.addresses.map(a => ({
        label: a.label,
        street: a.street,
        city: a.city,
        region: a.region,
        postalCode: a.postalCode,
        country: a.country,
      })),
      source: 'device',
    });

    if (result.deduplicated) {
      // Contact already exists — update fields that may have changed
      this.contactStore.updateContact(result.id, {
        displayName: dc.displayName,
        givenName: dc.givenName,
        familyName: dc.familyName,
        emails,
        phones: dc.phones.map(p => p.value),
        organization: dc.organization,
        jobTitle: dc.jobTitle,
        birthday: dc.birthday,
      });
      return 'updated';
    }

    // Check if any email matches an existing contact (dedup by email)
    for (const email of emails) {
      const existing = this.contactStore.findByEmail(email);
      if (existing.length > 0 && existing[0]!.id !== result.id) {
        // Merge: update existing with device info, delete new duplicate
        this.contactStore.updateContact(existing[0]!.id, {
          displayName: dc.displayName || existing[0]!.displayName,
          givenName: dc.givenName || existing[0]!.givenName,
          familyName: dc.familyName || existing[0]!.familyName,
          phones: dc.phones.map(p => p.value),
          organization: dc.organization || existing[0]!.organization,
          jobTitle: dc.jobTitle || existing[0]!.jobTitle,
          birthday: dc.birthday || existing[0]!.birthday,
        });
        this.contactStore.deleteContact(result.id);
        return 'updated';
      }
    }

    return 'imported';
  }
}
