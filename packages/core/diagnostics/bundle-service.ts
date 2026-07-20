import { randomUUID } from 'node:crypto';
import type {
  DiagnosticBundle,
  DiagnosticBundleContext,
  DiagnosticBundlePreview,
  DiagnosticBundleService,
  DiagnosticLogEntry,
  DiagnosticShareRequest,
} from './types.js';

const REDACTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bsk_(?:live|test)_[0-9a-zA-Z]{8,}\b/g, replacement: '[REDACTED_STRIPE_KEY]' },
  { pattern: /\bsem_[A-Za-z0-9._-]+\b/g, replacement: '[REDACTED_LICENSE_KEY]' },
  {
    pattern: /\b(?:api[_-]?key|secret|password|token|bearer)\s*[:=]\s*["']?[^\s"']+/gi,
    replacement: '[REDACTED_SECRET]',
  },
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
  },
];

const VAULT_PLAINTEXT_KEYS = new Set([
  'body',
  'content',
  'plaintext',
  'vaultPlaintext',
  'emailBody',
]);

function redactString(value: string): { value: string; redactedCount: number } {
  let redacted = value;
  let redactedCount = 0;
  for (const rule of REDACTION_RULES) {
    const matches = redacted.match(rule.pattern);
    if (!matches) continue;
    redactedCount += matches.length;
    redacted = redacted.replace(rule.pattern, rule.replacement);
  }
  return { value: redacted, redactedCount };
}

function redactValue(value: unknown, path = 'value'): { value: unknown; redactedCount: number } {
  if (typeof value === 'string') {
    const leaf = path.split('.').pop() ?? '';
    if (VAULT_PLAINTEXT_KEYS.has(leaf)) {
      return { value: '[REDACTED_VAULT_PLAINTEXT]', redactedCount: 1 };
    }
    return redactString(value);
  }

  if (Array.isArray(value)) {
    let redactedCount = 0;
    const next = value.map((entry, index) => {
      const result = redactValue(entry, `${path}[${index}]`);
      redactedCount += result.redactedCount;
      return result.value;
    });
    return { value: next, redactedCount };
  }

  if (value && typeof value === 'object') {
    let redactedCount = 0;
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (VAULT_PLAINTEXT_KEYS.has(key)) {
        next[key] = '[REDACTED_VAULT_PLAINTEXT]';
        redactedCount += 1;
        continue;
      }
      const result = redactValue(nested, `${path}.${key}`);
      redactedCount += result.redactedCount;
      next[key] = result.value;
    }
    return { value: next, redactedCount };
  }

  return { value, redactedCount: 0 };
}

function redactLogEntry(entry: DiagnosticLogEntry): { entry: DiagnosticLogEntry; redactedCount: number } {
  const messageResult = redactString(entry.message);
  const contextResult = entry.context
    ? redactValue(entry.context, 'context')
    : { value: undefined, redactedCount: 0 };

  return {
    entry: {
      ...entry,
      message: messageResult.value,
      context: contextResult.value as Record<string, unknown> | undefined,
    },
    redactedCount: messageResult.redactedCount + contextResult.redactedCount,
  };
}

function countSensitiveMatches(bundle: DiagnosticBundle): number {
  const serialized = JSON.stringify(bundle);
  return REDACTION_RULES.reduce((total, rule) => total + (serialized.match(rule.pattern)?.length ?? 0), 0);
}

export function createDiagnosticBundleService(): DiagnosticBundleService {
  let pendingShareRequest: DiagnosticShareRequest | null = null;

  return {
    generateBundle(context: DiagnosticBundleContext = {}): DiagnosticBundle {
      const logs = context.logs ?? [];
      let redactedFieldCount = 0;
      const redactedLogs = logs.map((entry) => {
        const result = redactLogEntry(entry);
        redactedFieldCount += result.redactedCount;
        return result.entry;
      });

      return {
        schemaVersion: 1,
        bundleId: randomUUID(),
        generatedAt: new Date().toISOString(),
        appVersion: context.appVersion ?? '0.1.0',
        buildHash: context.buildHash ?? null,
        platform: context.platform ?? process.platform,
        featureFlags: context.featureFlags ?? {},
        logs: redactedLogs,
        redacted: redactedFieldCount > 0,
      };
    },

    previewBundle(bundle: DiagnosticBundle): DiagnosticBundlePreview {
      const serialized = JSON.stringify(bundle);
      return {
        bundle,
        byteSize: Buffer.byteLength(serialized, 'utf8'),
        sensitiveFieldCount: countSensitiveMatches(bundle),
        redactedFieldCount: bundle.redacted ? countSensitiveMatches(bundle) : 0,
      };
    },

    redactBundle(bundle: DiagnosticBundle): DiagnosticBundle {
      const redactedLogs: DiagnosticLogEntry[] = [];
      let redactedFieldCount = 0;
      for (const entry of bundle.logs) {
        const result = redactLogEntry(entry);
        redactedFieldCount += result.redactedCount;
        redactedLogs.push(result.entry);
      }

      const redactedFlags = redactValue(bundle.featureFlags, 'featureFlags');
      redactedFieldCount += redactedFlags.redactedCount;

      return {
        ...bundle,
        featureFlags: redactedFlags.value as Record<string, boolean>,
        logs: redactedLogs,
        redacted: true,
      };
    },

    prepareShareRequest(bundle: DiagnosticBundle): DiagnosticShareRequest {
      const redactedBundle = this.redactBundle(bundle);
      pendingShareRequest = {
        schemaVersion: 1,
        bundleId: redactedBundle.bundleId,
        redactedBundle,
        transport: 'gateway.support.upload',
        requiresUserConsent: true,
        message: 'Diagnostic upload must be performed by Gateway after explicit user consent. Core never uploads.',
      };
      return pendingShareRequest;
    },

    cancelShare(): boolean {
      const hadPending = pendingShareRequest !== null;
      pendingShareRequest = null;
      return hadPending;
    },

    getPendingShareRequest(): DiagnosticShareRequest | null {
      return pendingShareRequest;
    },
  };
}

let defaultService: DiagnosticBundleService | null = null;

function getDefaultService(): DiagnosticBundleService {
  if (!defaultService) {
    defaultService = createDiagnosticBundleService();
  }
  return defaultService;
}

export function generateBundle(context?: DiagnosticBundleContext): DiagnosticBundle {
  return getDefaultService().generateBundle(context);
}

export function previewBundle(bundle: DiagnosticBundle): DiagnosticBundlePreview {
  return getDefaultService().previewBundle(bundle);
}

export function redactBundle(bundle: DiagnosticBundle): DiagnosticBundle {
  return getDefaultService().redactBundle(bundle);
}

export function prepareShareRequest(bundle: DiagnosticBundle): DiagnosticShareRequest {
  return getDefaultService().prepareShareRequest(bundle);
}

export function cancelShare(): boolean {
  return getDefaultService().cancelShare();
}

export function getPendingShareRequest(): DiagnosticShareRequest | null {
  return getDefaultService().getPendingShareRequest();
}

export function resetDiagnosticBundleServiceForTests(): void {
  defaultService = createDiagnosticBundleService();
}
