import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_BUILD_HASH = 'sha256:local-dev';
const DEFAULT_POLICY_EPOCH = 1;

export interface RuntimeEnv {
  buildHash: string;
  policyEpoch: number;
  kernelSocketPath: string | null;
  coreIpcPath: string | null;
  dataDir: string;
  inprocessTransport: boolean;
}

export function parsePolicyEpoch(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? String(DEFAULT_POLICY_EPOCH), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid SEMBLANCE_POLICY_EPOCH: ${raw ?? '(empty)'}`);
  }
  return parsed;
}

export function readRuntimeEnv(): RuntimeEnv {
  return {
    buildHash: process.env.SEMBLANCE_BUILD_HASH ?? DEFAULT_BUILD_HASH,
    policyEpoch: parsePolicyEpoch(process.env.SEMBLANCE_POLICY_EPOCH),
    kernelSocketPath: process.env.SEMBLANCE_KERNEL_SOCKET ?? null,
    coreIpcPath: process.env.SEMBLANCE_CORE_IPC ?? null,
    dataDir: process.env.SEMBLANCE_DATA_DIR ?? join(homedir(), '.semblance'),
    inprocessTransport: process.env.SEMBLANCE_INPROCESS_TRANSPORT === '1',
  };
}
