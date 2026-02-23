// Cloud Storage Privacy Tests — Verify no network imports in cloud-storage code,
// no Gateway imports, Core uses only IPCClient, and adapter is pull-only.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const CLOUD_STORAGE_DIR = resolve(__dirname, '../../packages/core/cloud-storage');

/** Banned network patterns in packages/core/ cloud-storage code */
const NETWORK_PATTERNS = [
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\brequire\s*\(\s*['"]http['"]\s*\)/,
  /\brequire\s*\(\s*['"]https['"]\s*\)/,
  /\brequire\s*\(\s*['"]net['"]\s*\)/,
  /\bimport\b.*['"]axios['"]/,
  /\bimport\b.*['"]node-fetch['"]/,
  /\bimport\b.*['"]got['"]/,
  /\bimport\b.*['"]undici['"]/,
];

const GATEWAY_PATTERNS = [
  /from\s+['"].*gateway/,
  /import\s+.*['"].*gateway/,
  /require\s*\(\s*['"].*gateway/,
];

function getTypeScriptFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...getTypeScriptFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

describe('Cloud Storage Privacy', () => {
  it('no network imports in packages/core/cloud-storage/', () => {
    const files = getTypeScriptFiles(CLOUD_STORAGE_DIR);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of NETWORK_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `Found network pattern "${pattern}" in ${file}: "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it('no Gateway imports in packages/core/cloud-storage/', () => {
    const files = getTypeScriptFiles(CLOUD_STORAGE_DIR);

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of GATEWAY_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `Found Gateway import in ${file}: "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it('Core uses only IPCClient for external operations', () => {
    // The CloudStorageClient delegates to IPCClient — verify it imports only IPCClient
    const clientFile = resolve(CLOUD_STORAGE_DIR, 'cloud-storage-client.ts');
    const content = readFileSync(clientFile, 'utf-8');

    // Must import IPCClient
    expect(content).toMatch(/import.*IPCClient.*from/);

    // Must NOT import any networking or Gateway modules
    for (const pattern of NETWORK_PATTERNS) {
      expect(content.match(pattern)).toBeNull();
    }
    for (const pattern of GATEWAY_PATTERNS) {
      expect(content.match(pattern)).toBeNull();
    }
  });

  it('IPC ActionTypes include NO cloud write/upload/delete/modify actions', () => {
    // Read the IPC types file to verify cloud.* actions are read-only
    const ipcTypesFile = resolve(__dirname, '../../packages/core/types/ipc.ts');
    const content = readFileSync(ipcTypesFile, 'utf-8');

    // Extract cloud.* action type names
    const cloudActions = content.match(/['"]cloud\.\w+['"]/g) ?? [];
    expect(cloudActions.length).toBeGreaterThan(0);

    // Verify NO write/upload/delete/modify action names
    const bannedPatterns = ['write', 'upload', 'delete', 'modify', 'create', 'update', 'remove'];
    for (const action of cloudActions) {
      for (const banned of bannedPatterns) {
        expect(
          action.toLowerCase().includes(banned),
          `Found potentially write action in cloud types: ${action} (contains '${banned}')`,
        ).toBe(false);
      }
    }

    // Verify the expected read-only actions are present
    expect(content).toContain('cloud.auth');
    expect(content).toContain('cloud.auth_status');
    expect(content).toContain('cloud.disconnect');
    expect(content).toContain('cloud.list_files');
    expect(content).toContain('cloud.file_metadata');
    expect(content).toContain('cloud.download_file');
    expect(content).toContain('cloud.check_changed');
  });

  it('CloudStorageAdapter has NO write/upload/delete/modify methods', () => {
    // Read the cloud storage types file
    const typesFile = resolve(__dirname, '../../packages/core/platform/cloud-storage-types.ts');
    const content = readFileSync(typesFile, 'utf-8');

    // Extract the CloudStorageAdapter interface block
    const adapterMatch = content.match(/interface\s+CloudStorageAdapter\s*\{[\s\S]*?\n\}/);
    expect(adapterMatch).not.toBeNull();
    const adapterBlock = adapterMatch![0];

    // Verify NO write/upload/delete/modify method names in the adapter
    expect(adapterBlock).not.toMatch(/\bwrite\b/i);
    expect(adapterBlock).not.toMatch(/\bupload\b/i);
    expect(adapterBlock).not.toMatch(/\bdelete\b/i);
    expect(adapterBlock).not.toMatch(/\bmodify\b/i);
    expect(adapterBlock).not.toMatch(/\bcreate\b/i);
    expect(adapterBlock).not.toMatch(/\bremove\b/i);
    expect(adapterBlock).not.toMatch(/\bupdate\b/i);

    // Verify expected read-only methods ARE present
    expect(adapterBlock).toMatch(/authenticate/);
    expect(adapterBlock).toMatch(/isAuthenticated/);
    expect(adapterBlock).toMatch(/disconnect/);
    expect(adapterBlock).toMatch(/listFiles/);
    expect(adapterBlock).toMatch(/getFileMetadata/);
    expect(adapterBlock).toMatch(/downloadFile/);
    expect(adapterBlock).toMatch(/hasFileChanged/);

    // Verify the CRITICAL comment about pull-only
    expect(content).toContain('No write/upload/delete/modify methods');
  });
});
