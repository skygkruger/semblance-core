// Device Capability Registry
// Stores and queries device capabilities for task routing.
// CRITICAL: No networking imports. Pure local data management.
// Device discovery (mDNS/Bonjour) is Sprint 3 — this step stores capabilities only.

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

// --- Interfaces ---

export interface DeviceCapabilities {
  id: string;
  name: string;
  type: 'desktop' | 'mobile';
  platform: 'macos' | 'windows' | 'linux' | 'ios' | 'android';

  // Compute capabilities
  llmRuntime: 'ollama' | 'mlx' | 'llamacpp' | null;
  maxModelSize: string;
  gpuAvailable: boolean;
  ramGB: number;

  // Connectivity
  isOnline: boolean;
  lastSeen: string;
  networkType: 'wifi' | 'cellular' | 'ethernet' | 'offline';

  // Power
  batteryLevel: number | null;
  isCharging: boolean;

  // Available features
  features: string[];

  // Current load
  activeTasks: number;
  inferenceActive: boolean;
}

export interface TaskRequirements {
  minRAM: number;
  minModelSize: string;
  requiresGPU: boolean;
  requiresNetwork: boolean;
  estimatedDurationMs: number;
  estimatedBatteryImpact: 'low' | 'medium' | 'high';
  canRunOnMobile: boolean;
  canRunOnDesktop: boolean;
  preferredDevice: 'desktop' | 'mobile' | 'either';
}

// --- Schema ---

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('desktop', 'mobile')),
    platform TEXT NOT NULL,
    capabilities TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    registered_at TEXT NOT NULL
  );
`;

const CREATE_ROUTING_LOG = `
  CREATE TABLE IF NOT EXISTS routing_decisions (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    target_device_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    confidence REAL NOT NULL,
    timestamp TEXT NOT NULL
  );
`;

interface DeviceRow {
  id: string;
  name: string;
  type: string;
  platform: string;
  capabilities: string;
  last_seen: string;
  registered_at: string;
}

function rowToDevice(row: DeviceRow): DeviceCapabilities {
  const caps = JSON.parse(row.capabilities) as Partial<DeviceCapabilities>;
  return {
    id: row.id,
    name: row.name,
    type: row.type as DeviceCapabilities['type'],
    platform: row.platform as DeviceCapabilities['platform'],
    llmRuntime: caps.llmRuntime ?? null,
    maxModelSize: caps.maxModelSize ?? '0B',
    gpuAvailable: caps.gpuAvailable ?? false,
    ramGB: caps.ramGB ?? 0,
    isOnline: caps.isOnline ?? false,
    lastSeen: row.last_seen,
    networkType: caps.networkType ?? 'offline',
    batteryLevel: caps.batteryLevel ?? null,
    isCharging: caps.isCharging ?? false,
    features: caps.features ?? [],
    activeTasks: caps.activeTasks ?? 0,
    inferenceActive: caps.inferenceActive ?? false,
  };
}

// --- DeviceRegistry ---

export class DeviceRegistry {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
    this.db.exec(CREATE_ROUTING_LOG);
  }

  /**
   * Register a device's capabilities. If the device already exists, update it.
   */
  register(device: DeviceCapabilities): void {
    const now = new Date().toISOString();
    const capabilities = JSON.stringify({
      llmRuntime: device.llmRuntime,
      maxModelSize: device.maxModelSize,
      gpuAvailable: device.gpuAvailable,
      ramGB: device.ramGB,
      isOnline: device.isOnline,
      networkType: device.networkType,
      batteryLevel: device.batteryLevel,
      isCharging: device.isCharging,
      features: device.features,
      activeTasks: device.activeTasks,
      inferenceActive: device.inferenceActive,
    });

    const existing = this.db.prepare('SELECT id FROM devices WHERE id = ?').get(device.id) as { id: string } | undefined;
    if (existing) {
      this.db.prepare(
        'UPDATE devices SET name = ?, type = ?, platform = ?, capabilities = ?, last_seen = ? WHERE id = ?'
      ).run(device.name, device.type, device.platform, capabilities, device.lastSeen || now, device.id);
    } else {
      this.db.prepare(
        'INSERT INTO devices (id, name, type, platform, capabilities, last_seen, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(device.id, device.name, device.type, device.platform, capabilities, device.lastSeen || now, now);
    }
  }

  /**
   * Update capabilities for an existing device.
   */
  update(deviceId: string, updates: Partial<DeviceCapabilities>): void {
    const row = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as DeviceRow | undefined;
    if (!row) throw new Error(`Device not found: ${deviceId}`);

    const existing = rowToDevice(row);
    const merged: DeviceCapabilities = { ...existing, ...updates, id: deviceId };
    this.register(merged);
  }

  /**
   * Get all registered devices.
   */
  getDevices(): DeviceCapabilities[] {
    const rows = this.db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all() as DeviceRow[];
    return rows.map(rowToDevice);
  }

  /**
   * Get a specific device by ID.
   */
  getDevice(deviceId: string): DeviceCapabilities | null {
    const row = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as DeviceRow | undefined;
    return row ? rowToDevice(row) : null;
  }

  /**
   * Get the device best suited for a set of task requirements.
   * Returns null if no device can handle the task.
   */
  getBestDevice(requirements: TaskRequirements): DeviceCapabilities | null {
    const devices = this.getDevices().filter(d => d.isOnline);
    if (devices.length === 0) return null;

    // Filter to devices that meet the requirements
    const capable = devices.filter(d => {
      if (requirements.requiresNetwork && d.networkType === 'offline') return false;
      if (requirements.requiresGPU && !d.gpuAvailable) return false;
      if (d.ramGB < requirements.minRAM) return false;
      if (!meetsModelSize(d.maxModelSize, requirements.minModelSize)) return false;
      if (d.type === 'mobile' && !requirements.canRunOnMobile) return false;
      if (d.type === 'desktop' && !requirements.canRunOnDesktop) return false;
      return true;
    });

    if (capable.length === 0) return null;
    if (capable.length === 1) return capable[0]!;

    // Score devices by preference
    return capable.sort((a, b) => scoreDevice(b, requirements) - scoreDevice(a, requirements))[0]!;
  }

  /**
   * Log a routing decision for auditability.
   */
  logDecision(taskType: string, targetDeviceId: string, reason: string, confidence: number): void {
    this.db.prepare(
      'INSERT INTO routing_decisions (id, task_type, target_device_id, reason, confidence, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(nanoid(), taskType, targetDeviceId, reason, confidence, new Date().toISOString());
  }

  /**
   * Get recent routing decisions.
   */
  getRecentDecisions(limit = 20): Array<{ id: string; taskType: string; targetDeviceId: string; reason: string; confidence: number; timestamp: string }> {
    return this.db.prepare(
      'SELECT id, task_type AS taskType, target_device_id AS targetDeviceId, reason, confidence, timestamp FROM routing_decisions ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as Array<{ id: string; taskType: string; targetDeviceId: string; reason: string; confidence: number; timestamp: string }>;
  }
}

// --- Helpers ---

const MODEL_SIZE_ORDER: Record<string, number> = {
  '0B': 0, '1B': 1, '3B': 3, '7B': 7, '8B': 8, '13B': 13, '30B': 30, '70B': 70,
};

function parseModelSize(size: string): number {
  return MODEL_SIZE_ORDER[size] ?? (parseInt(size, 10) || 0);
}

function meetsModelSize(deviceMax: string, required: string): boolean {
  return parseModelSize(deviceMax) >= parseModelSize(required);
}

function scoreDevice(device: DeviceCapabilities, requirements: TaskRequirements): number {
  let score = 0;

  // Prefer the device type the task wants
  if (requirements.preferredDevice === device.type) score += 10;
  if (requirements.preferredDevice === 'either') score += 5;

  // Prefer devices not currently running inference
  if (!device.inferenceActive) score += 8;

  // Prefer fewer active tasks
  score -= device.activeTasks * 2;

  // Prefer better connectivity
  if (device.networkType === 'ethernet') score += 3;
  if (device.networkType === 'wifi') score += 2;
  if (device.networkType === 'cellular') score += 1;

  // Battery considerations for mobile
  if (device.type === 'mobile' && device.batteryLevel !== null) {
    if (device.batteryLevel < 20 && requirements.estimatedBatteryImpact !== 'low') {
      score -= 15; // Heavily penalize low-battery mobile for demanding tasks
    }
    if (device.isCharging) score += 3;
  }

  // Prefer more RAM
  score += Math.min(device.ramGB, 16);

  // Desktop gets a baseline bonus (more compute, reliable power)
  if (device.type === 'desktop') score += 5;

  return score;
}
