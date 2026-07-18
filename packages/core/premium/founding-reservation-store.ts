import { createHash } from 'node:crypto';
import type { DatabaseHandle } from '../platform/types.js';
import {
  verifyFoundingToken,
  type ReservationVerification,
} from './founding-token.js';

export interface FoundingReservation {
  fingerprint: string;
  kind: 'reservation_only';
  seat: number | null;
  importedAt: string;
}

export interface ReservationImportResult extends ReservationVerification {
  imported?: boolean;
}

interface ReservationRow {
  token_hash: string;
  subject_hash: string | null;
  kind: 'reservation_only';
  seat: number | null;
  issued_at: number | null;
  imported_at: string;
}

/**
 * Separate, non-bearer storage for legacy reservations.
 *
 * Until OS secure storage is available, only one-way hashes and non-secret
 * decoded metadata are retained. The bearer JWT is never persisted.
 */
export class FoundingReservationStore {
  private readonly db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.ensureTable();
  }

  importReservation(token: string): ReservationImportResult {
    const verification = verifyFoundingToken(token);
    if (!verification.valid) return verification;

    const normalized = extractToken(token);
    const tokenHash = createHash('sha256').update(normalized).digest('hex');
    const metadata = decodeMetadata(normalized);
    const existing = this.db.prepare(
      'SELECT token_hash FROM founding_reservations WHERE token_hash = ?',
    ).get(tokenHash);
    if (existing) return { ...verification, imported: false };

    this.db.prepare(`
      INSERT INTO founding_reservations (
        token_hash, subject_hash, kind, seat, issued_at, imported_at
      ) VALUES (?, ?, 'reservation_only', ?, ?, ?)
    `).run(
      tokenHash,
      metadata.subjectHash,
      verification.seat,
      metadata.issuedAt,
      new Date().toISOString(),
    );
    return { ...verification, imported: true };
  }

  list(): FoundingReservation[] {
    const rows = this.db.prepare(`
      SELECT token_hash, subject_hash, kind, seat, issued_at, imported_at
      FROM founding_reservations
      ORDER BY imported_at ASC
    `).all() as ReservationRow[];
    return rows.map((row) => ({
      fingerprint: row.token_hash,
      kind: row.kind,
      seat: row.seat,
      importedAt: row.imported_at,
    }));
  }

  count(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) AS count FROM founding_reservations',
    ).get() as { count: number };
    return row.count;
  }

  private ensureTable(): void {
    const columns = this.db.prepare(
      "SELECT name FROM pragma_table_info('founding_reservations')",
    ).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === 'token_ciphertext')) {
      this.db.pragma('secure_delete = ON');
      const removePersistedBearers = this.db.transaction(() => {
        this.db.exec(`
          ALTER TABLE founding_reservations RENAME TO founding_reservations_bearer;
          CREATE TABLE founding_reservations (
            token_hash TEXT PRIMARY KEY,
            subject_hash TEXT,
            kind TEXT NOT NULL CHECK (kind = 'reservation_only'),
            seat INTEGER,
            issued_at INTEGER,
            imported_at TEXT NOT NULL
          );
          INSERT OR IGNORE INTO founding_reservations (
            token_hash, kind, seat, imported_at
          )
          SELECT token_fingerprint, kind, seat, imported_at
          FROM founding_reservations_bearer;
          DROP TABLE founding_reservations_bearer;
        `);
      });
      removePersistedBearers();
      return;
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS founding_reservations (
        token_hash TEXT PRIMARY KEY,
        subject_hash TEXT,
        kind TEXT NOT NULL CHECK (kind = 'reservation_only'),
        seat INTEGER,
        issued_at INTEGER,
        imported_at TEXT NOT NULL
      )
    `);
  }
}

function extractToken(input: string): string {
  const trimmed = input.trim();
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'semblance:'
      && parsed.hostname === 'reservation'
      && parsed.pathname === '/import'
      && parsed.searchParams.size === 1
    ) {
      return parsed.searchParams.get('token') ?? trimmed;
    }
  } catch {
    // A raw JWT is the normal manual-import format.
  }
  return trimmed;
}

function decodeMetadata(token: string): {
  subjectHash: string | null;
  issuedAt: number | null;
} {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return { subjectHash: null, issuedAt: null };
    const payload = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf8'),
    ) as { sub?: unknown; iat?: unknown };
    return {
      subjectHash: typeof payload.sub === 'string'
        ? createHash('sha256').update(payload.sub).digest('hex')
        : null,
      issuedAt: typeof payload.iat === 'number' ? payload.iat : null,
    };
  } catch {
    return { subjectHash: null, issuedAt: null };
  }
}
