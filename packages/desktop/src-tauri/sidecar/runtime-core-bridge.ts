// Supervised AI Core runtime entry for Tauri host supervisor (Slice 2.5).
// Bundled to runtime-core-bridge.cjs for production; run via tsx in development.

import { runCoreRuntime } from '../../../runtime-core/src/main.js';

runCoreRuntime().catch((error: unknown) => {
  console.error('[runtime-core-bridge] Fatal error:', error);
  process.exit(1);
});
