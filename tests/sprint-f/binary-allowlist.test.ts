import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { BinaryAllowlist, PERMANENT_BLOCK_LIST, BLOCK_SET } from '../../packages/gateway/security/binary-allowlist.js';

describe('Sprint F — Binary Allowlist', () => {
  let db: Database.Database;
  let allowlist: BinaryAllowlist;

  beforeEach(() => {
    db = new Database(':memory:');
    allowlist = new BinaryAllowlist(db);
  });

  describe('permanent block list', () => {
    const shellNames = ['sh', 'bash', 'zsh', 'fish', 'ksh', 'csh', 'tcsh', 'dash',
      'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'];

    for (const shell of shellNames) {
      it(`permanently blocks shell: ${shell}`, () => {
        expect(allowlist.isPermanentlyBlocked(shell)).toBe(true);
      });
    }

    const interpreters = ['python', 'python3', 'python.exe', 'ruby', 'perl', 'node', 'node.exe', 'deno', 'bun', 'php'];
    for (const interp of interpreters) {
      it(`permanently blocks interpreter: ${interp}`, () => {
        expect(allowlist.isPermanentlyBlocked(interp)).toBe(true);
      });
    }

    const networkTools = ['curl', 'wget', 'nc', 'netcat', 'ncat', 'ssh', 'scp', 'sftp', 'ftp'];
    for (const tool of networkTools) {
      it(`permanently blocks network tool: ${tool}`, () => {
        expect(allowlist.isPermanentlyBlocked(tool)).toBe(true);
      });
    }

    const pkgManagers = ['npm', 'npx', 'pnpm', 'yarn', 'pip', 'pip3', 'brew', 'winget', 'choco'];
    for (const pm of pkgManagers) {
      it(`permanently blocks package manager: ${pm}`, () => {
        expect(allowlist.isPermanentlyBlocked(pm)).toBe(true);
      });
    }

    it('permanently blocks sudo and su', () => {
      expect(allowlist.isPermanentlyBlocked('sudo')).toBe(true);
      expect(allowlist.isPermanentlyBlocked('su')).toBe(true);
      expect(allowlist.isPermanentlyBlocked('runas')).toBe(true);
    });

    it('has at least 40 entries in the permanent block list', () => {
      expect(PERMANENT_BLOCK_LIST.length).toBeGreaterThanOrEqual(40);
    });

    it('cannot add blocked binaries to user allowlist', () => {
      expect(() => allowlist.add({ binaryPath: '/usr/bin/bash' })).toThrow('permanent block list');
      expect(() => allowlist.add({ binaryPath: '/usr/bin/python3' })).toThrow('permanent block list');
      expect(() => allowlist.add({ binaryPath: 'C:\\Windows\\System32\\cmd.exe' })).toThrow('permanent block list');
    });
  });

  describe('user allowlist CRUD', () => {
    it('adds a binary to the allowlist', () => {
      const entry = allowlist.add({ binaryPath: '/usr/local/bin/ffmpeg', description: 'Video processing' });
      expect(entry.binaryName).toBe('ffmpeg');
      expect(entry.binaryPath).toBe('/usr/local/bin/ffmpeg');
      expect(entry.description).toBe('Video processing');
      expect(entry.isActive).toBe(true);
    });

    it('lists allowlisted binaries', () => {
      allowlist.add({ binaryPath: '/usr/local/bin/ffmpeg' });
      allowlist.add({ binaryPath: '/usr/local/bin/pandoc' });
      const list = allowlist.list();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('gets a specific binary by name', () => {
      allowlist.add({ binaryPath: '/usr/local/bin/ffmpeg' });
      const entry = allowlist.get('ffmpeg');
      expect(entry).not.toBeNull();
      expect(entry!.binaryName).toBe('ffmpeg');
    });

    it('removes a binary from the allowlist', () => {
      allowlist.add({ binaryPath: '/usr/local/bin/ffmpeg' });
      const removed = allowlist.remove('ffmpeg');
      expect(removed).toBe(true);
      expect(allowlist.get('ffmpeg')).toBeNull();
    });

    it('returns false when removing non-existent binary', () => {
      expect(allowlist.remove('nonexistent')).toBe(false);
    });
  });

  describe('check()', () => {
    it('blocks permanently blocked binaries', () => {
      const reason = allowlist.check('/usr/bin/bash');
      expect(reason).toContain('permanently blocked');
    });

    it('blocks binaries not in user allowlist', () => {
      const reason = allowlist.check('/usr/local/bin/someunknown');
      expect(reason).toContain('not in allowlist');
    });

    it('allows binaries in user allowlist', () => {
      allowlist.add({ binaryPath: '/usr/local/bin/ffmpeg' });
      const reason = allowlist.check('/usr/local/bin/ffmpeg');
      expect(reason).toBeNull(); // null = allowed
    });

    it('is case-insensitive on binary names', () => {
      const reason1 = allowlist.check('/usr/bin/BASH');
      expect(reason1).toContain('permanently blocked');
      const reason2 = allowlist.check('/usr/bin/Bash');
      expect(reason2).toContain('permanently blocked');
    });
  });

  describe('path verification', () => {
    it('detects path substitution when basename differs', () => {
      allowlist.add({ binaryPath: '/usr/local/bin/ffmpeg' });
      // Requesting a different binary path with different basename should be blocked
      const reason = allowlist.check('/usr/local/bin/malicious');
      expect(reason).toContain('not in allowlist');
    });
  });
});
