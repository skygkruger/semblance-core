export interface KernelReadiness {
  protocolVersion: 1;
  buildHash: string;
  policyEpoch: number;
  deviceId: string;
  registeredProcessTypes: readonly string[];
}

export function createKernelReadiness(input: {
  buildHash: string;
  policyEpoch: number;
  deviceId: string;
  registeredProcessTypes: readonly string[];
}): KernelReadiness {
  return {
    protocolVersion: 1,
    buildHash: input.buildHash,
    policyEpoch: input.policyEpoch,
    deviceId: input.deviceId,
    registeredProcessTypes: input.registeredProcessTypes,
  };
}
