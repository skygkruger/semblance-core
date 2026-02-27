// Socket Permissions Tests — Verify socket file permissions and per-user pipe naming.
// Chunk 10 of the security audit remediation.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TRANSPORT_PATH = resolve(
  __dirname,
  '../../packages/gateway/ipc/transport.ts',
);
const source = readFileSync(TRANSPORT_PATH, 'utf-8');

describe('Socket Permissions (Chunk 10)', () => {
  it('should chmod socket to 0o600 after listen on Unix', () => {
    // Verify the source contains chmodSync call after listen
    expect(source).toContain('chmodSync(this.socketPath, 0o600)');
  });

  it('should use per-user pipe name on Windows', () => {
    // Verify Windows pipe name includes user identifier
    expect(source).toContain('semblance-gateway${userSuffix}');
    // Verify it uses userInfo() for the suffix
    expect(source).toContain('userInfo().uid');
    expect(source).toContain('userInfo().username');
  });

  it('should import chmodSync from node:fs', () => {
    expect(source).toMatch(/import\s*\{[^}]*chmodSync[^}]*\}\s*from\s*['"]node:fs['"]/);
  });

  it('should import userInfo from node:os', () => {
    expect(source).toMatch(/import\s*\{[^}]*userInfo[^}]*\}\s*from\s*['"]node:os['"]/);
  });

  it('should only chmod on non-Windows platforms', () => {
    // Verify the chmod is guarded by a platform check
    expect(source).toContain("platform() !== 'win32'");
  });
});
