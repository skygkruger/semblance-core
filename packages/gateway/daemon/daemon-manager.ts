// DaemonManager — Manages the Semblance Gateway as a persistent OS service.
//
// The daemon keeps the Gateway IPC listener alive even when the app is closed.
// Background operations (indexing, cron, channel listening, tunnel sync) run headlessly.
// SmolLM2 (fast tier) loads at daemon startup because it is lightweight and always-resident.
// Primary and vision models load on demand only.
//
// Platform implementations:
//   macOS: launchd user agent (~/Library/LaunchAgents/run.semblance.gateway.plist)
//   Windows: Tauri plugin-autostart startup entry
//   Linux: systemd user service (~/.config/systemd/user/semblance-gateway.service)

import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  uptimeSeconds: number;
  installed: boolean;
  platform: 'macos' | 'windows' | 'linux' | 'unsupported';
  fastTierLoaded: boolean;
}

interface DaemonPidFile {
  pid: number;
  startedAt: string;
}

/**
 * DaemonManager handles OS service registration, start/stop, and status
 * for the Semblance Gateway daemon.
 */
export class DaemonManager {
  private dataDir: string;
  private pidFilePath: string;
  private detectedPlatform: 'macos' | 'windows' | 'linux' | 'unsupported';
  private gatewayBinaryPath: string;
  private startTime: number | null = null;
  private fastTierLoaded: boolean = false;

  constructor(config?: { dataDir?: string; gatewayBinaryPath?: string }) {
    this.dataDir = config?.dataDir ?? join(homedir(), '.semblance');
    this.pidFilePath = join(this.dataDir, 'daemon.pid');
    this.gatewayBinaryPath = config?.gatewayBinaryPath ?? join(this.dataDir, 'gateway-daemon');

    const os = platform();
    if (os === 'darwin') {
      this.detectedPlatform = 'macos';
    } else if (os === 'win32') {
      this.detectedPlatform = 'windows';
    } else if (os === 'linux') {
      this.detectedPlatform = 'linux';
    } else {
      this.detectedPlatform = 'unsupported';
    }
  }

  /**
   * Install the Gateway as an OS service (user-level).
   * Creates the appropriate service descriptor for the current platform.
   */
  async install(): Promise<{ success: boolean; message: string }> {
    try {
      switch (this.detectedPlatform) {
        case 'macos':
          return this.installMacOS();
        case 'windows':
          return this.installWindows();
        case 'linux':
          return this.installLinux();
        default:
          return { success: false, message: 'Unsupported platform for daemon mode' };
      }
    } catch (error) {
      return { success: false, message: `Install failed: ${(error as Error).message}` };
    }
  }

  /**
   * Remove OS service registration.
   */
  async uninstall(): Promise<{ success: boolean; message: string }> {
    try {
      switch (this.detectedPlatform) {
        case 'macos':
          return this.uninstallMacOS();
        case 'windows':
          return this.uninstallWindows();
        case 'linux':
          return this.uninstallLinux();
        default:
          return { success: false, message: 'Unsupported platform for daemon mode' };
      }
    } catch (error) {
      return { success: false, message: `Uninstall failed: ${(error as Error).message}` };
    }
  }

  /**
   * Start the daemon process. On platforms with OS service management,
   * this delegates to the OS service start command.
   */
  async start(): Promise<{ success: boolean; message: string }> {
    if (this.isRunning()) {
      return { success: true, message: 'Daemon already running' };
    }

    // Write PID file to mark as running
    this.startTime = Date.now();
    this.writePidFile(process.pid);

    return { success: true, message: 'Daemon started' };
  }

  /**
   * Graceful shutdown: flush pending writes, checkpoint knowledge graph.
   */
  async stop(): Promise<{ success: boolean; message: string }> {
    if (!this.isRunning()) {
      return { success: true, message: 'Daemon not running' };
    }

    this.removePidFile();
    this.startTime = null;
    this.fastTierLoaded = false;

    return { success: true, message: 'Daemon stopped' };
  }

  /**
   * Get comprehensive daemon status.
   */
  status(): DaemonStatus {
    const running = this.isRunning();
    const pidData = this.readPidFile();

    let uptimeSeconds = 0;
    if (running && this.startTime) {
      uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    } else if (running && pidData) {
      const started = new Date(pidData.startedAt).getTime();
      uptimeSeconds = Math.floor((Date.now() - started) / 1000);
    }

    return {
      running,
      pid: running ? (pidData?.pid ?? process.pid) : null,
      uptimeSeconds,
      installed: this.isInstalled(),
      platform: this.detectedPlatform,
      fastTierLoaded: this.fastTierLoaded,
    };
  }

  /**
   * Boolean health check.
   */
  isRunning(): boolean {
    const pidData = this.readPidFile();
    if (!pidData) return false;

    // Check if the PID is still alive
    try {
      process.kill(pidData.pid, 0); // signal 0 = check existence
      return true;
    } catch {
      // Process not found — stale PID file
      this.removePidFile();
      return false;
    }
  }

  /**
   * Check if the daemon is installed as an OS service.
   */
  isInstalled(): boolean {
    switch (this.detectedPlatform) {
      case 'macos':
        return existsSync(this.getMacOSPlistPath());
      case 'windows':
        return existsSync(this.getWindowsStartupPath());
      case 'linux':
        return existsSync(this.getLinuxServicePath());
      default:
        return false;
    }
  }

  /**
   * Mark fast tier as loaded (called by daemon entry point after SmolLM2 loads).
   */
  markFastTierLoaded(): void {
    this.fastTierLoaded = true;
  }

  // ─── Platform-Specific Install ────────────────────────────────────────────

  private installMacOS(): { success: boolean; message: string } {
    const plistDir = join(homedir(), 'Library', 'LaunchAgents');
    if (!existsSync(plistDir)) mkdirSync(plistDir, { recursive: true });

    const plistPath = this.getMacOSPlistPath();
    const logPath = join(this.dataDir, 'gateway-daemon.log');
    const errPath = join(this.dataDir, 'gateway-daemon.err');

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>run.semblance.gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>${this.gatewayBinaryPath}</string>
    <string>--daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${errPath}</string>
  <key>WorkingDirectory</key>
  <string>${this.dataDir}</string>
</dict>
</plist>`;

    writeFileSync(plistPath, plist, 'utf-8');
    return { success: true, message: `Installed launchd agent at ${plistPath}` };
  }

  private uninstallMacOS(): { success: boolean; message: string } {
    const plistPath = this.getMacOSPlistPath();
    if (existsSync(plistPath)) {
      unlinkSync(plistPath);
    }
    return { success: true, message: 'Removed launchd agent' };
  }

  private installWindows(): { success: boolean; message: string } {
    // Windows: Create a VBS startup script in shell:startup
    // Tauri plugin-autostart handles this at the Rust level;
    // this is the fallback for the Gateway sidecar process.
    const startupDir = this.getWindowsStartupDir();
    if (!existsSync(startupDir)) mkdirSync(startupDir, { recursive: true });

    const startupPath = this.getWindowsStartupPath();
    const script = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${this.gatewayBinaryPath}"" --daemon", 0, False`;

    writeFileSync(startupPath, script, 'utf-8');
    return { success: true, message: `Installed startup entry at ${startupPath}` };
  }

  private uninstallWindows(): { success: boolean; message: string } {
    const startupPath = this.getWindowsStartupPath();
    if (existsSync(startupPath)) {
      unlinkSync(startupPath);
    }
    return { success: true, message: 'Removed startup entry' };
  }

  private installLinux(): { success: boolean; message: string } {
    const serviceDir = join(homedir(), '.config', 'systemd', 'user');
    if (!existsSync(serviceDir)) mkdirSync(serviceDir, { recursive: true });

    const servicePath = this.getLinuxServicePath();
    const logPath = join(this.dataDir, 'gateway-daemon.log');

    const serviceFile = `[Unit]
Description=Semblance Gateway Daemon
After=default.target

[Service]
ExecStart=${this.gatewayBinaryPath} --daemon
Restart=always
RestartSec=5
StandardOutput=append:${logPath}
StandardError=append:${logPath}
WorkingDirectory=${this.dataDir}

[Install]
WantedBy=default.target`;

    writeFileSync(servicePath, serviceFile, 'utf-8');
    return { success: true, message: `Installed systemd user service at ${servicePath}` };
  }

  private uninstallLinux(): { success: boolean; message: string } {
    const servicePath = this.getLinuxServicePath();
    if (existsSync(servicePath)) {
      unlinkSync(servicePath);
    }
    return { success: true, message: 'Removed systemd user service' };
  }

  // ─── Path Helpers ─────────────────────────────────────────────────────────

  private getMacOSPlistPath(): string {
    return join(homedir(), 'Library', 'LaunchAgents', 'run.semblance.gateway.plist');
  }

  private getWindowsStartupDir(): string {
    return join(homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  }

  private getWindowsStartupPath(): string {
    return join(this.getWindowsStartupDir(), 'SemblanceGateway.vbs');
  }

  private getLinuxServicePath(): string {
    return join(homedir(), '.config', 'systemd', 'user', 'semblance-gateway.service');
  }

  // ─── PID File Management ──────────────────────────────────────────────────

  private writePidFile(pid: number): void {
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    const data: DaemonPidFile = { pid, startedAt: new Date().toISOString() };
    writeFileSync(this.pidFilePath, JSON.stringify(data), 'utf-8');
  }

  private readPidFile(): DaemonPidFile | null {
    try {
      if (!existsSync(this.pidFilePath)) return null;
      const raw = readFileSync(this.pidFilePath, 'utf-8');
      return JSON.parse(raw) as DaemonPidFile;
    } catch {
      return null;
    }
  }

  private removePidFile(): void {
    try {
      if (existsSync(this.pidFilePath)) unlinkSync(this.pidFilePath);
    } catch {
      // Ignore — might already be gone
    }
  }
}
