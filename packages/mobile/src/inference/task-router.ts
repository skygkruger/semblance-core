// Mobile TaskRouter — Routes inference requests: local or tunnel offload.
//
// Uses core's assessTaskComplexity() and shouldOffload() for routing LOGIC.
// Mobile-specific code handles EXECUTION: local inference bridge + tunnel transport.
//
// Routing decision (delegated to core/agent/task-router.ts):
//   - tunnel !ready → local
//   - classify/extract/vision_fast → always local (SmolLM2 handles these)
//   - tokens ≤ threshold → local
//   - tokens > threshold AND tunnel ready → offload to desktop
//   - offload fails → fallback to local silently

import {
  assessTaskComplexity,
  shouldOffload as coreDecideOffload,
  type TaskRoutingDecision,
  type TaskType,
} from '@semblance/core/agent/task-router';

export { type TaskRoutingDecision, type TaskType };

export interface TaskRouterConfig {
  /** Estimated complexity threshold for tunnel offload (tokens). Default: 2048 */
  offloadThresholdTokens?: number;
}

export type RoutingStrategy = 'local' | 'tunnel' | 'degraded';

export interface RoutingStatus {
  strategy: RoutingStrategy;
  reason: string;
  tunnelAvailable: boolean;
  offloadThreshold: number;
}

export interface InferenceRequest {
  taskType: TaskType;
  prompt: string;
  estimatedTokens?: number;
  sessionKey?: string;
  /** Tool names available for this task (used for complexity assessment). */
  tools?: string[];
}

export interface InferenceResponse {
  text: string;
  model: string;
  executedOn: 'local' | 'remote';
  tokensUsed: number;
  durationMs: number;
}

// Transport interface (subset of TunnelTransport)
interface TunnelTransportLike {
  isReady(): boolean;
  send(request: unknown): Promise<unknown>;
}

// Local inference bridge interface
interface LocalInferenceBridge {
  generate(params: { prompt: string; maxTokens?: number; temperature?: number }): Promise<{
    text: string;
    tokensGenerated: number;
  }>;
  isReady(): Promise<boolean>;
}

/**
 * TaskRouter decides whether to execute inference locally or offload to desktop.
 *
 * Routing logic is delegated to core's assessTaskComplexity() and shouldOffload().
 * Execution (local bridge, tunnel transport) is mobile-specific.
 */
export class TaskRouter {
  private tunnelTransport: TunnelTransportLike | null;
  private localBridge: LocalInferenceBridge;
  private offloadThreshold: number;

  constructor(config: {
    tunnelTransport: TunnelTransportLike | null;
    localBridge: LocalInferenceBridge;
    offloadThresholdTokens?: number;
  }) {
    this.tunnelTransport = config.tunnelTransport;
    this.localBridge = config.localBridge;
    this.offloadThreshold = config.offloadThresholdTokens ?? 2048;
  }

  /**
   * Route an inference request: local or tunnel offload.
   * Uses core's assessTaskComplexity + shouldOffload for the decision.
   */
  async route(request: InferenceRequest): Promise<InferenceResponse> {
    const startMs = Date.now();

    // Delegate complexity assessment to core
    const complexity = assessTaskComplexity(
      request.prompt,
      request.taskType,
      request.tools ?? [],
    );

    // Override estimatedTokens if caller provided a manual estimate
    if (request.estimatedTokens !== undefined) {
      complexity.estimatedTokens = request.estimatedTokens;
    }

    // Delegate routing decision to core
    const tunnelAvailable = this.isTunnelAvailable();
    const decision: TaskRoutingDecision = coreDecideOffload(
      complexity,
      tunnelAvailable,
      true, // localModelCapable — mobile always has a local model loaded
      this.offloadThreshold,
    );

    if (decision === 'offload') {
      try {
        return await this.executeRemote(request, startMs);
      } catch (error) {
        // Graceful fallback — user never sees a failure
        console.warn('[TaskRouter] Tunnel offload failed, falling back to local:', (error as Error).message);
        return this.executeLocal(request, startMs);
      }
    }

    // 'local' or 'degraded' — both execute locally on mobile
    return this.executeLocal(request, startMs);
  }

  /**
   * Check if tunnel offload is currently available.
   */
  isTunnelAvailable(): boolean {
    return this.tunnelTransport?.isReady() ?? false;
  }

  /**
   * Get current routing strategy for display in UI.
   */
  getRoutingStatus(): RoutingStatus {
    const tunnelAvailable = this.isTunnelAvailable();

    if (!this.tunnelTransport) {
      return {
        strategy: 'local',
        reason: 'No paired device — running locally',
        tunnelAvailable: false,
        offloadThreshold: this.offloadThreshold,
      };
    }

    if (!tunnelAvailable) {
      return {
        strategy: 'degraded',
        reason: 'Paired device offline — running locally until reconnect',
        tunnelAvailable: false,
        offloadThreshold: this.offloadThreshold,
      };
    }

    return {
      strategy: 'tunnel',
      reason: 'Desktop available — complex tasks offload automatically',
      tunnelAvailable: true,
      offloadThreshold: this.offloadThreshold,
    };
  }

  /**
   * Update the tunnel transport (e.g., when a device connects/disconnects).
   */
  setTunnelTransport(transport: TunnelTransportLike | null): void {
    this.tunnelTransport = transport;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async executeLocal(request: InferenceRequest, startMs: number): Promise<InferenceResponse> {
    const result = await this.localBridge.generate({
      prompt: request.prompt,
      maxTokens: 1024,
      temperature: 0.7,
    });

    return {
      text: result.text,
      model: 'local',
      executedOn: 'local',
      tokensUsed: result.tokensGenerated,
      durationMs: Date.now() - startMs,
    };
  }

  private async executeRemote(request: InferenceRequest, startMs: number): Promise<InferenceResponse> {
    if (!this.tunnelTransport) {
      throw new Error('No tunnel transport available');
    }

    const actionRequest = {
      id: `mobile-offload-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'inference.offload',
      payload: {
        taskType: request.taskType,
        prompt: request.prompt,
        sessionKey: request.sessionKey,
      },
      source: 'core' as const,
      signature: '', // Signed by the IPC layer
    };

    const result = await this.tunnelTransport.send(actionRequest) as {
      data?: { text: string; model: string; tokensUsed: number };
    };

    return {
      text: result.data?.text ?? '',
      model: result.data?.model ?? 'remote',
      executedOn: 'remote',
      tokensUsed: result.data?.tokensUsed ?? 0,
      durationMs: Date.now() - startMs,
    };
  }
}
