import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Tauri plugins are resolved at runtime by the webview, not by Vite.
// In dev mode we stub them as empty modules so the import analysis pass doesn't error.
const tauriExternals = [
  '@tauri-apps/plugin-process',
  '@tauri-apps/plugin-updater',
  '@tauri-apps/api/process',
  '@tauri-apps/api/core',
  '@tauri-apps/api/event',
  '@tauri-apps/api/window',
  '@tauri-apps/api/app',
  '@tauri-apps/plugin-dialog',
];

function tauriPluginStub() {
  const noop = 'function(){}';
  const noopAsync = 'function(){return Promise.resolve(function(){})}';
  const proxyHandler = `({
    get(_,p) {
      if(p==='then') return undefined;
      return function(){return Promise.resolve(function(){})};
    }
  })`;

  const stubs: Record<string, string> = {
    '@tauri-apps/api/core': `
      const arrayCommands = [
        'get_inbox_items','get_proactive_insights','get_today_events','get_action_log',
        'get_pending_actions','list_digests','get_active_connections','get_network_allowlist',
        'get_unauthorized_attempts','get_connection_timeline','get_connection_history',
        'list_credentials','get_accounts_status','document_pick_files','list_conversations',
      ];
      const objectCommands = {
        'get_onboarding_complete': { complete: true },
        'get_language_preference': 'en',
        'get_model_status': { ollamaStatus:'disconnected',inferenceEngine:'none',activeModel:null,availableModels:[],userName:'Dev User',onboardingComplete:true },
        'get_autonomy_config': { domains:{} },
        'get_license_status': { tier:'digital-representative',active:true },
        'get_network_trust_status': { clean:true,unauthorizedCount:0,activeServiceCount:0 },
        'get_actions_summary': { total:0,pending:0,approved:0,rejected:0,timeSaved:0 },
        'get_latest_digest': { weekStart:'',weekEnd:'',sections:[],generatedAt:'' },
        'get_network_statistics': { totalConnections:0,blockedAttempts:0,allowedServices:0,dataTransferred:0 },
        'send_message': { response:'',conversationId:'dev',turnId:'dev' },
        'detect_hardware': { cpu:'Dev CPU',ram:'16 GB',gpu:'Dev GPU',os:'Dev OS',tier:'capable' },
      };
      export function invoke(cmd, args) {
        if (cmd in objectCommands) return Promise.resolve(objectCommands[cmd]);
        if (arrayCommands.includes(cmd)) return Promise.resolve([]);
        // Sidecar requests
        const m = args?.request?.method;
        if (m && m in objectCommands) return Promise.resolve(objectCommands[m]);
        if (m && arrayCommands.includes(m)) return Promise.resolve([]);
        if (m === 'get_connected_services') return Promise.resolve([]);
        // Default: sidecar requests return [] (most return arrays)
        if (cmd === 'sidecar_request') return Promise.resolve([]);
        return Promise.resolve(null);
      }
      export function convertFileSrc(p) { return p; }
    `,
    '@tauri-apps/api/event': `
      export function listen() { return Promise.resolve(${noop}); }
      export function emit() { return Promise.resolve(); }
      export function once() { return Promise.resolve(${noop}); }
    `,
    '@tauri-apps/api/window': `
      const win = new Proxy(${proxyHandler}, ${proxyHandler});
      export function getCurrentWindow() { return win; }
      export function getCurrentWebviewWindow() { return win; }
      export class Window { static getByLabel() { return win; } }
    `,
    '@tauri-apps/api/app': `
      export function getVersion() { return Promise.resolve('0.0.0-dev'); }
      export function getName() { return Promise.resolve('Semblance'); }
    `,
    '@tauri-apps/plugin-dialog': `
      export function open() { return Promise.resolve(null); }
      export function save() { return Promise.resolve(null); }
      export function message() { return Promise.resolve(); }
      export function ask() { return Promise.resolve(false); }
      export function confirm() { return Promise.resolve(false); }
    `,
  };

  return {
    name: 'tauri-plugin-stub',
    enforce: 'pre' as const,
    resolveId(id: string) {
      // Match any @tauri-apps import
      if (id.startsWith('@tauri-apps/')) return `\0tauri-stub:${id}`;
    },
    load(id: string) {
      if (!id.startsWith('\0tauri-stub:')) return;
      const mod = id.replace('\0tauri-stub:', '');
      return stubs[mod] || `export default new Proxy({},{get(_,p){if(p==='then')return undefined;return ${noopAsync}}})`;
    },
  };
}

export default defineConfig({
  plugins: [react(), tauriPluginStub()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  optimizeDeps: {
    exclude: tauriExternals,
  },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js'],
    alias: {
      '@semblance/ui': resolve(__dirname, '../semblance-ui'),
    },
    // Force single instance — pnpm hoists two i18next versions (v23 for semblance-ui, v24 for desktop).
    // Without dedup, config loads resources into one singleton, useTranslation reads from another.
    dedupe: ['i18next', 'react-i18next', 'react', 'react-dom'],
  },
  build: {
    target: 'esnext',
    minify: !process.env['TAURI_DEBUG'] ? 'esbuild' : false,
    sourcemap: !!process.env['TAURI_DEBUG'],
    rollupOptions: {
      // Tauri plugins are resolved at runtime by the Tauri webview, not bundled by Vite.
      // Dynamic imports of optional plugins (e.g. plugin-process) fail Rollup resolution
      // but work fine at runtime — externalize them to prevent build errors.
      external: [
        '@tauri-apps/plugin-process',
        '@tauri-apps/plugin-updater',
        '@tauri-apps/api/process',
      ],
    },
  },
});
