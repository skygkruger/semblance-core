// Security — OS sandboxing configuration and verification.
// CRITICAL: No networking imports.

export {
  MACOS_ENTITLEMENTS,
  LINUX_APPARMOR_RESTRICTIONS,
  WINDOWS_CAPABILITIES,
} from './sandbox-config.js';

export {
  verifySandbox,
  auditSandboxConfig,
} from './sandbox-verifier.js';

export type { SandboxViolation, SandboxStatus } from './sandbox-verifier.js';
