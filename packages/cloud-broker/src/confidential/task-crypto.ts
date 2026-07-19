import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import { minimizeTask } from '../task-minimizer.js';

const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');
const KEY_DERIVATION_INFO = 'semblance-confidential-v1';

export const DEFAULT_MAX_DISCLOSURE_BYTES = 8192;

export interface ConfidentialTaskPlaintext {
  readonly messages: Array<{ role: string; content: string }>;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly subagentId: string;
  readonly domain: string;
  readonly taskType: string;
}

export interface SessionKeyMaterial {
  readonly devicePrivateKey: KeyObject;
  readonly aesKey: Buffer;
}

export interface PreparedConfidentialTask {
  readonly deviceEphemeralPublicKey: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly promptContentHash: string;
  readonly disclosureBytes: number;
  readonly sessionMaterial: SessionKeyMaterial;
}

export interface EncryptedConfidentialResponse {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
}

export interface PrepareConfidentialTaskParams {
  readonly messages: ReadonlyArray<{ role: string; content: string }>;
  readonly excludedCategories: readonly string[];
  readonly maxDisclosureBytes: number;
  readonly workloadEphemeralPublicKey: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly subagentId: string;
  readonly domain: string;
  readonly taskType: string;
}

export type PrepareConfidentialTaskResult =
  | PreparedConfidentialTask
  | { readonly ok: false; readonly reason: string };

function importRawX25519PublicKey(base64url: string): KeyObject {
  const raw = Buffer.from(base64url, 'base64url');
  if (raw.length !== 32) {
    throw new Error('invalid_x25519_public_key_length');
  }
  return createPublicKey({
    key: Buffer.concat([X25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

function exportRawX25519PublicKey(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  return jwk.x;
}

function deriveAesKey(sharedSecret: Buffer): Buffer {
  return createHash('sha256').update(sharedSecret).update(KEY_DERIVATION_INFO, 'utf8').digest();
}

function secureZeroBuffer(buf: Buffer): void {
  buf.fill(0);
}

export function eraseSessionKeyMaterial(material: SessionKeyMaterial): void {
  secureZeroBuffer(material.aesKey);
}

export function prepareConfidentialTask(
  params: PrepareConfidentialTaskParams,
): PrepareConfidentialTaskResult {
  const minimization = minimizeTask(params.messages, params.excludedCategories);
  const plaintextPayload: ConfidentialTaskPlaintext = {
    messages: minimization.messages,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    subagentId: params.subagentId,
    domain: params.domain,
    taskType: params.taskType,
  };

  const plaintextJson = JSON.stringify(plaintextPayload);
  const disclosureBytes = Buffer.byteLength(plaintextJson, 'utf8');

  if (disclosureBytes > params.maxDisclosureBytes) {
    return { ok: false, reason: 'max_disclosure_bytes_exceeded' };
  }

  const promptContentHash = createHash('sha256').update(plaintextJson, 'utf8').digest('hex');

  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const workloadKey = importRawX25519PublicKey(params.workloadEphemeralPublicKey);
  const sharedSecret = diffieHellman({ publicKey: workloadKey, privateKey });
  const aesKey = deriveAesKey(sharedSecret);
  secureZeroBuffer(sharedSecret);

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextJson, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    deviceEphemeralPublicKey: exportRawX25519PublicKey(publicKey),
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64url'),
    authTag: authTag.toString('base64url'),
    promptContentHash,
    disclosureBytes,
    sessionMaterial: { devicePrivateKey: privateKey, aesKey: Buffer.from(aesKey) },
  };
}

/** Test/workload helper: encrypt a confidential response with the same session AES key. */
export function encryptConfidentialResponse(
  aesKey: Buffer,
  content: string,
): EncryptedConfidentialResponse {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const payload = JSON.stringify({ content });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptConfidentialResponse(
  material: SessionKeyMaterial,
  response: EncryptedConfidentialResponse,
): { content: string } {
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      material.aesKey,
      Buffer.from(response.iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(response.authTag, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(response.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const parsed = JSON.parse(decrypted) as { content: string };
    if (typeof parsed.content !== 'string') {
      throw new Error('invalid_confidential_response_payload');
    }
    return { content: parsed.content };
  } finally {
    eraseSessionKeyMaterial(material);
  }
}
