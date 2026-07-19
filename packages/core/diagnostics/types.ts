export interface DiagnosticLogEntry {
  readonly timestamp: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

export interface DiagnosticBundle {
  readonly schemaVersion: 1;
  readonly bundleId: string;
  readonly generatedAt: string;
  readonly appVersion: string;
  readonly buildHash: string | null;
  readonly platform: string;
  readonly featureFlags: Record<string, boolean>;
  readonly logs: readonly DiagnosticLogEntry[];
  readonly redacted: boolean;
}

export interface DiagnosticBundleContext {
  readonly appVersion?: string;
  readonly buildHash?: string | null;
  readonly platform?: string;
  readonly featureFlags?: Record<string, boolean>;
  readonly logs?: readonly DiagnosticLogEntry[];
}

export interface DiagnosticBundlePreview {
  readonly bundle: DiagnosticBundle;
  readonly byteSize: number;
  readonly sensitiveFieldCount: number;
  readonly redactedFieldCount: number;
}

export interface DiagnosticShareRequest {
  readonly schemaVersion: 1;
  readonly bundleId: string;
  readonly redactedBundle: DiagnosticBundle;
  readonly transport: 'gateway.support.upload';
  readonly requiresUserConsent: true;
  readonly message: string;
}

export interface DiagnosticBundleService {
  generateBundle(context?: DiagnosticBundleContext): DiagnosticBundle;
  previewBundle(bundle: DiagnosticBundle): DiagnosticBundlePreview;
  redactBundle(bundle: DiagnosticBundle): DiagnosticBundle;
  prepareShareRequest(bundle: DiagnosticBundle): DiagnosticShareRequest;
  cancelShare(): boolean;
  getPendingShareRequest(): DiagnosticShareRequest | null;
}
