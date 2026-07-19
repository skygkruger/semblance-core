import { z } from 'zod';
import {
  ExecutionCompatibleWithField,
  ExecutionProtocolVersionField,
  IsoDateTime,
} from './common.js';

/** Gateway → node: initiate mutual authentication. */
export const ExecutionHandshakeHelloV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    clientId: z.string().min(1),
    clientPublicKey: z.string().min(1),
    nonce: z.string().min(1),
    timestamp: IsoDateTime,
  })
  .strict();
export type ExecutionHandshakeHelloV1 = z.infer<typeof ExecutionHandshakeHelloV1>;

/** Node → gateway: challenge with node identity and compatible protocol markers. */
export const ExecutionHandshakeChallengeV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    compatibleWith: ExecutionCompatibleWithField,
    nodeId: z.string().min(1),
    nodePublicKey: z.string().min(1),
    helloNonce: z.string().min(1),
    nodeNonce: z.string().min(1),
    buildHash: z.string().min(1),
    timestamp: IsoDateTime,
  })
  .strict();
export type ExecutionHandshakeChallengeV1 = z.infer<typeof ExecutionHandshakeChallengeV1>;

/** Gateway → node: prove client identity by signing the node challenge. */
export const ExecutionHandshakeAuthV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    clientId: z.string().min(1),
    nodeId: z.string().min(1),
    nodeNonce: z.string().min(1),
    clientSignature: z.string().min(1),
    timestamp: IsoDateTime,
  })
  .strict();
export type ExecutionHandshakeAuthV1 = z.infer<typeof ExecutionHandshakeAuthV1>;

/** Node → gateway: authenticated session with signed session key material. */
export const ExecutionHandshakeSessionV1 = z
  .object({
    protocolVersion: ExecutionProtocolVersionField,
    compatibleWith: ExecutionCompatibleWithField,
    sessionId: z.string().min(1),
    nodeId: z.string().min(1),
    clientId: z.string().min(1),
    sessionKey: z.string().min(1),
    expiresAt: IsoDateTime,
    nodeSignature: z.string().min(1),
  })
  .strict();
export type ExecutionHandshakeSessionV1 = z.infer<typeof ExecutionHandshakeSessionV1>;

export const EXECUTION_HANDSHAKE_HELLO_V1_SCHEMA_ID = 'execution-handshake-hello-v1';
export const EXECUTION_HANDSHAKE_CHALLENGE_V1_SCHEMA_ID = 'execution-handshake-challenge-v1';
export const EXECUTION_HANDSHAKE_AUTH_V1_SCHEMA_ID = 'execution-handshake-auth-v1';
export const EXECUTION_HANDSHAKE_SESSION_V1_SCHEMA_ID = 'execution-handshake-session-v1';
