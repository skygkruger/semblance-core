import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
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
  token_fingerprint: string;
  token_ciphertext: string;
  token_iv: string;
  token_auth_tag: string;
  kind: 'reservation_only';
  seat: number | null;
  imported_at: string;
}

/**
 * Separate, encrypted storage for legacy reservation JWTs.
 *
 * The encryption key comes from the platform secure-storage boundary. This
 * class never creates or persists key material and never writes entitlement.
 */
export class FoundingReservationStore {
  private readonly db: DatabaseHandle;
  private readonly encryptionKey: Buffer;

  constructor(db: DatabaseHandle, encryptionKey: Buffer) {
    if (encryptionKey.length !== 32) {
      throw new Error('Reservation encryption key must be exactly 32 bytes');
    }
    this.db = db;
    this.encryptionKey = Buffer.from(encryptionKey);
    this.ensureTable();
  }

  importReservation(token: string): ReservationImportResult {
    const verification = verifyFoundingToken(token);
    if (!verification.valid) return verification;

    const normalized = extractToken(token);
    const fingerprint = createHash('sha256').update(normalized).digest('hex');
    const existing = this.db.prepare(
      'SELECT token_fingerprint FROM founding_reservations WHERE token_fingerprint = ?',
    ).get(fingerprint);
    if (existing) return { ...verification, imported: false };

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(normalized, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    this.db.prepare(`
      INSERT INTO founding_reservations (
        token_fingerprint, token_ciphertext, token_iv, token_auth_tag,
        kind, seat, imported_at
      ) VALUES (?, ?, ?, ?, 'reservation_only', ?, ?)
    `).run(
      fingerprint,
      ciphertext.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      verification.seat,
      new Date().toISOString(),
    );
    return { ...verification, imported: true };
  }

  list(): FoundingReservation[] {
    const rows = this.db.prepare(`
      SELECT token_fingerprint, token_ciphertext, token_iv, token_auth_tag,
             kind, seat, imported_at
      FROM founding_reservations
      ORDER BY imported_at ASC
    `).all() as ReservationRow[];
    return rows.map((row) => ({
      fingerprint: row.token_fingerprint,
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

  getToken(fingerprint: string): string | null {
    const row = this.db.prepare(`
      SELECT token_fingerprint, token_ciphertext, token_iv, token_auth_tag,
             kind, seat, imported_at
      FROM founding_reservations
      WHERE token_fingerprint = ?
    `).get(fingerprint) as ReservationRow | undefined;
    if (!row) return null;

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(row.token_iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(row.token_auth_tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.token_ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS founding_reservations (
        token_fingerprint TEXT PRIMARY KEY,
        token_ciphertext TEXT NOT NULL,
        token_iv TEXT NOT NULL,
        token_auth_tag TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind = 'reservation_only'),
        seat INTEGER,
        imported_at TEXT NOT NULL
      )
    `);
  }
}

function extractToken(input: string): string {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('semblance://reservation/import?')
    || trimmed.startsWith('semblance://activate?')
  ) {
    const parsed = new URL(trimmed.replace('semblance://', 'https://'));
    return parsed.searchParams.get('token') ?? trimmed;
  }
  return trimmed;
}
