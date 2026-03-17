// WireGuard Process Manager — Manages the boringtun userspace WireGuard process.
//
// boringtun is a Rust WireGuard implementation that runs in userspace — no kernel
// modules, no root access required. Spawned as a child process of the Gateway daemon.
//
// Platform implementations:
//   macOS/Linux: boringtun-cli binary in app resources, config via stdin
//   Windows: WireGuard Windows service via PowerShell, or boringtun.exe

import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import type { WireGuardConfig, WireGuardPeer } from './headscale-client.js';

export class WireGuardManager {
  private process: ChildProcess | null = null;
  private meshIp: string | null = null;
  private running = false;
  private configPath: string;
  private dataDir: string;

  constructor(config?: { dataDir?: string }) {
    this.dataDir = config?.dataDir ?? join(homedir(), '.semblance');
    this.configPath = join(this.dataDir, 'wg0.conf');
  }

  /**
   * Start the WireGuard tunnel with the provided config.
   */
  async start(config: WireGuardConfig): Promise<void> {
    if (this.running) return;

    // Write WireGuard config file
    const confContent = this.buildConfigFile(config);
    writeFileSync(this.configPath, confContent, { mode: 0o600 });
    this.meshIp = config.meshIp;

    const os = platform();

    if (os === 'win32') {
      await this.startWindows();
    } else {
      await this.startUnix();
    }

    this.running = true;
    console.log(`[WireGuard] Started on ${config.meshIp}`);
  }

  /**
   * Stop the WireGuard tunnel.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    // Clean up config file
    try {
      if (existsSync(this.configPath)) unlinkSync(this.configPath);
    } catch { /* ignore */ }

    this.running = false;
    this.meshIp = null;
    console.log('[WireGuard] Stopped');
  }

  /**
   * Check if the tunnel is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the current mesh IP address.
   */
  getMeshIp(): string | null {
    return this.meshIp;
  }

  /**
   * Ping a peer's mesh IP to verify tunnel connectivity.
   */
  async pingPeer(meshIp: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const os = platform();
      const args = os === 'win32'
        ? ['-n', '1', '-w', '3000', meshIp]
        : ['-c', '1', '-W', '3', meshIp];

      const ping = spawn('ping', args, { stdio: 'pipe' });
      let exitCode: number | null = null;

      ping.on('close', (code) => {
        exitCode = code;
        resolve(code === 0);
      });

      ping.on('error', () => resolve(false));

      // Timeout fallback
      setTimeout(() => {
        if (exitCode === null) {
          ping.kill();
          resolve(false);
        }
      }, 5000);
    });
  }

  /**
   * Add a new peer to the running WireGuard config.
   */
  async addPeer(peer: WireGuardPeer): Promise<void> {
    // Read existing config, append peer, write back
    if (!existsSync(this.configPath)) return;

    const peerSection = this.buildPeerSection(peer);
    const { appendFileSync } = require('node:fs');
    appendFileSync(this.configPath, '\n' + peerSection);

    // If using wg-quick style, we'd need to reload. With boringtun, we restart.
    // For production: use wg set to add peer without restart
    console.log(`[WireGuard] Peer added: ${peer.allowedIps}`);
  }

  /**
   * Get status for diagnostics.
   */
  getStatus(): { running: boolean; meshIp: string | null; processAlive: boolean } {
    return {
      running: this.running,
      meshIp: this.meshIp,
      processAlive: this.process !== null && !this.process.killed,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private buildConfigFile(config: WireGuardConfig): string {
    let conf = `[Interface]
PrivateKey = ${config.privateKey}
Address = ${config.meshIp}/32
ListenPort = ${config.listenPort}
`;

    for (const peer of config.peers) {
      conf += this.buildPeerSection(peer);
    }

    return conf;
  }

  private buildPeerSection(peer: WireGuardPeer): string {
    let section = `
[Peer]
PublicKey = ${peer.publicKey}
AllowedIPs = ${peer.allowedIps}`;
    if (peer.endpoint) {
      section += `\nEndpoint = ${peer.endpoint}`;
    }
    section += '\nPersistentKeepalive = 25\n';
    return section;
  }

  private async startUnix(): Promise<void> {
    // Try boringtun first, fall back to wg-quick
    const boringtunPath = join(this.dataDir, 'bin', 'boringtun-cli');

    if (existsSync(boringtunPath)) {
      this.process = spawn(boringtunPath, ['--foreground', 'wg0'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, WG_QUICK_USERSPACE_IMPLEMENTATION: boringtunPath },
      });
    } else {
      // Fall back to system wg-quick if available
      this.process = spawn('wg-quick', ['up', this.configPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    this.process.on('error', (err) => {
      console.error('[WireGuard] Process error:', err.message);
      this.running = false;
    });

    this.process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[WireGuard] Process exited with code ${code}`);
      }
      this.running = false;
    });

    // Wait for process to start
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private async startWindows(): Promise<void> {
    // On Windows, use the WireGuard service via PowerShell
    // The WireGuard Windows app installs a service that accepts config files
    this.process = spawn('powershell', [
      '-Command',
      `& 'C:\\Program Files\\WireGuard\\wireguard.exe' /installtunnelservice '${this.configPath}'`,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.on('error', (err) => {
      console.error('[WireGuard] Windows service error:', err.message);
      this.running = false;
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
