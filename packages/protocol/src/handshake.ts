import { z } from 'zod';
import { IsoDateTime, ProcessType, ProtocolVersion } from './common.js';

export const ProcessHelloV1 = z
  .object({
    protocolVersion: ProtocolVersion,
    processId: z.string().min(1),
    processType: ProcessType,
    buildHash: z.string().min(1),
    nonce: z.string().min(1),
  })
  .strict();
export type ProcessHelloV1 = z.infer<typeof ProcessHelloV1>;

export const ProcessAckV1 = z
  .object({
    protocolVersion: ProtocolVersion,
    helloNonce: z.string().min(1),
    processId: z.string().min(1),
    processType: ProcessType,
    buildHash: z.string().min(1),
    policyEpoch: z.number().int().nonnegative(),
    principalId: z.string().min(1),
    deviceId: z.string().min(1),
    extensionInstanceId: z.string().nullable(),
    sessionId: z.string().min(1),
    expiresAt: IsoDateTime,
    sessionPublicKey: z.string().min(1),
    kernelSignature: z.string().min(1),
  })
  .strict();
export type ProcessAckV1 = z.infer<typeof ProcessAckV1>;

/** Alias for approved design doc naming — identical shape to ProcessAckV1. */
export const ProcessSessionV1 = ProcessAckV1;
export type ProcessSessionV1 = ProcessAckV1;

export const PROCESS_HELLO_V1_SCHEMA_ID = 'process-hello-v1';
export const PROCESS_ACK_V1_SCHEMA_ID = 'process-ack-v1';
