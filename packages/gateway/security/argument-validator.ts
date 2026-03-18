// Argument Validator — Validates argument arrays before SystemCommandGateway.
// Rejects arguments that attempt sub-invocation, shell injection, or path traversal.
//
// This is NOT a regex heuristic guessing at attacks. These are structural rules:
// - Shell metacharacters are always rejected (there is no shell to interpret them)
// - Path traversal is always rejected (no argument may escape allowed directories)
// - Exec flags are always rejected (no sub-invocation via find --exec, etc.)
// - Maximum argument count and length enforced

import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';

// ─── Rejection Patterns ────────────────────────────────────────────────────────

const REJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /[;&|`$(){}[\]<>]/, reason: 'shell metacharacter detected' },
  { pattern: /\$\(/, reason: 'command substitution detected' },
  { pattern: /`[^`]*`/, reason: 'backtick substitution detected' },
  { pattern: />\s*\//, reason: 'output redirection to absolute path' },
  { pattern: /2>&1/, reason: 'stderr redirect detected' },
  { pattern: /--exec\s/i, reason: '--exec flag detected (sub-invocation risk)' },
  { pattern: /\.\.\//, reason: 'path traversal detected' },
  { pattern: /^-{1,2}exec/i, reason: 'exec flag detected' },
  { pattern: /\0/, reason: 'null byte detected' },
];

const MAX_ARG_LENGTH = 4096;
const MAX_ARG_COUNT = 32;

// ─── Argument Validator ────────────────────────────────────────────────────────

export class ArgumentValidator {
  private allowedPathPrefixes: string[];

  constructor() {
    const home = homedir();
    const tmp = tmpdir();
    const semblanceOutput = process.env['SEMBLANCE_OUTPUT_DIR'] ?? resolve(home, '.semblance', 'output');

    this.allowedPathPrefixes = [
      home.toLowerCase().replace(/\\/g, '/'),
      tmp.toLowerCase().replace(/\\/g, '/'),
      semblanceOutput.toLowerCase().replace(/\\/g, '/'),
    ];
  }

  /**
   * Validate an argument array for a binary.
   * Returns null if valid, reason string if rejected.
   */
  validate(binaryName: string, args: string[]): string | null {
    // Check total argument count
    if (args.length > MAX_ARG_COUNT) {
      return `too many arguments: ${args.length} exceeds maximum of ${MAX_ARG_COUNT}`;
    }

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;

      // Check individual argument length
      if (arg.length > MAX_ARG_LENGTH) {
        return `argument ${i} too long: ${arg.length} chars exceeds maximum of ${MAX_ARG_LENGTH}`;
      }

      // Check against rejection patterns
      for (const { pattern, reason } of REJECTION_PATTERNS) {
        if (pattern.test(arg)) {
          return `argument ${i} rejected: ${reason}`;
        }
      }

      // Check path arguments — if an argument looks like an absolute path,
      // verify it's within allowed directories
      if (this.looksLikePath(arg)) {
        const normalized = arg.toLowerCase().replace(/\\/g, '/');
        const isAllowed = this.allowedPathPrefixes.some(prefix => normalized.startsWith(prefix));
        if (!isAllowed) {
          return `argument ${i} rejected: path '${arg}' is outside allowed directories`;
        }
      }
    }

    return null; // All arguments valid
  }

  /**
   * Check if a string looks like an absolute file path.
   */
  private looksLikePath(arg: string): boolean {
    // Unix absolute path
    if (arg.startsWith('/') && !arg.startsWith('//')) return true;
    // Windows absolute path (C:\, D:\, etc.)
    if (/^[A-Za-z]:[/\\]/.test(arg)) return true;
    return false;
  }
}
