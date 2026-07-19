import { randomBytes, createCipheriv } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessHelloV1 } from '@semblance/protocol';
import { createMemoryKeyStore } from '../src/keys/memory-key-store.js';
import { createKernel } from '../src/main.js';
import { createDeviceIdentity } from '../src/identity/device-identity.js';
import { createSessionStore } from '../src/session/session-store.js';
import { createCapabilityIssuer } from '../src/policy/capability-issuer.js';
import { isoAfterMs } from '../src/crypto/signing.js';
import {
  createConnectorSecretStore,
  connectorSecretKey,
  migrateLegacyOAuthTokensToKernel,
} from '../src/credentials/connector-secret-store.js';
import {
  createCapabilityScopedCredentialService,
} from '../src/credentials/capability-scoped-credential.js';
import { CredentialAccessError } from '../src/credentials/credential-access-error.js';
import type { SqliteDatabase, SqliteStatement } from '../src/keys/secure-storage-migration.js';
import { kernelOAuthAccessKey, kernelOAuthRefreshKey } from '../src/keys/key-store.js';

const MIGRATED_SENTINEL = 'MIGRATED_TO_KEYCHAIN';
const BUILD_HASH = 'sha256:connector-secrets-test';
const POLICY_EPOCH = 1;
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptLegacySecret(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

class MockOAuthDatabase implements SqliteDatabase {
  readonly rows = new Map<
    string,
    { provider: string; access_token_encrypted: string; refresh_token_encrypted: string }
  >();

  prepare(sql: string): SqliteStatement {
    return {
      all: (...params: unknown[]) => {
        if (sql.includes('PRAGMA table_info')) {
          return [{ name: 'provider' }, { name: 'access_token_encrypted' }, { name: 'refresh_token_encrypted' }];
        }
        if (sql.includes('FROM oauth_tokens')) {
          const sentinel = String(params[0] ?? MIGRATED_SENTINEL);
          return [...this.rows.entries()]
            .filter(
              ([, row]) =>
                row.access_token_encrypted !== sentinel || row.refresh_token_encrypted !== sentinel,
            )
            .map(([provider, row]) => ({ provider, ...row }));
        }
        return [];
      },
      get: (...params: unknown[]) => this.prepare(sql).all(...params)[0],
      run: (...params: unknown[]) => {
        if (sql.startsWith('INSERT INTO oauth_tokens')) {
          this.rows.set(String(params[0]), {
            provider: String(params[0]),
            access_token_encrypted: String(params[1]),
            refresh_token_encrypted: String(params[2]),
          });
        }
        if (sql.startsWith('UPDATE oauth_tokens')) {
          const provider = String(params[2]);
          const existing = this.rows.get(provider);
          if (existing) {
            this.rows.set(provider, {
              provider,
              access_token_encrypted: String(params[0]),
              refresh_token_encrypted: String(params[1]),
            });
          }
        }
        return { changes: 1 };
      },
    };
  }

  exec(_sql: string): void {
    // Schema represented by mock statement handlers.
  }
}

describe('ConnectorSecretStore', () => {
  it('stores and retrieves connector secrets via namespaced keys', async () => {
    const keyStore = createMemoryKeyStore();
    const store = createConnectorSecretStore(keyStore);

    await store.setSecret('google', 'access_token', 'access-secret');
    await store.setSecret('google', 'refresh_token', 'refresh-secret');

    expect(await store.getSecret('google', 'access_token')).toBe('access-secret');
    expect(await store.getSecret('google', 'refresh_token')).toBe('refresh-secret');
    expect(await keyStore.get(kernelOAuthAccessKey('google'))).toBe('access-secret');
    expect(await keyStore.get(kernelOAuthRefreshKey('google'))).toBe('refresh-secret');
    expect(connectorSecretKey('google', 'access_token')).toBe('kernel.oauth.google.access_token');
  });
});

describe('CapabilityScopedCredentialService', () => {
  const principalId = 'principal-connector-test';
  const sessionId = 'session-connector-test';
  let secretStore: ReturnType<typeof createConnectorSecretStore>;
  let scopedCredential: ReturnType<typeof createCapabilityScopedCredentialService>;
  let nowMs: number;

  beforeEach(async () => {
    nowMs = Date.now();
    secretStore = createConnectorSecretStore(createMemoryKeyStore());
    scopedCredential = createCapabilityScopedCredentialService({
      secretStore,
      localPrincipalId: principalId,
      localDeviceId: 'device-test',
      clock: () => nowMs,
    });
    await secretStore.setSecret('google', 'access_token', 'scoped-access-token');
  });

  it('issues and redeems a credential access grant', async () => {
    const access = await scopedCredential.issueCredentialAccess({
      sessionId,
      principalId,
      provider: 'google',
      secretKind: 'access_token',
      purpose: 'Fetch inbox',
    });

    const secret = await scopedCredential.redeemCredentialAccess(access, principalId, nowMs);
    expect(secret).toBe('scoped-access-token');
  });

  it('denies expired grants', async () => {
    const access = await scopedCredential.issueCredentialAccess({
      sessionId,
      principalId,
      provider: 'google',
      secretKind: 'access_token',
      purpose: 'Fetch inbox',
      ttlMs: 1,
    });

    nowMs += 10;

    await expect(
      scopedCredential.redeemCredentialAccess(access, principalId, nowMs),
    ).rejects.toMatchObject({
      code: 'EXPIRED_GRANT',
    } satisfies Partial<CredentialAccessError>);
  });

  it('denies wrong principal on redeem', async () => {
    const access = await scopedCredential.issueCredentialAccess({
      sessionId,
      principalId,
      provider: 'google',
      secretKind: 'access_token',
      purpose: 'Fetch inbox',
    });

    await expect(
      scopedCredential.redeemCredentialAccess(access, 'other-principal', nowMs),
    ).rejects.toMatchObject({
      code: 'WRONG_PRINCIPAL',
    } satisfies Partial<CredentialAccessError>);
  });

  it('rejects issuance when session principal does not match caller', async () => {
    const keyStore = createMemoryKeyStore();
    const identity = await createDeviceIdentity(keyStore);
    const sessions = createSessionStore();
    const capabilityIssuer = createCapabilityIssuer(identity, sessions, POLICY_EPOCH);

    sessions.put({
      protocolVersion: 1,
      helloNonce: 'nonce-test',
      processId: 'gateway-test',
      processType: 'gateway',
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
      principalId: 'session-owner',
      deviceId: identity.deviceId,
      extensionInstanceId: null,
      sessionId,
      expiresAt: isoAfterMs(60_000),
      sessionPublicKey: 'ed25519:test-session-pub',
      kernelSignature: 'test-signature',
      issuedAtMs: Date.now(),
    });

    const sessionBound = createCapabilityScopedCredentialService({
      secretStore,
      sessions,
      capabilityIssuer,
      clock: () => nowMs,
    });

    await expect(
      sessionBound.issueCredentialAccess({
        sessionId,
        principalId: 'different-principal',
        provider: 'google',
        secretKind: 'access_token',
        purpose: 'Fetch inbox',
      }),
    ).rejects.toMatchObject({
      code: 'WRONG_PRINCIPAL',
    } satisfies Partial<CredentialAccessError>);
  });
});

describe('migrateLegacyOAuthTokensToKernel', () => {
  let db: MockOAuthDatabase;
  let secretStore: ReturnType<typeof createConnectorSecretStore>;
  let encryptionKey: Buffer;

  beforeEach(() => {
    db = new MockOAuthDatabase();
    secretStore = createConnectorSecretStore(createMemoryKeyStore());
    encryptionKey = randomBytes(32);
  });

  afterEach(() => {
    db.rows.clear();
  });

  it('migrates legacy oauth rows and clears plaintext ciphertext', async () => {
    const accessEncrypted = encryptLegacySecret(encryptionKey, 'legacy-access');
    const refreshEncrypted = encryptLegacySecret(encryptionKey, 'legacy-refresh');

    db.prepare(
      `INSERT INTO oauth_tokens (provider, access_token_encrypted, refresh_token_encrypted)
       VALUES ('google', ?, ?)`,
    ).run('google', accessEncrypted, refreshEncrypted);

    const result = await migrateLegacyOAuthTokensToKernel(db, secretStore, encryptionKey);

    expect(result.rowsMigrated).toBe(1);
    expect(result.errors).toEqual([]);
    expect(await secretStore.getSecret('google', 'access_token')).toBe('legacy-access');
    expect(await secretStore.getSecret('google', 'refresh_token')).toBe('legacy-refresh');

    const row = db.rows.get('google');
    expect(row?.access_token_encrypted).toBe(MIGRATED_SENTINEL);
    expect(row?.refresh_token_encrypted).toBe(MIGRATED_SENTINEL);
  });
});

describe('kernel-signed credential grants', () => {
  it('issues kernel-signed grants through CapabilityIssuer', async () => {
    const keyStore = createMemoryKeyStore();
    const secretStore = createConnectorSecretStore(keyStore);
    await secretStore.setSecret('gmail', 'access_token', 'kernel-backed-token');

    const kernel = await createKernel({
      keyStore,
      buildHash: BUILD_HASH,
      policyEpoch: POLICY_EPOCH,
    });

    const hello = ProcessHelloV1.parse({
      protocolVersion: 1,
      processId: 'gateway-01',
      processType: 'gateway',
      buildHash: BUILD_HASH,
      nonce: `nonce-${crypto.randomUUID()}`,
    });

    const session = await kernel.ipc.handleProcessHello({
      hello,
      policyEpoch: POLICY_EPOCH,
      sessionPublicKey: 'ed25519:test-session-pub',
    });

    const identity = await createDeviceIdentity(keyStore);
    const sessions = createSessionStore();
    sessions.put({
      ...session,
      issuedAtMs: Date.now(),
    });
    const capabilityIssuer = createCapabilityIssuer(identity, sessions, POLICY_EPOCH);

    const scoped = createCapabilityScopedCredentialService({
      secretStore,
      sessions,
      capabilityIssuer,
    });

    const access = await scoped.issueCredentialAccess({
      sessionId: session.sessionId,
      principalId: session.principalId,
      provider: 'gmail',
      secretKind: 'access_token',
      purpose: 'Gmail sync',
    });

    expect(access.grant.signature).toMatch(/^ed25519:/);

    const secret = await scoped.redeemCredentialAccess(access, session.principalId);
    expect(secret).toBe('kernel-backed-token');
  });
});
