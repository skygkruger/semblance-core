// Encrypted Sync Transport — SyncTransport over local-network TCP.
//
// Sends and receives EncryptedSyncPayload between paired devices.
// On mobile: wraps react-native-tcp-socket
// On desktop: wraps Node.js net module (via Tauri)
//
// CRITICAL: Local network only. No cloud relay. No external connections.
// The transport layer doesn't handle encryption — that's done by SyncCryptoProvider
// before the payload reaches this layer.

import type { SyncTransport, EncryptedSyncPayload } from './sync.js';

/**
 * Connection info for a paired device.
 */
export interface DeviceConnection {
  deviceId: string;
  ipAddress: string;
  port: number;
}

/**
 * Abstract TCP socket interface — implemented by platform-specific modules.
 * On mobile: react-native-tcp-socket
 * On desktop: Node.js net module
 */
export interface TCPSocketProvider {
  connect(host: string, port: number): Promise<TCPConnection>;
  listen(port: number, handler: (connection: TCPConnection) => void): Promise<TCPServer>;
}

export interface TCPConnection {
  send(data: string): Promise<void>;
  receive(): Promise<string>;
  close(): Promise<void>;
}

export interface TCPServer {
  close(): Promise<void>;
  port: number;
}

/**
 * EncryptedSyncTransportImpl — SyncTransport over local TCP.
 *
 * The transport:
 * 1. Maintains a map of paired device connections
 * 2. Sends JSON-serialized EncryptedSyncPayload over TCP
 * 3. Receives responses as EncryptedSyncPayload
 * 4. Reports device reachability based on connection state
 *
 * All data transmitted is already encrypted by SyncCryptoProvider.
 * This layer only handles the transport.
 */
export class EncryptedSyncTransportImpl implements SyncTransport {
  private socketProvider: TCPSocketProvider;
  private deviceConnections: Map<string, DeviceConnection> = new Map();
  private reachableDevices: Set<string> = new Set();
  private receiveHandler: ((payload: EncryptedSyncPayload) => Promise<EncryptedSyncPayload>) | null = null;
  private server: TCPServer | null = null;

  constructor(socketProvider: TCPSocketProvider) {
    this.socketProvider = socketProvider;
  }

  /**
   * Register a paired device's connection info.
   */
  registerDevice(connection: DeviceConnection): void {
    this.deviceConnections.set(connection.deviceId, connection);
    this.reachableDevices.add(connection.deviceId);
  }

  /**
   * Remove a device's connection info.
   */
  unregisterDevice(deviceId: string): void {
    this.deviceConnections.delete(deviceId);
    this.reachableDevices.delete(deviceId);
  }

  /**
   * Mark a device as reachable or unreachable.
   */
  setDeviceReachable(deviceId: string, reachable: boolean): void {
    if (reachable) {
      this.reachableDevices.add(deviceId);
    } else {
      this.reachableDevices.delete(deviceId);
    }
  }

  /**
   * Send an encrypted sync payload to a paired device.
   * Returns the response payload or null on failure.
   */
  async send(deviceId: string, payload: EncryptedSyncPayload): Promise<EncryptedSyncPayload | null> {
    const conn = this.deviceConnections.get(deviceId);
    if (!conn) return null;

    try {
      const tcpConn = await this.socketProvider.connect(conn.ipAddress, conn.port);
      const message = JSON.stringify(payload);
      await tcpConn.send(message);

      const responseStr = await tcpConn.receive();
      await tcpConn.close();

      if (!responseStr) return null;
      return JSON.parse(responseStr) as EncryptedSyncPayload;
    } catch {
      this.reachableDevices.delete(deviceId);
      return null;
    }
  }

  /**
   * Register a handler for incoming sync payloads.
   * The handler processes the incoming payload and returns a response.
   */
  onReceive(handler: (payload: EncryptedSyncPayload) => Promise<EncryptedSyncPayload>): void {
    this.receiveHandler = handler;
  }

  /**
   * Start listening for incoming sync connections.
   */
  async startListening(port: number): Promise<void> {
    this.server = await this.socketProvider.listen(port, async (connection) => {
      if (!this.receiveHandler) {
        await connection.close();
        return;
      }

      try {
        const data = await connection.receive();
        const payload = JSON.parse(data) as EncryptedSyncPayload;
        const response = await this.receiveHandler(payload);
        await connection.send(JSON.stringify(response));
      } catch {
        // Connection error — ignore and close
      } finally {
        await connection.close();
      }
    });
  }

  /**
   * Stop listening for incoming connections.
   */
  async stopListening(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }

  /**
   * Check if a device is currently reachable.
   */
  isDeviceReachable(deviceId: string): boolean {
    return this.reachableDevices.has(deviceId);
  }

  /**
   * Get all registered device connections.
   */
  getRegisteredDevices(): ReadonlyMap<string, DeviceConnection> {
    return this.deviceConnections;
  }
}
