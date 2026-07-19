import { createHash, randomBytes } from 'node:crypto';
import {
  CONFIDENTIAL_NO_FALLBACK,
  type CloudBudgetStore,
  type ConfidentialAttestationEvidence,
} from '@semblance/kernel';
import type { ExecutionDestinationDecision } from '@semblance/kernel';
import {
  buildConfidentialProofBundle,
  type ConfidentialProofBundle,
} from '../../proof/src/confidential-proof-bundle.js';
import { resolveUnitPriceCents } from '../../proof/src/usage-receipt.js';
import { AttestationClient } from './confidential/attestation-client.js';
import {
  DEFAULT_MAX_DISCLOSURE_BYTES,
  decryptConfidentialResponse,
  prepareConfidentialTask,
} from './confidential/task-crypto.js';
import { VoucherWallet } from './confidential/voucher-wallet.js';
import { createByoDestinationAdapter } from './destinations/byo.js';
import { createConfidentialDestinationAdapter } from './destinations/confidential.js';
import { createLocalDestinationAdapter } from './destinations/local.js';
import { createSelfHostedDestinationAdapter } from './destinations/self-hosted.js';
import { minimizeTask } from './task-minimizer.js';
import type {
  ExecutionRequest,
  ExecutionResult,
  GatewayOpaqueTransport,
  LocalExecutionTransport,
  PolicyDecider,
} from './types.js';

export interface CloudBrokerConfig {
  readonly policyDecider: PolicyDecider;
  readonly gatewayTransport: GatewayOpaqueTransport;
  readonly localTransport: LocalExecutionTransport;
  readonly attestationClient?: AttestationClient;
  readonly voucherWallet?: VoucherWallet;
  readonly cloudBudgetStore?: CloudBudgetStore;
  readonly defaultMaxDisclosureBytes?: number;
  readonly proofSigningKey?: Buffer;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export class CloudBroker {
  private readonly policyDecider: PolicyDecider;
  private readonly localAdapter: LocalExecutionTransport;
  private readonly byoAdapter: Pick<GatewayOpaqueTransport, 'execute'>;
  private readonly selfHostedAdapter: Pick<GatewayOpaqueTransport, 'execute'>;
  private readonly confidentialAdapter: Pick<GatewayOpaqueTransport, 'executeConfidential'>;
  private readonly attestationClient?: AttestationClient;
  private readonly voucherWallet?: VoucherWallet;
  private readonly cloudBudgetStore?: CloudBudgetStore;
  private readonly defaultMaxDisclosureBytes: number;
  private readonly proofSigningKey: Buffer;

  constructor(config: CloudBrokerConfig) {
    this.policyDecider = config.policyDecider;
    this.localAdapter = createLocalDestinationAdapter(config.localTransport);
    this.byoAdapter = createByoDestinationAdapter(config.gatewayTransport);
    this.selfHostedAdapter = createSelfHostedDestinationAdapter(config.gatewayTransport);
    this.confidentialAdapter = createConfidentialDestinationAdapter(config.gatewayTransport);
    this.attestationClient = config.attestationClient;
    this.voucherWallet = config.voucherWallet;
    this.cloudBudgetStore = config.cloudBudgetStore;
    this.defaultMaxDisclosureBytes = config.defaultMaxDisclosureBytes ?? DEFAULT_MAX_DISCLOSURE_BYTES;
    this.proofSigningKey = config.proofSigningKey ?? randomBytes(32);
  }

  decide(request: ExecutionRequest): ExecutionDestinationDecision {
    return this.policyDecider(request.policyInput);
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const decision = this.decide(request);

    if (decision.destination === 'ask') {
      return {
        status: 'ask',
        reason: decision.reason,
        requiresConsent: true,
      };
    }

    if (decision.destination === 'reject') {
      return {
        status: 'reject',
        reason: decision.reason,
      };
    }

    if (decision.destination === 'confidential') {
      return this.executeConfidential(request, decision);
    }

    const minimization = minimizeTask(request.messages, request.excludedCategories);
    const promptContentHash = hashContent(minimization.messages.map((message) => message.content).join('\n'));

    if (decision.destination === 'local') {
      const localResult = await this.localAdapter.execute({
        messages: minimization.messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        subagentId: request.subagentId,
        domain: request.domain,
        taskType: request.taskType,
      });

      return {
        status: 'success',
        destination: 'local',
        content: localResult.content,
        tokensUsed: localResult.tokensUsed,
        model: localResult.model,
        provider: localResult.provider,
        reason: decision.reason,
        minimization: {
          tokensBefore: minimization.tokensBefore,
          tokensAfter: minimization.tokensAfter,
        },
      };
    }

    if (decision.destination === 'byo') {
      const provider = request.provider ?? 'openai';
      const model = request.model ?? 'gpt-4o-mini';
      const remoteResult = await this.byoAdapter.execute({
        requestId: request.requestId,
        destination: 'byo',
        provider,
        model,
        messages: minimization.messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        subagentId: request.subagentId,
        domain: request.domain,
        taskType: request.taskType,
        promptContentHash,
      });

      return {
        status: 'success',
        destination: 'byo',
        content: remoteResult.content,
        tokensUsed: remoteResult.tokensUsed,
        model: remoteResult.model,
        provider: remoteResult.provider,
        reason: decision.reason,
        minimization: {
          tokensBefore: minimization.tokensBefore,
          tokensAfter: minimization.tokensAfter,
        },
        disclosureReceipt: remoteResult.disclosureReceipt,
      };
    }

    if (decision.destination === 'self_hosted') {
      const nodeId = request.selfHostedNodeId ?? 'default';
      const remoteResult = await this.selfHostedAdapter.execute({
        requestId: request.requestId,
        destination: 'self_hosted',
        provider: 'self_hosted',
        model: request.model ?? 'default',
        messages: minimization.messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        subagentId: request.subagentId,
        domain: request.domain,
        taskType: request.taskType,
        selfHostedNodeId: nodeId,
        promptContentHash,
      });

      return {
        status: 'success',
        destination: 'self_hosted',
        content: remoteResult.content,
        tokensUsed: remoteResult.tokensUsed,
        model: remoteResult.model,
        provider: remoteResult.provider,
        reason: decision.reason,
        minimization: {
          tokensBefore: minimization.tokensBefore,
          tokensAfter: minimization.tokensAfter,
        },
        disclosureReceipt: remoteResult.disclosureReceipt,
      };
    }

    return {
      status: 'reject',
      reason: `unsupported_destination:${decision.destination}`,
    };
  }

  private async executeConfidential(
    request: ExecutionRequest,
    decision: ExecutionDestinationDecision,
  ): Promise<ExecutionResult> {
    if (CONFIDENTIAL_NO_FALLBACK && decision.destination !== 'confidential') {
      return {
        status: 'reject',
        reason: 'confidential_no_fallback',
      };
    }

    if (!this.attestationClient) {
      return {
        status: 'reject',
        reason: 'confidential_attestation_client_unconfigured',
      };
    }

    if (!this.voucherWallet) {
      return {
        status: 'reject',
        reason: 'confidential_voucher_wallet_unconfigured',
      };
    }

    const modelClass = request.modelClass ?? 'inference-standard';
    const estimatedCostCents = resolveUnitPriceCents(modelClass);

    if (this.cloudBudgetStore) {
      const budgetCheck = this.cloudBudgetStore.checkBeforeDisclosure({
        estimatedCostCents,
        destination: 'confidential',
        modelClass,
        voucherAvailable: this.voucherWallet.unspentCount() > 0,
      });
      if (!budgetCheck.allowed) {
        return {
          status: 'reject',
          reason: budgetCheck.reason,
        };
      }
    } else if (this.voucherWallet.unspentCount() === 0) {
      return {
        status: 'reject',
        reason: 'no_voucher_available',
      };
    }

    const voucherSpend = this.voucherWallet.spendRandom();
    if (!voucherSpend) {
      return {
        status: 'reject',
        reason: 'no_voucher_available',
      };
    }

    const attestation = await this.attestationClient.verifyAndBind({
      evidence: request.attestationEvidence,
    });

    if (!attestation.allowed || !attestation.boundEphemeralPublicKey) {
      return {
        status: 'reject',
        reason: attestation.reason,
      };
    }

    const maxDisclosureBytes = request.maxDisclosureBytes ?? this.defaultMaxDisclosureBytes;
    const prepared = prepareConfidentialTask({
      messages: request.messages,
      excludedCategories: request.excludedCategories,
      maxDisclosureBytes,
      workloadEphemeralPublicKey: attestation.boundEphemeralPublicKey,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      subagentId: request.subagentId,
      domain: request.domain,
      taskType: request.taskType,
    });

    if ('ok' in prepared) {
      return {
        status: 'reject',
        reason: prepared.reason,
      };
    }

    const encryptedTask = prepared;
    const model = request.model ?? 'confidential-default';
    const evidence = request.attestationEvidence as ConfidentialAttestationEvidence | undefined;

    try {
      const remoteResult = await this.confidentialAdapter.executeConfidential({
        requestId: request.requestId,
        destination: 'confidential',
        deviceEphemeralPublicKey: encryptedTask.deviceEphemeralPublicKey,
        ciphertext: encryptedTask.ciphertext,
        iv: encryptedTask.iv,
        authTag: encryptedTask.authTag,
        promptContentHash: encryptedTask.promptContentHash,
        model,
        maxTokens: request.maxTokens,
        subagentId: request.subagentId,
        domain: request.domain,
        taskType: request.taskType,
        voucher: voucherSpend.proof,
      });

      const decrypted = decryptConfidentialResponse(encryptedTask.sessionMaterial, {
        ciphertext: remoteResult.ciphertext,
        iv: remoteResult.iv,
        authTag: remoteResult.authTag,
      });

      const minimization = minimizeTask(request.messages, request.excludedCategories);
      const actualCostCents = resolveUnitPriceCents(voucherSpend.proof.coarseClass);
      this.cloudBudgetStore?.recordSpend(actualCostCents);

      let confidentialProof: ConfidentialProofBundle | undefined;
      if (evidence) {
        confidentialProof = buildConfidentialProofBundle({
          requestId: request.requestId,
          purpose: `${request.domain}.${request.taskType}`,
          disclosedFieldNames: ['messages', 'maxTokens', 'temperature', 'subagentId', 'domain', 'taskType'],
          disclosedBytes: encryptedTask.disclosureBytes,
          promptContentHash: encryptedTask.promptContentHash,
          responseContentHash: remoteResult.responseContentHash,
          evidenceId: evidence.evidenceId,
          workloadId: evidence.workloadId,
          measurement: evidence.measurement,
          policyVersion: evidence.policyVersion,
          tcbVersion: evidence.tcbVersion,
          issuerKeyId: evidence.issuerKeyId,
          validFrom: evidence.validFrom,
          validUntil: evidence.validUntil,
          modelClass: voucherSpend.proof.coarseClass,
          quantity: voucherSpend.proof.quantity,
          spentDigest: voucherSpend.proof.spentDigest,
          billingPeriod: voucherSpend.proof.billingPeriod,
          redeemedAt: voucherSpend.usageReceipt.redeemedAt,
          voucherIssuerKeyId: voucherSpend.proof.issuerKeyId,
          result: 'success',
          signingKey: this.proofSigningKey,
        });
      }

      return {
        status: 'success',
        destination: 'confidential',
        content: decrypted.content,
        tokensUsed: remoteResult.tokensUsed,
        model: remoteResult.model,
        provider: remoteResult.provider,
        reason: decision.reason,
        minimization: {
          tokensBefore: minimization.tokensBefore,
          tokensAfter: minimization.tokensAfter,
        },
        confidentialProof,
      };
    } catch {
      return {
        status: 'reject',
        reason: 'confidential_execution_failed',
      };
    }
  }
}
