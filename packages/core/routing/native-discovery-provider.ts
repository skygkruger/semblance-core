// Native Discovery Provider — Platform-specific MDNSProvider implementations.
//
// ReactNativeMDNSProvider: Wraps React Native native module for iOS Bonjour / Android NSD
// TauriMDNSProvider: Wraps Tauri command for desktop mDNS (mdns-sd crate)
//
// CRITICAL: No network imports in this file. mDNS is provided by the platform layer.
// The actual network operations happen inside the native module or Tauri command.

import type { MDNSProvider, DiscoveredDevice } from './discovery.js';
import { MDNS_SERVICE_TYPE } from './discovery.js';

/**
 * Native module interface for React Native mDNS (iOS Bonjour / Android NSD).
 * This matches the shape of the native module registered in React Native.
 */
export interface RNMDNSNativeModule {
  advertise(serviceType: string, serviceName: string, port: number, txtRecord: Record<string, string>): Promise<void>;
  stopAdvertising(): Promise<void>;
  startDiscovery(serviceType: string): Promise<void>;
  stopDiscovery(): Promise<void>;
  // Event-based: onServiceFound and onServiceLost delivered via NativeEventEmitter
}

/**
 * React Native event emitter interface for mDNS discovery callbacks.
 */
export interface RNEventSubscription {
  remove(): void;
}

export interface RNEventEmitter {
  addListener(event: string, handler: (data: any) => void): RNEventSubscription;
}

/**
 * ReactNativeMDNSProvider — MDNSProvider for iOS (Bonjour) and Android (NSD).
 *
 * Delegates to a React Native native module that handles the actual mDNS
 * advertisement and discovery using platform APIs:
 * - iOS: NSNetServiceBrowser / NWBrowser
 * - Android: NsdManager
 */
export class ReactNativeMDNSProvider implements MDNSProvider {
  private nativeModule: RNMDNSNativeModule;
  private eventEmitter: RNEventEmitter;
  private foundSubscription: RNEventSubscription | null = null;
  private lostSubscription: RNEventSubscription | null = null;

  constructor(nativeModule: RNMDNSNativeModule, eventEmitter: RNEventEmitter) {
    this.nativeModule = nativeModule;
    this.eventEmitter = eventEmitter;
  }

  async advertise(service: DiscoveredDevice): Promise<void> {
    const txtRecord: Record<string, string> = {
      deviceId: service.deviceId,
      deviceName: service.deviceName,
      deviceType: service.deviceType,
      platform: service.platform,
      protocolVersion: String(service.protocolVersion),
    };

    await this.nativeModule.advertise(
      MDNS_SERVICE_TYPE,
      `semblance-${service.deviceId.slice(0, 8)}`,
      service.syncPort,
      txtRecord,
    );
  }

  async stopAdvertising(): Promise<void> {
    await this.nativeModule.stopAdvertising();
  }

  async startDiscovery(
    onFound: (device: DiscoveredDevice) => void,
    onLost: (deviceId: string) => void,
  ): Promise<void> {
    // Subscribe to native events
    this.foundSubscription = this.eventEmitter.addListener('mdnsServiceFound', (data: any) => {
      const device: DiscoveredDevice = {
        deviceId: data.txtRecord?.deviceId ?? data.name,
        deviceName: data.txtRecord?.deviceName ?? data.name,
        deviceType: data.txtRecord?.deviceType ?? 'desktop',
        platform: data.txtRecord?.platform ?? 'unknown',
        protocolVersion: parseInt(data.txtRecord?.protocolVersion ?? '1', 10),
        syncPort: data.port,
        ipAddress: data.host ?? data.addresses?.[0] ?? '',
      };
      onFound(device);
    });

    this.lostSubscription = this.eventEmitter.addListener('mdnsServiceLost', (data: any) => {
      onLost(data.txtRecord?.deviceId ?? data.name);
    });

    await this.nativeModule.startDiscovery(MDNS_SERVICE_TYPE);
  }

  async stopDiscovery(): Promise<void> {
    this.foundSubscription?.remove();
    this.lostSubscription?.remove();
    this.foundSubscription = null;
    this.lostSubscription = null;
    await this.nativeModule.stopDiscovery();
  }
}

/**
 * Tauri command interface for desktop mDNS (mdns-sd Rust crate).
 */
export interface TauriMDNSCommands {
  invoke(command: 'mdns_advertise', args: { serviceType: string; serviceName: string; port: number; txtRecord: Record<string, string> }): Promise<void>;
  invoke(command: 'mdns_stop_advertising'): Promise<void>;
  invoke(command: 'mdns_start_discovery', args: { serviceType: string }): Promise<void>;
  invoke(command: 'mdns_stop_discovery'): Promise<void>;
}

export interface TauriEventEmitter {
  listen(event: string, handler: (event: { payload: any }) => void): Promise<{ unlisten: () => void }>;
}

/**
 * TauriMDNSProvider — MDNSProvider for desktop (macOS/Windows/Linux).
 *
 * Delegates to Tauri commands backed by the mdns-sd Rust crate.
 * Events are delivered via Tauri's event system.
 */
export class TauriMDNSProvider implements MDNSProvider {
  private commands: TauriMDNSCommands;
  private events: TauriEventEmitter;
  private unlistenFound: (() => void) | null = null;
  private unlistenLost: (() => void) | null = null;

  constructor(commands: TauriMDNSCommands, events: TauriEventEmitter) {
    this.commands = commands;
    this.events = events;
  }

  async advertise(service: DiscoveredDevice): Promise<void> {
    await this.commands.invoke('mdns_advertise', {
      serviceType: MDNS_SERVICE_TYPE,
      serviceName: `semblance-${service.deviceId.slice(0, 8)}`,
      port: service.syncPort,
      txtRecord: {
        deviceId: service.deviceId,
        deviceName: service.deviceName,
        deviceType: service.deviceType,
        platform: service.platform,
        protocolVersion: String(service.protocolVersion),
      },
    });
  }

  async stopAdvertising(): Promise<void> {
    await this.commands.invoke('mdns_stop_advertising');
  }

  async startDiscovery(
    onFound: (device: DiscoveredDevice) => void,
    onLost: (deviceId: string) => void,
  ): Promise<void> {
    const foundHandle = await this.events.listen('mdns-service-found', (event) => {
      const data = event.payload;
      const device: DiscoveredDevice = {
        deviceId: data.txtRecord?.deviceId ?? data.name,
        deviceName: data.txtRecord?.deviceName ?? data.name,
        deviceType: data.txtRecord?.deviceType ?? 'desktop',
        platform: data.txtRecord?.platform ?? 'unknown',
        protocolVersion: parseInt(data.txtRecord?.protocolVersion ?? '1', 10),
        syncPort: data.port,
        ipAddress: data.host ?? '',
      };
      onFound(device);
    });
    this.unlistenFound = foundHandle.unlisten;

    const lostHandle = await this.events.listen('mdns-service-lost', (event) => {
      onLost(event.payload.txtRecord?.deviceId ?? event.payload.name);
    });
    this.unlistenLost = lostHandle.unlisten;

    await this.commands.invoke('mdns_start_discovery', { serviceType: MDNS_SERVICE_TYPE });
  }

  async stopDiscovery(): Promise<void> {
    this.unlistenFound?.();
    this.unlistenLost?.();
    this.unlistenFound = null;
    this.unlistenLost = null;
    await this.commands.invoke('mdns_stop_discovery');
  }
}
