import type { CapabilityGrantV1, SensitivityLevel } from '@semblance/protocol';
import { VaultCapabilityError } from './errors.js';

export interface VaultCapabilityGuardContext {
  principalId: string;
  dataDomain: string;
  sensitivity: SensitivityLevel;
  resultLimit: number;
  nowMs: number;
}

const SENSITIVITY_RANK: Record<SensitivityLevel, number> = {
  public: 0,
  personal: 1,
  sensitive: 2,
  restricted: 3,
};

function getAllowedDomains(grant: CapabilityGrantV1): string[] | undefined {
  const scopeDomains = grant.dataScope?.domains;
  if (scopeDomains && scopeDomains.length > 0) {
    return scopeDomains;
  }

  const constraintDomains = grant.constraints.domains;
  if (constraintDomains && constraintDomains.length > 0) {
    return constraintDomains;
  }

  return undefined;
}

function exceedsSensitivityCeiling(
  requested: SensitivityLevel,
  ceiling: SensitivityLevel,
): boolean {
  return SENSITIVITY_RANK[requested] > SENSITIVITY_RANK[ceiling];
}

export function assertVaultCapability(
  grant: CapabilityGrantV1,
  operation: string,
  context: VaultCapabilityGuardContext,
): void {
  if (grant.resource !== 'vault') {
    throw new VaultCapabilityError(
      'OPERATION_NOT_PERMITTED',
      `Capability resource "${grant.resource}" is not vault`,
    );
  }

  if (grant.principalId !== context.principalId) {
    throw new VaultCapabilityError(
      'WRONG_PRINCIPAL',
      `Capability principal "${grant.principalId}" does not match caller "${context.principalId}"`,
    );
  }

  const expiresAtMs = Date.parse(grant.expiresAt);
  if (Number.isNaN(expiresAtMs) || context.nowMs >= expiresAtMs) {
    throw new VaultCapabilityError(
      'EXPIRED_GRANT',
      `Capability "${grant.capabilityId}" expired at ${grant.expiresAt}`,
    );
  }

  if (!grant.operations.includes(operation)) {
    throw new VaultCapabilityError(
      'OPERATION_NOT_PERMITTED',
      `Operation "${operation}" is not permitted by capability "${grant.capabilityId}"`,
    );
  }

  const allowedDomains = getAllowedDomains(grant);
  if (allowedDomains !== undefined && !allowedDomains.includes(context.dataDomain)) {
    throw new VaultCapabilityError(
      'WRONG_DATA_DOMAIN',
      `Data domain "${context.dataDomain}" is outside capability scope [${allowedDomains.join(', ')}]`,
    );
  }

  const resultLimit = grant.constraints.resultLimit;
  if (resultLimit !== undefined && context.resultLimit > resultLimit) {
    throw new VaultCapabilityError(
      'EXCESSIVE_RESULT_LIMIT',
      `Requested result limit ${context.resultLimit} exceeds capability limit ${resultLimit}`,
    );
  }

  const sensitivityCeiling = grant.constraints.sensitivityCeiling;
  if (
    sensitivityCeiling !== undefined &&
    exceedsSensitivityCeiling(context.sensitivity, sensitivityCeiling)
  ) {
    throw new VaultCapabilityError(
      'SENSITIVITY_CEILING',
      `Requested sensitivity "${context.sensitivity}" exceeds ceiling "${sensitivityCeiling}"`,
    );
  }
}
