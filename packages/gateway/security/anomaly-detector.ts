// Anomaly Detector — Flags unusual request patterns for user review.
// Does not block by default; flags for approval. The UI surfaces these.

export interface AnomalyConfig {
  burstThreshold?: number;     // Max requests within burst window (default: 10)
  burstWindowMs?: number;      // Burst detection window (default: 5000ms)
  maxPayloadBytes?: number;    // Max payload size in bytes (default: 1MB)
}

export type AnomalyType = 'burst' | 'new_domain' | 'large_payload';

export interface AnomalyResult {
  flagged: boolean;
  anomalies: Array<{
    type: AnomalyType;
    message: string;
  }>;
}

const DEFAULT_BURST_THRESHOLD = 10;
const DEFAULT_BURST_WINDOW_MS = 5000;
const DEFAULT_MAX_PAYLOAD_BYTES = 1_000_000; // 1MB

export class AnomalyDetector {
  private recentTimestamps: number[] = [];
  private seenDomains: Set<string> = new Set();
  private burstThreshold: number;
  private burstWindowMs: number;
  private maxPayloadBytes: number;

  constructor(config?: AnomalyConfig) {
    this.burstThreshold = config?.burstThreshold ?? DEFAULT_BURST_THRESHOLD;
    this.burstWindowMs = config?.burstWindowMs ?? DEFAULT_BURST_WINDOW_MS;
    this.maxPayloadBytes = config?.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  }

  /**
   * Check a request for anomalies.
   * Returns which anomalies were detected (if any).
   */
  check(params: {
    payload: Record<string, unknown>;
    targetDomain?: string;
  }): AnomalyResult {
    const anomalies: AnomalyResult['anomalies'] = [];
    const now = Date.now();

    // Burst detection
    this.recentTimestamps.push(now);
    this.recentTimestamps = this.recentTimestamps.filter(
      t => t > now - this.burstWindowMs
    );
    if (this.recentTimestamps.length > this.burstThreshold) {
      anomalies.push({
        type: 'burst',
        message: `Burst detected: ${this.recentTimestamps.length} requests in ${this.burstWindowMs}ms (threshold: ${this.burstThreshold})`,
      });
    }

    // New domain detection
    if (params.targetDomain) {
      if (!this.seenDomains.has(params.targetDomain)) {
        this.seenDomains.add(params.targetDomain);
        anomalies.push({
          type: 'new_domain',
          message: `First request to new domain: ${params.targetDomain}`,
        });
      }
    }

    // Large payload detection
    const payloadSize = Buffer.byteLength(JSON.stringify(params.payload), 'utf-8');
    if (payloadSize > this.maxPayloadBytes) {
      anomalies.push({
        type: 'large_payload',
        message: `Payload size ${payloadSize} bytes exceeds limit of ${this.maxPayloadBytes} bytes`,
      });
    }

    return {
      flagged: anomalies.length > 0,
      anomalies,
    };
  }

  /**
   * Mark a domain as seen (e.g., loaded from allowlist on startup).
   */
  markDomainSeen(domain: string): void {
    this.seenDomains.add(domain);
  }

  /**
   * Reset state. Used for testing.
   */
  reset(): void {
    this.recentTimestamps = [];
    this.seenDomains.clear();
  }
}
