// Supervised model runtime entry for Tauri host supervisor (Slice 2.6).
// Bundled to runtime-model-bridge.cjs for production; run via tsx in development.

import { runModelRuntime } from '../../../runtime-model/src/main.js';

runModelRuntime().catch((error: unknown) => {
  console.error('[runtime-model-bridge] Fatal error:', error);
  process.exit(1);
});
