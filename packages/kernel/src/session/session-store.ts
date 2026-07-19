import type { ProcessSessionV1 } from '@semblance/protocol';

export interface StoredSession extends ProcessSessionV1 {
  readonly issuedAtMs: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly usedNonces = new Set<string>();

  hasNonce(nonce: string): boolean {
    return this.usedNonces.has(nonce);
  }

  markNonceUsed(nonce: string): void {
    this.usedNonces.add(nonce);
  }

  /** Atomically reserve a nonce. Returns false if already used (replay). */
  reserveNonce(nonce: string): boolean {
    if (this.usedNonces.has(nonce)) {
      return false;
    }
    this.usedNonces.add(nonce);
    return true;
  }

  put(session: StoredSession): void {
    this.sessions.set(session.sessionId, session);
  }

  get(sessionId: string): StoredSession | undefined {
    return this.sessions.get(sessionId);
  }

  isExpired(session: StoredSession, nowMs = Date.now()): boolean {
    return Date.parse(session.expiresAt) <= nowMs;
  }
}

export function createSessionStore(): SessionStore {
  return new SessionStore();
}
