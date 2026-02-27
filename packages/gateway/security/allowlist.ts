// Service Allowlist — Only explicitly authorized domains may be contacted.
// Default state: empty. Nothing is allowed until the user authorizes a service.
// No wildcard domains. Each specific subdomain must be explicitly listed.

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS allowed_services (
    id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL,
    domain TEXT NOT NULL,
    port INTEGER,
    protocol TEXT NOT NULL,
    added_at TEXT NOT NULL,
    added_by TEXT NOT NULL DEFAULT 'user',
    is_active INTEGER NOT NULL DEFAULT 1
  );
`;

const CREATE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_allowed_domain ON allowed_services(domain);
`;

export interface AllowedService {
  id: string;
  serviceName: string;
  domain: string;
  port: number | null;
  protocol: string;
  addedAt: string;
  addedBy: string;
  isActive: boolean;
}

interface ServiceRow {
  id: string;
  service_name: string;
  domain: string;
  port: number | null;
  protocol: string;
  added_at: string;
  added_by: string;
  is_active: number;
}

function rowToService(row: ServiceRow): AllowedService {
  return {
    id: row.id,
    serviceName: row.service_name,
    domain: row.domain,
    port: row.port,
    protocol: row.protocol,
    addedAt: row.added_at,
    addedBy: row.added_by,
    isActive: row.is_active === 1,
  };
}

export class Allowlist {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
    this.db.exec(CREATE_INDEX);
  }

  /**
   * Normalize a domain for consistent matching:
   * - Lowercase (domain names are case-insensitive per RFC 4343)
   * - Strip trailing dot (FQDN form equivalent per DNS spec)
   */
  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/\.$/, '');
  }

  /**
   * Check if a domain (and optionally port) is on the active allowlist.
   * Domain matching is case-insensitive and trailing-dot-insensitive.
   */
  isAllowed(domain: string, port?: number): boolean {
    const normalized = this.normalizeDomain(domain);
    let stmt;
    if (port !== undefined) {
      stmt = this.db.prepare(
        'SELECT 1 FROM allowed_services WHERE domain = ? AND (port IS NULL OR port = ?) AND is_active = 1 LIMIT 1'
      );
      return stmt.get(normalized, port) !== undefined;
    }
    stmt = this.db.prepare(
      'SELECT 1 FROM allowed_services WHERE domain = ? AND is_active = 1 LIMIT 1'
    );
    return stmt.get(normalized) !== undefined;
  }

  /**
   * Add a service to the allowlist.
   * Rejects wildcard domains (containing *).
   */
  addService(params: {
    serviceName: string;
    domain: string;
    port?: number;
    protocol: string;
    addedBy?: string;
  }): AllowedService {
    if (params.domain.includes('*')) {
      throw new Error(`Wildcard domains are not allowed: ${params.domain}`);
    }

    const normalizedDomain = this.normalizeDomain(params.domain);
    const id = nanoid();
    const addedAt = new Date().toISOString();

    this.db.prepare(
      'INSERT INTO allowed_services (id, service_name, domain, port, protocol, added_at, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      params.serviceName,
      normalizedDomain,
      params.port ?? null,
      params.protocol,
      addedAt,
      params.addedBy ?? 'user',
    );

    return {
      id,
      serviceName: params.serviceName,
      domain: normalizedDomain,
      port: params.port ?? null,
      protocol: params.protocol,
      addedAt,
      addedBy: params.addedBy ?? 'user',
      isActive: true,
    };
  }

  /**
   * Remove a service from the allowlist entirely.
   */
  removeService(id: string): boolean {
    const result = this.db.prepare('DELETE FROM allowed_services WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Deactivate a service (soft-disable without removing the record).
   */
  deactivateService(id: string): boolean {
    const result = this.db.prepare(
      'UPDATE allowed_services SET is_active = 0 WHERE id = ?'
    ).run(id);
    return result.changes > 0;
  }

  /**
   * List all services (active and inactive).
   */
  listServices(): AllowedService[] {
    const rows = this.db.prepare(
      'SELECT * FROM allowed_services ORDER BY added_at ASC'
    ).all() as ServiceRow[];
    return rows.map(rowToService);
  }
}
