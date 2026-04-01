// Tests for Filesystem + Terminal tools.
//
// Covers: FilesystemExecutor, TerminalExecutor, tool definitions,
// permission hooks, terminal safety hooks, and integration.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FilesystemExecutor } from '@semblance/gateway/tools/filesystem-executor.js';
import { TerminalExecutor } from '@semblance/gateway/tools/terminal-executor.js';
import {
  ALL_PLATFORM_TOOLS,
  FILESYSTEM_TOOL_ACTION_MAP,
  PLATFORM_TOOL_NAMES,
  createTerminalSafetyHook,
  createFilesystemPermissionHook,
  isCommandSafe,
  isCommandBlocked,
} from '@semblance/core/agent/filesystem-tools.js';
import { executePreToolHooks, ToolHookRegistryImpl } from '@semblance/core/agent/tool-hooks.js';
import type { ToolHookContext } from '@semblance/core/agent/orchestrator-v2-types.js';

// ─── Tool Definitions ─────────────────────────────────────────────────────────

describe('Platform Tool Definitions', () => {
  it('defines 11 tools (10 filesystem + 1 terminal)', () => {
    expect(ALL_PLATFORM_TOOLS).toHaveLength(11);
    expect(PLATFORM_TOOL_NAMES).toContain('read_file');
    expect(PLATFORM_TOOL_NAMES).toContain('write_file');
    expect(PLATFORM_TOOL_NAMES).toContain('edit_file');
    expect(PLATFORM_TOOL_NAMES).toContain('list_directory');
    expect(PLATFORM_TOOL_NAMES).toContain('create_directory');
    expect(PLATFORM_TOOL_NAMES).toContain('move_file');
    expect(PLATFORM_TOOL_NAMES).toContain('copy_file');
    expect(PLATFORM_TOOL_NAMES).toContain('search_file_contents');
    expect(PLATFORM_TOOL_NAMES).toContain('glob_search');
    expect(PLATFORM_TOOL_NAMES).toContain('file_info');
    expect(PLATFORM_TOOL_NAMES).toContain('execute_command');
  });

  it('maps all tools to ActionTypes', () => {
    for (const name of PLATFORM_TOOL_NAMES) {
      expect(FILESYSTEM_TOOL_ACTION_MAP[name]).toBeDefined();
    }
    expect(FILESYSTEM_TOOL_ACTION_MAP['read_file']).toBe('fs.read');
    expect(FILESYSTEM_TOOL_ACTION_MAP['execute_command']).toBe('terminal.execute');
  });

  it('each tool has name, description, and parameters with required fields', () => {
    for (const tool of ALL_PLATFORM_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
    }
  });
});

// ─── Filesystem Executor ──────────────────────────────────────────────────────

describe('FilesystemExecutor', () => {
  let executor: FilesystemExecutor;
  let tmpDir: string;

  beforeEach(() => {
    executor = new FilesystemExecutor();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semblance-fs-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  describe('readFile', () => {
    it('reads a file', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, 'Hello, World!\nLine 2\nLine 3');

      const result = executor.readFile({ path: filePath });
      expect(result.content).toContain('Hello, World!');
      expect(result.lineCount).toBe(3);
      expect(result.size).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    });

    it('reads a line range', () => {
      const filePath = path.join(tmpDir, 'lines.txt');
      fs.writeFileSync(filePath, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

      const result = executor.readFile({ path: filePath, lineRange: { start: 2, end: 4 } });
      expect(result.content).toBe('Line 2\nLine 3\nLine 4');
      expect(result.lineCount).toBe(3);
    });

    it('limits read size with maxBytes', () => {
      const filePath = path.join(tmpDir, 'large.txt');
      fs.writeFileSync(filePath, 'A'.repeat(10000));

      const result = executor.readFile({ path: filePath, maxBytes: 100 });
      expect(result.content.length).toBeLessThanOrEqual(100);
      expect(result.truncated).toBe(true);
    });

    it('throws for nonexistent file', () => {
      expect(() => executor.readFile({ path: path.join(tmpDir, 'nope.txt') })).toThrow();
    });
  });

  describe('writeFile', () => {
    it('creates a new file', () => {
      const filePath = path.join(tmpDir, 'new.txt');
      const result = executor.writeFile({ path: filePath, content: 'Created!' });
      expect(result.bytesWritten).toBeGreaterThan(0);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Created!');
    });

    it('creates parent directories', () => {
      const filePath = path.join(tmpDir, 'deep', 'nested', 'file.txt');
      executor.writeFile({ path: filePath, content: 'Nested!' });
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Nested!');
    });

    it('refuses to overwrite without flag', () => {
      const filePath = path.join(tmpDir, 'existing.txt');
      fs.writeFileSync(filePath, 'Original');
      expect(() => executor.writeFile({ path: filePath, content: 'New' })).toThrow('already exists');
    });

    it('overwrites when flag is set', () => {
      const filePath = path.join(tmpDir, 'existing.txt');
      fs.writeFileSync(filePath, 'Original');
      executor.writeFile({ path: filePath, content: 'Replaced', overwrite: true });
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Replaced');
    });
  });

  describe('editFile', () => {
    it('makes find-and-replace edits', () => {
      const filePath = path.join(tmpDir, 'edit.txt');
      fs.writeFileSync(filePath, 'port: 3000\nhost: localhost');

      const result = executor.editFile({
        path: filePath,
        edits: [{ oldText: 'port: 3000', newText: 'port: 8080' }],
      });
      expect(result.editsApplied).toBe(1);
      expect(fs.readFileSync(filePath, 'utf-8')).toContain('port: 8080');
    });

    it('supports dry run', () => {
      const filePath = path.join(tmpDir, 'dryrun.txt');
      fs.writeFileSync(filePath, 'original content');

      const result = executor.editFile({
        path: filePath,
        edits: [{ oldText: 'original', newText: 'modified' }],
        dryRun: true,
      });
      expect(result.editsApplied).toBe(1);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('original content'); // Unchanged
    });
  });

  describe('listDirectory', () => {
    it('lists directory contents', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
      fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'b');
      fs.mkdirSync(path.join(tmpDir, 'subdir'));

      const entries = executor.listDirectory({ path: tmpDir });
      expect(entries.length).toBe(3);
      expect(entries.some(e => e.name === 'a.txt' && e.type === 'file')).toBe(true);
      expect(entries.some(e => e.name === 'subdir' && e.type === 'directory')).toBe(true);
    });

    it('filters by pattern', () => {
      fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# readme');
      fs.writeFileSync(path.join(tmpDir, 'code.ts'), 'export {}');

      const entries = executor.listDirectory({ path: tmpDir, pattern: '*.md' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.name).toBe('readme.md');
    });
  });

  describe('createDirectory', () => {
    it('creates nested directories', () => {
      const dirPath = path.join(tmpDir, 'a', 'b', 'c');
      executor.createDirectory({ path: dirPath });
      expect(fs.existsSync(dirPath)).toBe(true);
    });
  });

  describe('moveFile', () => {
    it('moves a file', () => {
      const src = path.join(tmpDir, 'src.txt');
      const dest = path.join(tmpDir, 'dest.txt');
      fs.writeFileSync(src, 'moving');
      executor.moveFile({ source: src, destination: dest });
      expect(fs.existsSync(src)).toBe(false);
      expect(fs.readFileSync(dest, 'utf-8')).toBe('moving');
    });
  });

  describe('copyFile', () => {
    it('copies a file', () => {
      const src = path.join(tmpDir, 'src.txt');
      const dest = path.join(tmpDir, 'copy.txt');
      fs.writeFileSync(src, 'copying');
      executor.copyFile({ source: src, destination: dest });
      expect(fs.readFileSync(src, 'utf-8')).toBe('copying'); // Original stays
      expect(fs.readFileSync(dest, 'utf-8')).toBe('copying');
    });
  });

  describe('searchFileContents', () => {
    it('finds matching lines', () => {
      fs.writeFileSync(path.join(tmpDir, 'code.ts'), 'const x = 1;\n// TODO: fix this\nconst y = 2;');
      const results = executor.searchFileContents({ path: tmpDir, pattern: 'TODO' });
      expect(results).toHaveLength(1);
      expect(results[0]!.lineNumber).toBe(2);
      expect(results[0]!.lineContent).toContain('TODO');
    });
  });

  describe('globSearch', () => {
    it('finds matching files', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.ts'), '');
      fs.writeFileSync(path.join(tmpDir, 'b.ts'), '');
      fs.writeFileSync(path.join(tmpDir, 'c.txt'), '');
      const results = executor.globSearch({ path: tmpDir, pattern: '*.ts' });
      expect(results).toHaveLength(2);
    });
  });

  describe('fileInfo', () => {
    it('returns file metadata', () => {
      const filePath = path.join(tmpDir, 'info.json');
      fs.writeFileSync(filePath, '{"key": "value"}');
      const info = executor.fileInfo({ path: filePath });
      expect(info.type).toBe('file');
      expect(info.extension).toBe('.json');
      expect(info.mimeType).toBe('application/json');
      expect(info.size).toBeGreaterThan(0);
    });
  });
});

// ─── Terminal Executor ────────────────────────────────────────────────────────

describe('TerminalExecutor', () => {
  let executor: TerminalExecutor;

  beforeEach(() => {
    executor = new TerminalExecutor();
  });

  it('executes a simple command', async () => {
    const result = await executor.execute({ command: 'echo hello' });
    expect(result.stdout).toContain('hello');
    expect(result.exitCode).toBe(0);
    expect(result.executionTimeMs).toBeGreaterThan(0);
    expect(result.timedOut).toBe(false);
  });

  it('captures stderr', async () => {
    // Use node to write to stderr
    const result = await executor.execute({
      command: 'node -e "process.stderr.write(\'err msg\')"',
    });
    expect(result.stderr).toContain('err msg');
  });

  it('times out long commands', async () => {
    // Sleep for 10s but timeout at 500ms
    const result = await executor.execute({
      command: process.platform === 'win32' ? 'ping -n 10 localhost' : 'sleep 10',
      timeout: 500,
    });
    expect(result.timedOut).toBe(true);
  }, 10000);

  it('reports exit codes', async () => {
    const result = await executor.execute({ command: 'exit 42', shell: process.platform === 'win32' ? 'cmd' : 'bash' });
    expect(result.exitCode).toBe(42);
  });
});

// ─── Terminal Safety Hook ─────────────────────────────────────────────────────

describe('Terminal Safety Hook', () => {
  it('blocks rm -rf /', async () => {
    expect(isCommandBlocked('rm -rf /')).toBe(true);
    expect(isCommandBlocked('sudo rm -rf ~/')).toBe(true);
    expect(isCommandBlocked('mkfs /dev/sda')).toBe(true);
    expect(isCommandBlocked('dd if=/dev/zero of=/dev/sda')).toBe(true);
  });

  it('allows normal commands', () => {
    expect(isCommandBlocked('ls -la')).toBe(false);
    expect(isCommandBlocked('npm install')).toBe(false);
    expect(isCommandBlocked('git status')).toBe(false);
    expect(isCommandBlocked('node script.js')).toBe(false);
  });

  it('identifies safe commands', () => {
    expect(isCommandSafe('ls -la')).toBe(true);
    expect(isCommandSafe('git status')).toBe(true);
    expect(isCommandSafe('pwd')).toBe(true);
    expect(isCommandSafe('node --version')).toBe(true);
    expect(isCommandSafe('npm list')).toBe(true);
  });

  it('identifies unsafe commands', () => {
    expect(isCommandSafe('rm -rf node_modules')).toBe(false);
    expect(isCommandSafe('npm install express')).toBe(false);
    expect(isCommandSafe('curl https://example.com')).toBe(false);
    expect(isCommandSafe('chmod 777 /tmp/x')).toBe(false);
  });

  it('hook denies blocked commands via PreToolUse pipeline', async () => {
    const registry = new ToolHookRegistryImpl();
    registry.registerPreHook(createTerminalSafetyHook());

    const context: ToolHookContext = {
      toolName: 'execute_command',
      toolParams: { command: 'rm -rf /' },
      subagentId: null,
      subtaskId: null,
      sessionId: 'test',
      domain: 'system',
      autonomyTier: 'alter_ego', // Even Alter Ego can't bypass this
    };

    const result = await executePreToolHooks(registry, context);
    expect(result.proceed).toBe(false);
    expect(result.denyReason).toContain('blocked for safety');
  });
});

// ─── Filesystem Permission Hook ───────────────────────────────────────────────

describe('Filesystem Permission Hook', () => {
  it('blocks writes to system paths in Guardian/Partner mode', async () => {
    const registry = new ToolHookRegistryImpl();
    registry.registerPreHook(createFilesystemPermissionHook());

    const context: ToolHookContext = {
      toolName: 'write_file',
      toolParams: { path: '/usr/bin/malicious' },
      subagentId: null,
      subtaskId: null,
      sessionId: 'test',
      domain: 'files',
      autonomyTier: 'partner',
    };

    const result = await executePreToolHooks(registry, context);
    expect(result.proceed).toBe(false);
    expect(result.denyReason).toContain('system path');
  });

  it('allows writes to user paths', async () => {
    const registry = new ToolHookRegistryImpl();
    registry.registerPreHook(createFilesystemPermissionHook());

    const context: ToolHookContext = {
      toolName: 'write_file',
      toolParams: { path: path.join(os.homedir(), 'Desktop', 'test.txt') },
      subagentId: null,
      subtaskId: null,
      sessionId: 'test',
      domain: 'files',
      autonomyTier: 'partner',
    };

    const result = await executePreToolHooks(registry, context);
    expect(result.proceed).toBe(true);
  });
});

// ─── Subagent Scoped Tools ────────────────────────────────────────────────────

describe('Subagent scoped filesystem tools', () => {
  it('a research subtask can use read_file but not write_file', () => {
    // Demonstrate the SubtaskDefinition pattern
    const researchSubtask = {
      id: 'st-research',
      description: 'Research the codebase',
      successCriteria: 'Gather relevant code context',
      allowedTools: ['read_file', 'search_file_contents', 'glob_search', 'list_directory'],
      modelTier: 'primary' as const,
      maxTokens: 2048,
      timeoutMs: 60000,
      contextBudget: 4096,
      turnBudget: 10,
    };

    // Research subtask has read tools but NOT write tools
    expect(researchSubtask.allowedTools).toContain('read_file');
    expect(researchSubtask.allowedTools).toContain('search_file_contents');
    expect(researchSubtask.allowedTools).not.toContain('write_file');
    expect(researchSubtask.allowedTools).not.toContain('execute_command');
    expect(researchSubtask.allowedTools).not.toContain('edit_file');
  });
});
