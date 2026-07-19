/**
 * execution/v1 client — Gateway-side transport for self-hosted node communication.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import { nanoid } from 'nanoid';
import {
  EXECUTION_PROTOCOL_VERSION,
  ExecutionHandshakeAuthV1,
  ExecutionHandshakeChallengeV1,
  ExecutionHandshakeHelloV1,
  ExecutionHandshakeSessionV1,
  ExecutionHealthV1,
  ExecutionModelInventoryV1,
  ExecutionReceiptV1,
  ExecutionTaskEnvelopeV1,
  ExecutionTaskPayloadV1,
  type ExecutionTokensUsed,
} from '@semblance/protocol';

export interface ExecutionV1ClientConfig {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly authToken?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface ExecutionV1TaskRequest {
  readonly modelId: string;
  readonly messages: Array<{ role: string; content: string }>;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly idempotencyKey: string;
}

export interface ExecutionV1TaskResult {
  readonly content: string;
  readonly tokensUsed: ExecutionTokensUsed;
  readonly modelId: string;
  readonly receipt: ExecutionReceiptV1;
}

interface ClientKeyMaterial {
  readonly publicKey: string;
  readonly privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
}

function exportPublicKeyBase64(publicKey: ReturnType<typeof generateKeyPairSync>['publicKey']): string {
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

function hashSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function signMessage(privateKey: ClientKeyMaterial['privateKey'], message: string): string {
  return sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');
}

function verifyMessage(publicKeyBase64: string, message: string, signatureBase64: string): boolean {
  const publicKey = createPublicKey({
    key: Buffer.from(publicKeyBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  return verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(signatureBase64, 'base64'));
}

function encryptPayload(sessionKeyBase64: string, plaintext: string): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const key = Buffer.from(sessionKeyBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

function decryptPayload(
  sessionKeyBase64: string,
  ciphertext: string,
  iv: string,
  authTag: string,
): string {
  const key = Buffer.from(sessionKeyBase64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function sessionSignaturePayload(session: Omit<ExecutionHandshakeSessionV1, 'nodeSignature'>): string {
  return [
    session.protocolVersion,
    session.sessionId,
    session.nodeId,
    session.clientId,
    session.sessionKey,
    session.expiresAt,
    session.compatibleWith.join(','),
  ].join('|');
}

function receiptSignaturePayload(
  receipt: Omit<ExecutionReceiptV1, 'nodeSignature'>,
): string {
  return [
    receipt.protocolVersion,
    receipt.receiptId,
    receipt.taskId,
    receipt.idempotencyKey,
    receipt.nodeId,
    receipt.modelId,
    receipt.taskHash,
    receipt.responseHash,
    receipt.completedAt,
  ].join('|');
}

export class ExecutionV1Client {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly authToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly keyMaterial: ClientKeyMaterial;
  private session: ExecutionHandshakeSessionV1 | null = null;
  private nodePublicKey: string | null = null;

  constructor(config: ExecutionV1ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.clientId = config.clientId;
    this.authToken = config.authToken;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    this.keyMaterial = {
      publicKey: exportPublicKeyBase64(publicKey),
      privateKey,
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`execution/v1 ${path} failed (${response.status}): ${errorText.slice(0, 500)}`);
    }
    return response.json() as Promise<T>;
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`execution/v1 ${path} failed (${response.status}): ${errorText.slice(0, 500)}`);
    }
    return response.json() as Promise<T>;
  }

  async handshake(): Promise<ExecutionHandshakeSessionV1> {
    const hello = ExecutionHandshakeHelloV1.parse({
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      clientId: this.clientId,
      clientPublicKey: this.keyMaterial.publicKey,
      nonce: nanoid(),
      timestamp: new Date().toISOString(),
    });

    const challenge = ExecutionHandshakeChallengeV1.parse(
      await this.postJson('/execution/v1/handshake/hello', hello),
    );
    this.nodePublicKey = challenge.nodePublicKey;

    const authPayload = `${challenge.nodeId}|${challenge.nodeNonce}|${this.clientId}`;
    const auth = ExecutionHandshakeAuthV1.parse({
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      clientId: this.clientId,
      nodeId: challenge.nodeId,
      nodeNonce: challenge.nodeNonce,
      clientSignature: signMessage(this.keyMaterial.privateKey, authPayload),
      timestamp: new Date().toISOString(),
    });

    const session = ExecutionHandshakeSessionV1.parse(
      await this.postJson('/execution/v1/handshake/auth', auth),
    );

    const unsignedSession = {
      protocolVersion: session.protocolVersion,
      compatibleWith: session.compatibleWith,
      sessionId: session.sessionId,
      nodeId: session.nodeId,
      clientId: session.clientId,
      sessionKey: session.sessionKey,
      expiresAt: session.expiresAt,
    };
    if (!verifyMessage(challenge.nodePublicKey, sessionSignaturePayload(unsignedSession), session.nodeSignature)) {
      throw new Error('execution/v1 handshake: invalid node session signature');
    }

    this.session = session;
    return session;
  }

  async getHealth(): Promise<ExecutionHealthV1> {
    return ExecutionHealthV1.parse(await this.getJson('/execution/v1/health'));
  }

  async getInventory(): Promise<ExecutionModelInventoryV1> {
    await this.ensureSession();
    return ExecutionModelInventoryV1.parse(await this.getJson('/execution/v1/inventory'));
  }

  async submitTask(request: ExecutionV1TaskRequest): Promise<ExecutionV1TaskResult> {
    const session = await this.ensureSession();
    const payload = ExecutionTaskPayloadV1.parse({
      messages: request.messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });
    const plaintext = JSON.stringify(payload);
    const taskHash = hashSha256(plaintext);
    const encrypted = encryptPayload(session.sessionKey, plaintext);
    const taskId = nanoid();
    const envelopeUnsigned = {
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      taskId,
      sessionId: session.sessionId,
      idempotencyKey: request.idempotencyKey,
      modelId: request.modelId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      taskHash,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
    const envelope = ExecutionTaskEnvelopeV1.parse({
      ...envelopeUnsigned,
      clientSignature: signMessage(
        this.keyMaterial.privateKey,
        `${taskId}|${request.idempotencyKey}|${taskHash}`,
      ),
    });

    const receipt = ExecutionReceiptV1.parse(
      await this.postJson('/execution/v1/tasks', envelope),
    );

    if (!this.nodePublicKey) {
      throw new Error('execution/v1 task: missing node public key');
    }

    const unsignedReceipt = {
      protocolVersion: receipt.protocolVersion,
      receiptId: receipt.receiptId,
      taskId: receipt.taskId,
      idempotencyKey: receipt.idempotencyKey,
      nodeId: receipt.nodeId,
      modelId: receipt.modelId,
      taskHash: receipt.taskHash,
      responseHash: receipt.responseHash,
      responseCiphertext: receipt.responseCiphertext,
      responseIv: receipt.responseIv,
      responseAuthTag: receipt.responseAuthTag,
      tokensUsed: receipt.tokensUsed,
      durationMs: receipt.durationMs,
      completedAt: receipt.completedAt,
    };
    if (!verifyMessage(this.nodePublicKey, receiptSignaturePayload(unsignedReceipt), receipt.nodeSignature)) {
      throw new Error('execution/v1 task: invalid node receipt signature');
    }

    const responsePlaintext = decryptPayload(
      session.sessionKey,
      receipt.responseCiphertext,
      receipt.responseIv,
      receipt.responseAuthTag,
    );
    const responsePayload = JSON.parse(responsePlaintext) as { content: string };

    return {
      content: responsePayload.content,
      tokensUsed: receipt.tokensUsed,
      modelId: receipt.modelId,
      receipt,
    };
  }

  private async ensureSession(): Promise<ExecutionHandshakeSessionV1> {
    if (this.session && new Date(this.session.expiresAt).getTime() > Date.now()) {
      return this.session;
    }
    return this.handshake();
  }
}

export function createExecutionV1Client(config: ExecutionV1ClientConfig): ExecutionV1Client {
  return new ExecutionV1Client(config);
}
