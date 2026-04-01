// Terminal Executor — Runs shell commands on the user's machine.
//
// Commands execute via child_process.spawn with:
//   - Configurable timeout (default 30s)
//   - Platform-appropriate shell selection
//   - Output capture (stdout + stderr)
//   - Blocked command deny list (rm -rf /, format, etc.) enforced at the hook level
//
// This file is in packages/gateway/. Local process execution is permitted.

import { spawn, type SpawnOptions } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { resolve } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  command: string;
  shell: string;
  timedOut: boolean;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export class TerminalExecutor {
  /**
   * Execute a shell command.
   *
   * The command runs in a child process with the specified shell, working
   * directory, and timeout. stdout and stderr are captured and returned.
   */
  async execute(params: {
    command: string;
    workingDirectory?: string;
    timeout?: number;
    shell?: string;
  }): Promise<TerminalResult> {
    const timeout = params.timeout ?? 30_000;
    const cwd = params.workingDirectory
      ? resolve(params.workingDirectory.startsWith('~')
          ? params.workingDirectory.replace('~', homedir())
          : params.workingDirectory)
      : homedir();

    const shellCmd = params.shell ?? this.getDefaultShell();
    const startTime = Date.now();

    return new Promise<TerminalResult>((resolvePromise) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const shellArgs = this.getShellArgs(shellCmd, params.command);

      const spawnOpts: SpawnOptions = {
        cwd,
        shell: false, // We're invoking the shell explicitly
        timeout: 0,   // We handle timeout ourselves
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      };

      const child = spawn(shellArgs[0]!, shellArgs.slice(1), spawnOpts);

      // Timeout handler
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Force kill after 5 more seconds if SIGTERM didn't work
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        // Cap output to prevent OOM on long-running commands
        if (stdout.length > 1_000_000) {
          stdout = stdout.slice(0, 1_000_000) + '\n[Output truncated at 1MB]';
          child.kill('SIGTERM');
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        if (stderr.length > 500_000) {
          stderr = stderr.slice(0, 500_000) + '\n[Stderr truncated at 500KB]';
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolvePromise({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          executionTimeMs: Date.now() - startTime,
          command: params.command,
          shell: shellCmd,
          timedOut,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolvePromise({
          stdout: '',
          stderr: err.message,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          command: params.command,
          shell: shellCmd,
          timedOut: false,
        });
      });
    });
  }

  /**
   * Get the default shell for the current platform.
   */
  private getDefaultShell(): string {
    const p = platform();
    if (p === 'win32') return 'powershell';
    return 'bash';
  }

  /**
   * Build the shell invocation arguments.
   */
  private getShellArgs(shell: string, command: string): string[] {
    switch (shell.toLowerCase()) {
      case 'bash':
        return ['/bin/bash', '-c', command];
      case 'sh':
        return ['/bin/sh', '-c', command];
      case 'zsh':
        return ['/bin/zsh', '-c', command];
      case 'powershell':
      case 'pwsh':
        return ['powershell', '-NoProfile', '-NonInteractive', '-Command', command];
      case 'cmd':
        return ['cmd', '/c', command];
      default:
        // Treat unknown shell as a direct binary path
        return [shell, '-c', command];
    }
  }
}
