// Sovereignty kernel process entry for Tauri host supervisor (Slice 2.4).
// Bundled to kernel-bridge.cjs for production; run via tsx in development.

import { runKernelMain } from '../../../kernel/src/bin/kernel-main.js';

runKernelMain().catch((error: unknown) => {
  console.error('[kernel-bridge] Fatal error:', error);
  process.exit(1);
});
