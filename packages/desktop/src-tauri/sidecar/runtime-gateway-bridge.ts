// Supervised Gateway runtime entry for Tauri host supervisor (Slice 2.5).
// Bundled to runtime-gateway-bridge.cjs for production; run via tsx in development.

import { runGatewayRuntime } from '../../../runtime-gateway/src/main.js';

runGatewayRuntime().catch((error: unknown) => {
  console.error('[runtime-gateway-bridge] Fatal error:', error);
  process.exit(1);
});
