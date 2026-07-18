import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Explicit network entitlement for the supervised model runtime. */
export const MODEL_RUNTIME_NETWORK_ENTITLEMENT = false as const;

export const BANNED_NETWORK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'node:http import', pattern: /\bimport\b.*['"]node:http['"]/ },
  { name: 'node:https import', pattern: /\bimport\b.*['"]node:https['"]/ },
  { name: 'node:net import', pattern: /\bimport\b.*['"]node:net['"]/ },
  { name: 'node:tls import', pattern: /\bimport\b.*['"]node:tls['"]/ },
  { name: 'node:dns import', pattern: /\bimport\b.*['"]node:dns['"]/ },
  { name: 'node:dgram import', pattern: /\bimport\b.*['"]node:dgram['"]/ },
  { name: 'http require', pattern: /\brequire\s*\(\s*['"]node:http['"]\s*\)/ },
  { name: 'https require', pattern: /\brequire\s*\(\s*['"]node:https['"]\s*\)/ },
  { name: 'global fetch invocation', pattern: new RegExp('\\bfetch\\s*\\(') },
  { name: 'XMLHttpRequest', pattern: new RegExp('\\bnew\\s+XMLHttpRequest\\b') },
  { name: 'WebSocket', pattern: new RegExp('\\bnew\\s+WebSocket\\b') },
  { name: 'axios import', pattern: /\bimport\b.*['"]axios['"]/ },
  { name: 'node-fetch import', pattern: /\bimport\b.*['"]node-fetch['"]/ },
  { name: 'undici import', pattern: /\bimport\b.*['"]undici['"]/ },
];

export function assertNetworkEntitlementFalse(): void {
  if (MODEL_RUNTIME_NETWORK_ENTITLEMENT !== false) {
    throw new Error('Model runtime must declare networkEntitlement: false');
  }
}

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      files.push(fullPath);
    }
  }

  return files;
}

export function scanDirectoryForNetworkImports(rootDir: string): string[] {
  const violations: string[] = [];

  for (const filePath of collectSourceFiles(rootDir)) {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? '';
      for (const banned of BANNED_NETWORK_PATTERNS) {
        if (banned.pattern.test(line)) {
          violations.push(`${filePath}:${lineIndex + 1} — ${banned.name}`);
        }
      }
    }
  }

  return violations;
}

export function assertDirectoryIsNetworkIncapable(rootDir: string): void {
  assertNetworkEntitlementFalse();
  const violations = scanDirectoryForNetworkImports(rootDir);
  if (violations.length > 0) {
    throw new Error(`Network-capable code detected in model runtime:\n${violations.join('\n')}`);
  }

  const stat = statSync(rootDir);
  if (!stat.isDirectory()) {
    throw new Error(`Expected directory for network scan: ${rootDir}`);
  }
}
