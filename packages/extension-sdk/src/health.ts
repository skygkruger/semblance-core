/**
 * Health contract — extensions report sandbox health to the runner/kernel.
 */

export type ExtensionHealthStatusV1 = 'healthy' | 'degraded' | 'unhealthy';

export interface ExtensionHealthCheckV1 {
  name: string;
  status: ExtensionHealthStatusV1;
  message?: string;
  observedAt: string;
}

export interface ExtensionHealthReportV1 {
  extensionId: string;
  status: ExtensionHealthStatusV1;
  checks: ExtensionHealthCheckV1[];
  reportedAt: string;
}

export interface ExtensionHealthPingResultV1 {
  ok: boolean;
  latencyMs: number;
}

export interface ExtensionHealthClient {
  report(report: ExtensionHealthReportV1): Promise<void>;
  ping(): Promise<ExtensionHealthPingResultV1>;
}
