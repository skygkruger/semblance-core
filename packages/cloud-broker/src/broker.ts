import { createHash } from 'node:crypto';
import type { ExecutionDestinationDecision } from '@semblance/kernel';
import { createByoDestinationAdapter } from './destinations/byo.js';
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
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export class CloudBroker {
  private readonly policyDecider: PolicyDecider;
  private readonly localAdapter: LocalExecutionTransport;
  private readonly byoAdapter: Pick<GatewayOpaqueTransport, 'execute'>;
  private readonly selfHostedAdapter: Pick<GatewayOpaqueTransport, 'execute'>;

  constructor(config: CloudBrokerConfig) {
    this.policyDecider = config.policyDecider;
    this.localAdapter = createLocalDestinationAdapter(config.localTransport);
    this.byoAdapter = createByoDestinationAdapter(config.gatewayTransport);
    this.selfHostedAdapter = createSelfHostedDestinationAdapter(config.gatewayTransport);
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
}
