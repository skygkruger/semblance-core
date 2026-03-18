// SystemCommandGateway — Core of the Hardware Bridge.
// Every system.* action type routes through here.
//
// Uses child_process.execFile() exclusively — NEVER exec(), NEVER spawn() with shell=true.
// The shell is never invoked. There is no sh -c, no cmd /c, no string interpolation.
//
// Session-owned PID table: tracks PIDs spawned by system.execute.
// system.process_kill/signal may only target PIDs in this table.
// On session end, all session-owned PIDs are sent SIGTERM.

import { execFile as execFileCb } from 'node:child_process';
import { basename } from 'node:path';
import { platform } from 'node:os';
import type { BinaryAllowlist } from '../security/binary-allowlist.js';
import type { ArgumentValidator } from '../security/argument-validator.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SystemExecuteParams {
  binary: string;
  args: string[];
  stdin?: string;
  timeoutSeconds?: number;
  workingDir?: string;
  env?: Record<string, string>;
}

export interface SystemExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  pid: number | null;
}

// Safe environment variables — all others stripped from subprocesses
const SAFE_ENV_VARS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'SYSTEMROOT', 'COMSPEC',
]);

// ─── Session PID Table ─────────────────────────────────────────────────────────

class SessionPidTable {
  private pids: Map<number, { binary: string; startedAt: string }> = new Map();

  register(pid: number, binary: string): void {
    this.pids.set(pid, { binary, startedAt: new Date().toISOString() });
  }

  isOwned(pid: number): boolean {
    return this.pids.has(pid);
  }

  remove(pid: number): void {
    this.pids.delete(pid);
  }

  list(): Array<{ pid: number; binary: string; startedAt: string }> {
    return Array.from(this.pids.entries()).map(([pid, info]) => ({
      pid,
      binary: info.binary,
      startedAt: info.startedAt,
    }));
  }

  killAll(): void {
    for (const pid of this.pids.keys()) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Process may have already exited
      }
    }
    this.pids.clear();
  }
}

// ─── SystemCommandGateway ──────────────────────────────────────────────────────

export class SystemCommandGateway {
  private allowlist: BinaryAllowlist;
  private validator: ArgumentValidator;
  private pidTable: SessionPidTable = new SessionPidTable();

  constructor(allowlist: BinaryAllowlist, validator: ArgumentValidator) {
    this.allowlist = allowlist;
    this.validator = validator;
  }

  /**
   * Execute an allowlisted binary with validated arguments.
   * Uses child_process.execFile() — never exec(), never spawn() with shell=true.
   */
  async execute(params: SystemExecuteParams): Promise<SystemExecuteResult> {
    const startTime = Date.now();

    // Check allowlist
    const blockReason = this.allowlist.check(params.binary);
    if (blockReason) {
      throw new Error(`Binary execution blocked: ${blockReason}`);
    }

    // Validate arguments
    const argReason = this.validator.validate(basename(params.binary), params.args);
    if (argReason) {
      throw new Error(`Argument validation failed: ${argReason}`);
    }

    // Get allowlist entry for timeout
    const entry = this.allowlist.get(basename(params.binary));
    const timeoutMs = (params.timeoutSeconds ?? entry?.maxExecutionSeconds ?? 30) * 1000;

    // Check stdin permission
    if (params.stdin && entry && !entry.allowStdin) {
      throw new Error(`Binary '${basename(params.binary)}' is not permitted to receive stdin input`);
    }

    // Build sanitized environment — only safe vars from process.env
    const safeEnv: Record<string, string> = {};
    for (const key of SAFE_ENV_VARS) {
      if (process.env[key]) {
        safeEnv[key] = process.env[key]!;
      }
    }
    // Merge user-provided env (cannot override PATH)
    if (params.env) {
      for (const [key, value] of Object.entries(params.env)) {
        if (key !== 'PATH') {
          safeEnv[key] = value;
        }
      }
    }

    // Execute via execFile — the ONLY execution path
    return new Promise<SystemExecuteResult>((resolve) => {
      let timedOut = false;

      const child = execFileCb(
        params.binary,
        params.args,
        {
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          cwd: params.workingDir,
          env: safeEnv,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;

          if (error && 'killed' in error && error.killed) {
            timedOut = true;
          }

          let exitCode = 0;
          if (error && 'code' in error && typeof error.code === 'number') {
            exitCode = error.code;
          } else if (error) {
            exitCode = 1;
          }

          // Clean up PID table
          if (child.pid) {
            this.pidTable.remove(child.pid);
          }

          resolve({
            exitCode,
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            durationMs,
            timedOut,
            pid: child.pid ?? null,
          });
        },
      );

      // Register PID in session table
      if (child.pid) {
        this.pidTable.register(child.pid, basename(params.binary));
      }

      // Send stdin if provided
      if (params.stdin && child.stdin) {
        child.stdin.write(params.stdin);
        child.stdin.end();
      }
    });
  }

  /**
   * Send SIGTERM to a session-owned PID.
   */
  killProcess(pid: number): { success: boolean; error?: string } {
    if (!this.pidTable.isOwned(pid)) {
      return { success: false, error: `PID ${pid} is not a session-owned process` };
    }
    try {
      process.kill(pid, 'SIGTERM');
      this.pidTable.remove(pid);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Send an arbitrary signal to a session-owned PID.
   */
  signalProcess(pid: number, signal: string): { success: boolean; error?: string } {
    if (!this.pidTable.isOwned(pid)) {
      return { success: false, error: `PID ${pid} is not a session-owned process` };
    }
    try {
      process.kill(pid, signal as NodeJS.Signals);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * List session-owned processes.
   */
  listProcesses(): Array<{ pid: number; binary: string; startedAt: string }> {
    return this.pidTable.list();
  }

  /**
   * Kill all session-owned processes (called on session end / shutdown).
   */
  cleanup(): void {
    this.pidTable.killAll();
  }

  /**
   * Get the allowlist instance (for bridge handler use).
   */
  getAllowlist(): BinaryAllowlist {
    return this.allowlist;
  }

  /**
   * Get the argument validator (for bridge handler use).
   */
  getValidator(): ArgumentValidator {
    return this.validator;
  }
}
