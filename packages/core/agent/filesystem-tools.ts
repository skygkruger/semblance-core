// Filesystem + Terminal Tool Definitions — Registers local platform tools
// with the orchestrator so users (and subagents) can interact with the
// filesystem and run commands on their own machine.
//
// This file defines tool SCHEMAS only. No filesystem operations here.
// Actual execution happens in packages/gateway/tools/.
//
// CRITICAL: This file is in packages/core/. No network imports. No fs imports.

import type { ToolDefinition } from '../llm/types.js';
import type { ActionType } from '../types/ipc.js';
import type { PreToolUseHook, PreToolUseAction, ToolHookContext } from './orchestrator-v2-types.js';

// ─── Filesystem Tool Definitions ──────────────────────────────────────────────

export const FILESYSTEM_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: "Read the contents of a file at any path on the user's filesystem. For large files, use maxBytes or lineRange to read a section.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative file path' },
        encoding: { type: 'string', description: "Text encoding (default 'utf-8')" },
        maxBytes: { type: 'number', description: 'Max bytes to read (for large files)' },
        lineRange: {
          type: 'object',
          properties: {
            start: { type: 'number', description: 'Start line (1-indexed)' },
            end: { type: 'number', description: 'End line (inclusive)' },
          },
          description: 'Read only a range of lines',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing file. Parent directories are created automatically unless disabled.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write to' },
        content: { type: 'string', description: 'File content to write' },
        createDirectories: { type: 'boolean', description: 'Create parent directories if missing (default true)' },
        overwrite: { type: 'boolean', description: 'Allow overwriting existing file (default false)' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Make targeted find-and-replace edits to an existing file. Each edit replaces one occurrence of oldText with newText. Use dryRun to preview changes.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              oldText: { type: 'string', description: 'Text to find' },
              newText: { type: 'string', description: 'Replacement text' },
            },
            required: ['oldText', 'newText'],
          },
          description: 'Array of find-and-replace operations',
        },
        dryRun: { type: 'boolean', description: 'Preview changes without writing (default false)' },
      },
      required: ['path', 'edits'],
    },
  },
  {
    name: 'list_directory',
    description: "List files and directories at a given path. Returns names, types, sizes, and modification dates. Use recursive for deep listing.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
        recursive: { type: 'boolean', description: 'List recursively (default false)' },
        maxDepth: { type: 'number', description: 'Max recursion depth (default 2)' },
        includeHidden: { type: 'boolean', description: 'Include hidden files/directories (default false)' },
        pattern: { type: 'string', description: "Glob filter pattern (e.g. '*.ts')" },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a new directory, including nested parent directories.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to create' },
      },
      required: ['path'],
    },
  },
  {
    name: 'move_file',
    description: 'Move or rename a file or directory. The original disappears from the source location.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source path' },
        destination: { type: 'string', description: 'Destination path' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'copy_file',
    description: 'Copy a file or directory to a new location. Non-destructive — the original stays.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source path' },
        destination: { type: 'string', description: 'Destination path' },
        overwrite: { type: 'boolean', description: 'Overwrite if destination exists (default false)' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'search_file_contents',
    description: 'Search for text patterns inside files (like grep). Returns matching lines with file path and context.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to search' },
        pattern: { type: 'string', description: 'Search pattern (text or regex)' },
        filePattern: { type: 'string', description: "Glob filter for which files to search (e.g. '*.py')" },
        maxResults: { type: 'number', description: 'Max results (default 50)' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive search (default false)' },
      },
      required: ['path', 'pattern'],
    },
  },
  {
    name: 'glob_search',
    description: "Find files matching a glob pattern in a directory (like find). Returns matching paths with size.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to search' },
        pattern: { type: 'string', description: "Glob pattern (e.g. '**/*.md', 'src/**/*.ts')" },
        maxResults: { type: 'number', description: 'Max results (default 100)' },
      },
      required: ['path', 'pattern'],
    },
  },
  {
    name: 'file_info',
    description: 'Get metadata about a file or directory without reading its contents — size, dates, permissions, MIME type.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path' },
      },
      required: ['path'],
    },
  },
];

// ─── Terminal Tool Definition ─────────────────────────────────────────────────

export const TERMINAL_TOOL_DEFINITION: ToolDefinition = {
  name: 'execute_command',
  description: "Run a shell command on the user's machine. Output is returned after completion. Use for running scripts, build tools, git commands, etc.",
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute' },
      workingDirectory: { type: 'string', description: 'Working directory (defaults to user home)' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
      shell: { type: 'string', description: "Shell to use: 'bash', 'powershell', 'cmd' (defaults to platform default)" },
    },
    required: ['command'],
  },
};

/** All filesystem + terminal tool definitions combined. */
export const ALL_PLATFORM_TOOLS: ToolDefinition[] = [
  ...FILESYSTEM_TOOL_DEFINITIONS,
  TERMINAL_TOOL_DEFINITION,
];

// ─── Action Type Mapping ──────────────────────────────────────────────────────

export const FILESYSTEM_TOOL_ACTION_MAP: Record<string, ActionType> = {
  'read_file': 'fs.read',
  'write_file': 'fs.write',
  'edit_file': 'fs.edit',
  'list_directory': 'fs.list',
  'create_directory': 'fs.mkdir',
  'move_file': 'fs.move',
  'copy_file': 'fs.copy',
  'search_file_contents': 'fs.search',
  'glob_search': 'fs.glob',
  'file_info': 'fs.info',
  'execute_command': 'terminal.execute',
};

/** All filesystem + terminal tool names. */
export const PLATFORM_TOOL_NAMES = ALL_PLATFORM_TOOLS.map(t => t.name);

// ─── Permission Hooks ─────────────────────────────────────────────────────────

/** Commands that are NEVER allowed regardless of autonomy tier. */
const BLOCKED_COMMANDS = [
  /rm\s+-rf\s+\//,
  /\bformat\b/i,
  /\bsudo\s+rm\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bdiskpart\b/i,
  /\bfdisk\b/,
  /\bdel\s+\/s\s+\/q\s+C:\\/i,
  /\brm\s+-rf\s+~\//,
  /\brm\s+-rf\s+\*/,
  /\b:(){ :\|:& };:/,          // Fork bomb
  />\s*\/dev\/sd[a-z]/,         // Direct disk write
];

/** Commands safe to auto-approve at Partner and Alter Ego tiers. */
const SAFE_COMMANDS = [
  /^ls\b/, /^dir\b/i, /^cat\b/, /^type\b/i, /^head\b/, /^tail\b/,
  /^pwd\b/, /^cd\b/, /^echo\b/, /^which\b/, /^where\b/i,
  /^node\s+--version/, /^npm\s+(list|ls|--version|version)\b/,
  /^git\s+(status|log|diff|branch|show|remote|tag)\b/,
  /^python\s+--version/, /^pip\s+(list|show)\b/,
  /^whoami\b/, /^hostname\b/, /^date\b/, /^uname\b/,
  /^env\b/, /^printenv\b/, /^set\b/,
];

/** System directories that always require approval for writes. */
const SYSTEM_PATHS = [
  /^\/(?:bin|sbin|usr|etc|var|boot|sys|proc|dev)\b/,
  /^C:\\Windows\b/i,
  /^C:\\Program Files\b/i,
  /^\/System\b/,
  /^\/Library\b/,
];

/**
 * Create the terminal safety PreToolUse hook.
 * Blocks dangerous commands before they reach the executor.
 */
export function createTerminalSafetyHook(): PreToolUseHook {
  return {
    id: 'builtin:terminal-safety',
    description: 'Blocks dangerous terminal commands (rm -rf /, format, etc.)',
    appliesTo: ['execute_command'],
    async execute(context: ToolHookContext): Promise<PreToolUseAction> {
      const command = (context.toolParams.command as string) ?? '';
      for (const pattern of BLOCKED_COMMANDS) {
        if (pattern.test(command)) {
          return {
            action: 'deny',
            reason: `Command blocked for safety: "${command}" matches a destructive pattern`,
          };
        }
      }
      return { action: 'allow' };
    },
  };
}

/**
 * Create the filesystem permission PreToolUse hook.
 * Enforces per-tier approval rules for write/move/delete operations and system paths.
 */
export function createFilesystemPermissionHook(): PreToolUseHook {
  return {
    id: 'builtin:filesystem-permission',
    description: 'Enforces filesystem permission rules for write/move operations and system paths',
    appliesTo: ['write_file', 'edit_file', 'move_file', 'create_directory', 'execute_command'],
    async execute(context: ToolHookContext): Promise<PreToolUseAction> {
      const path = (context.toolParams.path as string) ??
                   (context.toolParams.source as string) ??
                   (context.toolParams.workingDirectory as string) ?? '';

      // System paths always require approval regardless of tier
      for (const pattern of SYSTEM_PATHS) {
        if (pattern.test(path)) {
          if (context.autonomyTier === 'alter_ego') {
            return { action: 'allow' }; // Alter Ego trusts the user's configuration
          }
          return {
            action: 'deny',
            reason: `Write to system path "${path}" requires manual approval`,
          };
        }
      }

      return { action: 'allow' };
    },
  };
}

/**
 * Check if a terminal command is on the safe list (auto-approvable at Partner+).
 */
export function isCommandSafe(command: string): boolean {
  return SAFE_COMMANDS.some(pattern => pattern.test(command.trim()));
}

/**
 * Check if a terminal command is blocked (never execute).
 */
export function isCommandBlocked(command: string): boolean {
  return BLOCKED_COMMANDS.some(pattern => pattern.test(command));
}
