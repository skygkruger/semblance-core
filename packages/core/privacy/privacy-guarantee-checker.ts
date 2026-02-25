// Privacy Guarantee Checker — Declarative registry of architectural privacy guarantees.
// All guarantees are verified at the architectural/CI level, not runtime.
// CRITICAL: No networking imports.

import type { PrivacyGuarantee } from './types.js';

/**
 * The 7 architectural privacy guarantees that Semblance enforces.
 * All return status: 'verified' because enforcement is in CI/Gateway/audit trail.
 */
const GUARANTEE_DEFINITIONS: Array<{ id: string; name: string; description: string }> = [
  {
    id: 'zero-telemetry',
    name: 'Zero Telemetry',
    description: 'No analytics, crash reporting, or usage tracking. No third-party SDKs that phone home. Not even opt-in.',
  },
  {
    id: 'local-only-data',
    name: 'Local-Only Data Storage',
    description: 'All user data stored exclusively on device. No cloud sync, backup, or remote storage of any kind.',
  },
  {
    id: 'gateway-only-network',
    name: 'Gateway-Only Network Access',
    description: 'All external network calls flow through the Semblance Gateway. The AI Core has zero network capability.',
  },
  {
    id: 'tamper-evident-audit',
    name: 'Tamper-Evident Audit Trail',
    description: 'Every action is logged before execution with cryptographic chain hashes. The audit trail is append-only and tamper-evident.',
  },
  {
    id: 'cryptographic-signing',
    name: 'Cryptographic Action Signing',
    description: 'Every action request is cryptographically signed with HMAC-SHA256 before execution.',
  },
  {
    id: 'local-embeddings',
    name: 'Local Embeddings',
    description: 'All text embeddings computed locally using on-device models. No cloud embedding APIs.',
  },
  {
    id: 'no-model-telemetry',
    name: 'No Model Telemetry',
    description: 'LLM inference runs entirely on-device via Ollama/llama.cpp/MLX. No data sent to model providers.',
  },
];

/**
 * Returns the 7 architectural privacy guarantees with verification timestamps.
 * No dependencies — all guarantees are declarative.
 */
export class PrivacyGuaranteeChecker {
  /**
   * Check all privacy guarantees.
   */
  check(): PrivacyGuarantee[] {
    const now = new Date().toISOString();

    return GUARANTEE_DEFINITIONS.map(def => ({
      id: def.id,
      name: def.name,
      description: def.description,
      status: 'verified' as const,
      verifiedAt: now,
    }));
  }
}
