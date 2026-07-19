import type Database from 'better-sqlite3';
import { buildMigrationEventId, scanLegacyInventory } from './legacy-inventory.js';
import type {
  LegacyInventoryPaths,
  LegacyInventorySources,
  LegacyMigrationDomain,
  MigrationConflict,
  MigrationDryRunReport,
} from './types.js';

interface ExistingVaultSourceRef {
  sourceId: string;
  sourceType: string;
}

function loadExistingVaultState(db: Database.Database | undefined): {
  eventIds: Set<string>;
  sourceRefs: ExistingVaultSourceRef[];
} {
  if (!db) {
    return { eventIds: new Set(), sourceRefs: [] };
  }

  try {
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vault_event_log'",
    ).get() as { name?: string } | undefined;

    if (table?.name !== 'vault_event_log') {
      return { eventIds: new Set(), sourceRefs: [] };
    }

    const rows = db.prepare('SELECT event_id, source_refs_json FROM vault_event_log').all() as Array<{
      event_id: string;
      source_refs_json: string;
    }>;

    const eventIds = new Set<string>();
    const sourceRefs: ExistingVaultSourceRef[] = [];

    for (const row of rows) {
      eventIds.add(row.event_id);
      try {
        const parsed = JSON.parse(row.source_refs_json) as ExistingVaultSourceRef[];
        for (const ref of parsed) {
          sourceRefs.push(ref);
        }
      } catch {
        // Ignore malformed rows during dry-run conflict detection.
      }
    }

    return { eventIds, sourceRefs };
  } catch {
    return { eventIds: new Set(), sourceRefs: [] };
  }
}

function detectConflicts(
  domain: LegacyMigrationDomain,
  records: Array<{ stableSourceId: string; legacyId: string }>,
  existingEventIds: Set<string>,
  existingSourceRefs: ExistingVaultSourceRef[],
): MigrationConflict[] {
  const conflicts: MigrationConflict[] = [];
  const existingSourceIds = new Set(existingSourceRefs.map((ref) => ref.sourceId));

  for (const record of records) {
    const eventId = buildMigrationEventId(domain, record.legacyId);

    if (existingEventIds.has(eventId)) {
      conflicts.push({
        domain,
        stableSourceId: record.stableSourceId,
        reason: 'duplicate_event_id',
        existingEventId: eventId,
      });
    }

    if (existingSourceIds.has(record.stableSourceId)) {
      conflicts.push({
        domain,
        stableSourceId: record.stableSourceId,
        reason: 'duplicate_source_ref',
        existingEventId: record.stableSourceId,
      });
    }
  }

  return conflicts;
}

export function generateMigrationDryRunReport(options: {
  sources: LegacyInventorySources;
  paths?: LegacyInventoryPaths;
  vaultDb?: Database.Database;
  domains?: LegacyMigrationDomain[];
}): MigrationDryRunReport {
  const inventory = scanLegacyInventory(options.sources, options.paths ?? {});
  const existing = loadExistingVaultState(options.vaultDb);
  const selectedDomains = options.domains ?? (Object.keys(inventory.recordsByDomain) as LegacyMigrationDomain[]);

  const domains: MigrationDryRunReport['domains'] = {};
  let totalWouldImport = 0;
  let totalConflicts = 0;

  for (const domain of selectedDomains) {
    const records = inventory.recordsByDomain[domain] ?? [];
    const wouldImportIds = records.map((record) => record.stableSourceId);
    const conflicts = detectConflicts(domain, records, existing.eventIds, existing.sourceRefs);

    domains[domain] = {
      wouldImportCount: wouldImportIds.length,
      wouldImportIds,
      conflicts,
    };

    totalWouldImport += wouldImportIds.length;
    totalConflicts += conflicts.length;
  }

  return {
    generatedAt: new Date().toISOString(),
    inventory,
    domains,
    totalWouldImport,
    totalConflicts,
  };
}
