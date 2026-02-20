// Credential Store Tests — Proves add/get/update/remove round-trips,
// and that passwords are encrypted at rest (not plaintext in raw SQLite).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CredentialStore } from '@semblance/gateway/credentials/store.js';
import { encryptPassword, decryptPassword } from '@semblance/gateway/credentials/encryption.js';

describe('Credential Store', () => {
  let db: Database.Database;
  let store: CredentialStore;
  let tempDir: string;
  let keyPath: string;

  beforeEach(() => {
    db = new Database(':memory:');
    tempDir = join(tmpdir(), `semblance-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    keyPath = join(tempDir, 'credential.key');
    // Write a test key
    writeFileSync(keyPath, randomBytes(32));
    store = new CredentialStore(db, keyPath);
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  const addTestCredential = (overrides?: Partial<Parameters<CredentialStore['add']>[0]>) =>
    store.add({
      serviceType: 'email',
      protocol: 'imap',
      host: 'imap.gmail.com',
      port: 993,
      username: 'user@gmail.com',
      password: 'my-secret-password',
      useTLS: true,
      displayName: 'Work Email',
      ...overrides,
    });

  it('add returns a credential with all fields populated', () => {
    const cred = addTestCredential();
    expect(cred.id).toBeTruthy();
    expect(cred.serviceType).toBe('email');
    expect(cred.protocol).toBe('imap');
    expect(cred.host).toBe('imap.gmail.com');
    expect(cred.port).toBe(993);
    expect(cred.username).toBe('user@gmail.com');
    expect(cred.encryptedPassword).toBeTruthy();
    expect(cred.useTLS).toBe(true);
    expect(cred.displayName).toBe('Work Email');
    expect(cred.createdAt).toBeTruthy();
    expect(cred.lastVerifiedAt).toBeNull();
  });

  it('get retrieves a stored credential by ID', () => {
    const added = addTestCredential();
    const retrieved = store.get(added.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(added.id);
    expect(retrieved!.username).toBe('user@gmail.com');
    expect(retrieved!.host).toBe('imap.gmail.com');
  });

  it('get returns null for non-existent ID', () => {
    const result = store.get('non-existent-id');
    expect(result).toBeNull();
  });

  it('getByType filters by service type', () => {
    addTestCredential({ serviceType: 'email', protocol: 'imap', displayName: 'Email IMAP' });
    addTestCredential({ serviceType: 'email', protocol: 'smtp', displayName: 'Email SMTP' });
    addTestCredential({ serviceType: 'calendar', protocol: 'caldav', displayName: 'Calendar' });

    const emailCreds = store.getByType('email');
    expect(emailCreds).toHaveLength(2);
    expect(emailCreds.every(c => c.serviceType === 'email')).toBe(true);

    const calendarCreds = store.getByType('calendar');
    expect(calendarCreds).toHaveLength(1);
    expect(calendarCreds[0]!.serviceType).toBe('calendar');
  });

  it('getAll returns all credentials', () => {
    addTestCredential({ displayName: 'First' });
    addTestCredential({ displayName: 'Second', serviceType: 'calendar', protocol: 'caldav' });

    const all = store.getAll();
    expect(all).toHaveLength(2);
  });

  it('update modifies specified fields', () => {
    const cred = addTestCredential();

    const updated = store.update(cred.id, {
      host: 'imap.newhost.com',
      port: 994,
      displayName: 'Updated Email',
    });

    expect(updated.host).toBe('imap.newhost.com');
    expect(updated.port).toBe(994);
    expect(updated.displayName).toBe('Updated Email');
    expect(updated.username).toBe('user@gmail.com'); // unchanged
  });

  it('update re-encrypts password when changed', () => {
    const cred = addTestCredential();
    const originalEncrypted = cred.encryptedPassword;

    store.update(cred.id, { password: 'new-secret-password' });
    const updated = store.get(cred.id)!;

    expect(updated.encryptedPassword).not.toBe(originalEncrypted);

    // Verify the new password decrypts correctly
    const decrypted = store.decryptPassword(updated);
    expect(decrypted).toBe('new-secret-password');
  });

  it('update sets lastVerifiedAt', () => {
    const cred = addTestCredential();
    expect(cred.lastVerifiedAt).toBeNull();

    const now = new Date().toISOString();
    store.update(cred.id, { lastVerifiedAt: now });
    const updated = store.get(cred.id)!;
    expect(updated.lastVerifiedAt).toBe(now);
  });

  it('update throws for non-existent ID', () => {
    expect(() => store.update('non-existent', { host: 'new' })).toThrow('Credential not found');
  });

  it('remove deletes a credential', () => {
    const cred = addTestCredential();
    expect(store.get(cred.id)).not.toBeNull();

    store.remove(cred.id);
    expect(store.get(cred.id)).toBeNull();
  });

  it('passwords are encrypted at rest — raw SQLite does not contain plaintext', () => {
    const password = 'my-super-secret-password-12345';
    addTestCredential({ password });

    // Read the raw row from SQLite
    const rawRow = db.prepare('SELECT encrypted_password FROM service_credentials LIMIT 1')
      .get() as { encrypted_password: string };

    // The encrypted_password should NOT be the plaintext password
    expect(rawRow.encrypted_password).not.toBe(password);
    // It should be a base64-encoded string (IV + authTag + ciphertext)
    expect(rawRow.encrypted_password).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // The base64 decoded length should be at least IV(12) + authTag(16) + 1 byte ciphertext
    const decoded = Buffer.from(rawRow.encrypted_password, 'base64');
    expect(decoded.length).toBeGreaterThanOrEqual(29);
  });

  it('decryptPassword returns the original plaintext', () => {
    const password = 'my-super-secret-password-12345';
    const cred = addTestCredential({ password });

    const decrypted = store.decryptPassword(cred);
    expect(decrypted).toBe(password);
  });

  it('decryptPassword works for various password lengths', () => {
    const passwords = ['a', 'short', 'a-medium-length-password', 'a'.repeat(200), '!@#$%^&*()_+=-[]{}|;:\'",.<>?/`~'];
    for (const pw of passwords) {
      const cred = addTestCredential({ password: pw, username: `user-${pw.length}@test.com` });
      expect(store.decryptPassword(cred)).toBe(pw);
    }
  });

  it('service_credentials table has correct schema', () => {
    const columns = db.prepare("PRAGMA table_info('service_credentials')").all() as { name: string; type: string }[];
    const colNames = columns.map(c => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('service_type');
    expect(colNames).toContain('protocol');
    expect(colNames).toContain('host');
    expect(colNames).toContain('port');
    expect(colNames).toContain('username');
    expect(colNames).toContain('encrypted_password');
    expect(colNames).toContain('use_tls');
    expect(colNames).toContain('display_name');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('last_verified_at');
  });
});

describe('Credential Encryption', () => {
  it('encrypt and decrypt round-trip', () => {
    const key = randomBytes(32);
    const plaintext = 'my-secret-password';

    const encrypted = encryptPassword(key, plaintext);
    const decrypted = decryptPassword(key, encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('encrypted output is base64 and contains IV + authTag + ciphertext', () => {
    const key = randomBytes(32);
    const encrypted = encryptPassword(key, 'test');

    // Should be valid base64
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);

    // Decoded length: IV(12) + authTag(16) + ciphertext(>=1)
    const decoded = Buffer.from(encrypted, 'base64');
    expect(decoded.length).toBeGreaterThanOrEqual(29);
  });

  it('different encryptions of same plaintext produce different ciphertext (random IV)', () => {
    const key = randomBytes(32);
    const encrypted1 = encryptPassword(key, 'same-password');
    const encrypted2 = encryptPassword(key, 'same-password');

    // Should be different due to random IV
    expect(encrypted1).not.toBe(encrypted2);

    // But both should decrypt to the same value
    expect(decryptPassword(key, encrypted1)).toBe('same-password');
    expect(decryptPassword(key, encrypted2)).toBe('same-password');
  });

  it('decrypting with wrong key throws', () => {
    const key1 = randomBytes(32);
    const key2 = randomBytes(32);
    const encrypted = encryptPassword(key1, 'secret');

    expect(() => decryptPassword(key2, encrypted)).toThrow();
  });

  it('decrypting tampered ciphertext throws', () => {
    const key = randomBytes(32);
    const encrypted = encryptPassword(key, 'secret');

    // Tamper with the encrypted data
    const decoded = Buffer.from(encrypted, 'base64');
    decoded[decoded.length - 1] ^= 0xFF; // flip last byte
    const tampered = decoded.toString('base64');

    expect(() => decryptPassword(key, tampered)).toThrow();
  });

  it('decrypting too-short data throws', () => {
    const key = randomBytes(32);
    const tooShort = Buffer.from('too-short').toString('base64');

    expect(() => decryptPassword(key, tooShort)).toThrow('Invalid encrypted data: too short');
  });
});
