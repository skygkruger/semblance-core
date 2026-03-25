// Gateway Content Sanitizer — Re-exports from Core to avoid duplicate implementations.
//
// The Gateway must sanitize inbound channel messages before forwarding to Core.
// Previously this was a copy of the Core sanitizer. Now it re-exports from Core
// to guarantee both sides use identical sanitization logic.
//
// ARCHITECTURE NOTE: Gateway importing from Core barrel (@semblance/core) is
// acceptable for pure utility functions (string processing, crypto, types).
// The boundary rule prohibits Gateway from importing Core knowledge graph or
// user data stores — content-sanitizer is neither.

export {
  sanitizeRetrievedContent,
  stripInjectionPatterns,
  wrapInDataBoundary,
  INJECTION_CANARY,
} from '@semblance/core';

// Re-export sanitizeRetrievedContent under the Gateway-specific name for backward compatibility
export { sanitizeRetrievedContent as sanitizeInboundContent } from '@semblance/core';
