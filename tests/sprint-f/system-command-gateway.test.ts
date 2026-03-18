import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BinaryAllowlist } from '../../packages/gateway/security/binary-allowlist.js';
import { ArgumentValidator } from '../../packages/gateway/security/argument-validator.js';
import { SystemCommandGateway } from '../../packages/gateway/system/system-command-gateway.js';

const ROOT = join(__dirname, '..', '..');

describe('Sprint F — SystemCommandGateway', () => {
  let db: Database.Database;
  let allowlist: BinaryAllowlist;
  let validator: ArgumentValidator;
  let gateway: SystemCommandGateway;

  beforeEach(() => {
    db = new Database(':memory:');
    allowlist = new BinaryAllowlist(db);
    validator = new ArgumentValidator();
    gateway = new SystemCommandGateway(allowlist, validator);
  });

  describe('execFile-only enforcement', () => {
    it('source code uses execFile, not exec or shell:true', () => {
      const src = readFileSync(join(ROOT, 'packages/gateway/system/system-command-gateway.ts'), 'utf-8');
      expect(src).toContain('execFile');
      // Verify only execFile is imported from child_process — no exec, no spawn
      expect(src).toContain("import { execFile as execFileCb } from 'node:child_process'");
      // No shell:true anywhere
      expect(src).not.toContain('shell: true');
      expect(src).not.toContain('shell:true');
      expect(src).not.toContain('shell: true');
      expect(src).not.toContain('shell:true');
    });
  });

  describe('execute()', () => {
    it('rejects blocked binaries', async () => {
      await expect(gateway.execute({ binary: '/usr/bin/bash', args: ['-c', 'echo hi'] }))
        .rejects.toThrow('permanently blocked');
    });

    it('rejects binaries not in allowlist', async () => {
      await expect(gateway.execute({ binary: '/usr/local/bin/unknownbinary', args: [] }))
        .rejects.toThrow('not in allowlist');
    });

    it('rejects shell metacharacters in arguments', async () => {
      allowlist.add({ binaryPath: '/usr/local/bin/testbin' });
      await expect(gateway.execute({ binary: '/usr/local/bin/testbin', args: ['hello; rm -rf /'] }))
        .rejects.toThrow('Argument validation failed');
    });
  });

  describe('session-owned PID table', () => {
    it('killProcess rejects non-session PIDs', () => {
      const result = gateway.killProcess(99999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not a session-owned process');
    });

    it('listProcesses returns empty initially', () => {
      expect(gateway.listProcesses()).toEqual([]);
    });
  });

  describe('environment stripping', () => {
    it('source code defines SAFE_ENV_VARS whitelist', () => {
      const src = readFileSync(join(ROOT, 'packages/gateway/system/system-command-gateway.ts'), 'utf-8');
      expect(src).toContain('SAFE_ENV_VARS');
      expect(src).toContain("'PATH'");
      expect(src).toContain("'HOME'");
      // Must NOT include credential vars
      expect(src).not.toContain('SEMBLANCE_SIGNING_KEY');
      expect(src).not.toContain('ANTHROPIC_API_KEY');
      expect(src).not.toContain('GOOGLE_CLIENT_SECRET');
    });

    it('env parameter cannot override PATH', () => {
      const src = readFileSync(join(ROOT, 'packages/gateway/system/system-command-gateway.ts'), 'utf-8');
      expect(src).toContain("key !== 'PATH'");
    });
  });

  describe('timeout enforcement', () => {
    it('source code applies timeout to execFile', () => {
      const src = readFileSync(join(ROOT, 'packages/gateway/system/system-command-gateway.ts'), 'utf-8');
      expect(src).toContain('timeout: timeoutMs');
    });
  });
});
