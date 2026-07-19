/**
 * Approved confidential workload measurements and rotation policy.
 * Kernel is sole authority — Broker cannot approve measurements.
 */

export const CONFIDENTIAL_NO_FALLBACK = true as const;

export const CURRENT_MEASUREMENT_POLICY_VERSION = '2026-07-19';

const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface MeasurementPolicyRecord {
  readonly version: string;
  readonly approvedMeasurements: readonly string[];
  readonly minimumTcbVersion: string;
  readonly effectiveFrom: string;
  readonly retiredAt?: string;
}

const policyRecords = new Map<string, MeasurementPolicyRecord>([
  [
    CURRENT_MEASUREMENT_POLICY_VERSION,
    {
      version: CURRENT_MEASUREMENT_POLICY_VERSION,
      approvedMeasurements: [],
      minimumTcbVersion: '20260719',
      effectiveFrom: '2026-07-19T00:00:00.000Z',
    },
  ],
]);

function assertSha256Digest(value: string, label: string): void {
  if (!SHA256_HEX.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 hex digest`);
  }
}

function assertTcbVersion(value: string, label: string): void {
  if (!/^\d{8,}$/.test(value)) {
    throw new Error(`${label} must be a numeric monotonic TCB version (YYYYMMDD…)`);
  }
}

export function compareTcbVersions(left: string, right: string): number {
  assertTcbVersion(left, 'left TCB version');
  assertTcbVersion(right, 'right TCB version');
  const leftNum = BigInt(left);
  const rightNum = BigInt(right);
  if (leftNum === rightNum) return 0;
  return leftNum > rightNum ? 1 : -1;
}

export function getMeasurementPolicy(policyVersion: string): MeasurementPolicyRecord | undefined {
  const record = policyRecords.get(policyVersion);
  if (!record || record.retiredAt !== undefined) {
    return undefined;
  }
  return record;
}

export function listActiveMeasurementPolicies(): readonly MeasurementPolicyRecord[] {
  return [...policyRecords.values()].filter((record) => record.retiredAt === undefined);
}

export function isMeasurementApproved(measurement: string, policyVersion: string): boolean {
  assertSha256Digest(measurement, 'measurement');
  const policy = getMeasurementPolicy(policyVersion);
  if (!policy) {
    return false;
  }
  return policy.approvedMeasurements.includes(measurement);
}

export interface RotateMeasurementPolicyInput {
  readonly version: string;
  readonly approvedMeasurements: readonly string[];
  readonly minimumTcbVersion: string;
  readonly effectiveFrom: string;
  readonly retirePreviousVersion?: string;
}

export function rotateMeasurementPolicy(input: RotateMeasurementPolicyInput): MeasurementPolicyRecord {
  if (policyRecords.has(input.version)) {
    throw new Error(`Measurement policy "${input.version}" already exists`);
  }

  const uniqueMeasurements = [...new Set(input.approvedMeasurements)];
  for (const measurement of uniqueMeasurements) {
    assertSha256Digest(measurement, 'approved measurement');
  }

  assertTcbVersion(input.minimumTcbVersion, 'minimumTcbVersion');

  if (input.retirePreviousVersion) {
    const previous = policyRecords.get(input.retirePreviousVersion);
    if (!previous) {
      throw new Error(`Cannot retire unknown policy version "${input.retirePreviousVersion}"`);
    }
    policyRecords.set(input.retirePreviousVersion, {
      ...previous,
      retiredAt: new Date().toISOString(),
    });
  }

  const record: MeasurementPolicyRecord = {
    version: input.version,
    approvedMeasurements: uniqueMeasurements,
    minimumTcbVersion: input.minimumTcbVersion,
    effectiveFrom: input.effectiveFrom,
  };

  policyRecords.set(input.version, record);
  return record;
}

export function isTcbDowngrade(tcbVersion: string, policyVersion: string): boolean {
  assertTcbVersion(tcbVersion, 'tcbVersion');
  const policy = getMeasurementPolicy(policyVersion);
  if (!policy) {
    return true;
  }
  return compareTcbVersions(tcbVersion, policy.minimumTcbVersion) < 0;
}

/** Test-only: replace or seed a policy version. */
export function setMeasurementPolicyForTests(record: MeasurementPolicyRecord): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setMeasurementPolicyForTests is test-only');
  }
  policyRecords.set(record.version, record);
}

/** Test-only: restore default policy state. */
export function resetMeasurementPoliciesForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetMeasurementPoliciesForTests is test-only');
  }
  policyRecords.clear();
  policyRecords.set(CURRENT_MEASUREMENT_POLICY_VERSION, {
    version: CURRENT_MEASUREMENT_POLICY_VERSION,
    approvedMeasurements: [],
    minimumTcbVersion: '20260719',
    effectiveFrom: '2026-07-19T00:00:00.000Z',
  });
}
