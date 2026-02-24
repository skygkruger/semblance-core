/**
 * Step 28 — PeerDiscovery tests.
 * Covers IPC-based discovery start/stop, peer tracking, peer lost.
 */

import { describe, it, expect, vi } from 'vitest';
import { PeerDiscovery, type NetworkIPCClient } from '@semblance/core/network/peer-discovery';
import type { DiscoveredPeer } from '@semblance/core/network/types';

function createMockIPC(): NetworkIPCClient {
  return {
    send: vi.fn().mockResolvedValue({ status: 'success' }),
  };
}

function createPeer(deviceId: string, displayName: string): DiscoveredPeer {
  return {
    deviceId,
    displayName,
    platform: 'desktop',
    ipAddress: '192.168.1.100',
    port: 7890,
    discoveredAt: new Date().toISOString(),
  };
}

describe('PeerDiscovery (Step 28)', () => {
  it('sends startDiscovery IPC action', async () => {
    const ipc = createMockIPC();
    const discovery = new PeerDiscovery({ ipcClient: ipc, localDeviceId: 'my-device' });

    const result = await discovery.startDiscovery();
    expect(result).toBe(true);
    expect(discovery.isDiscoveryActive()).toBe(true);
    expect(ipc.send).toHaveBeenCalledWith('network.startDiscovery', expect.objectContaining({
      serviceType: '_semblance-network._tcp.local.',
      localDeviceId: 'my-device',
    }));
  });

  it('sends stopDiscovery IPC action and clears peers', async () => {
    const ipc = createMockIPC();
    const discovery = new PeerDiscovery({ ipcClient: ipc, localDeviceId: 'my-device' });

    await discovery.startDiscovery();
    discovery.onPeerDiscovered(createPeer('peer-1', 'Alice'));
    expect(discovery.getDiscoveredPeers()).toHaveLength(1);

    const result = await discovery.stopDiscovery();
    expect(result).toBe(true);
    expect(discovery.isDiscoveryActive()).toBe(false);
    expect(discovery.getDiscoveredPeers()).toHaveLength(0);
  });

  it('tracks discovered peers and ignores self', () => {
    const discovery = new PeerDiscovery({ localDeviceId: 'my-device' });

    discovery.onPeerDiscovered(createPeer('peer-1', 'Alice'));
    discovery.onPeerDiscovered(createPeer('peer-2', 'Bob'));
    discovery.onPeerDiscovered(createPeer('my-device', 'Self')); // Should be ignored

    expect(discovery.getDiscoveredPeers()).toHaveLength(2);
    expect(discovery.getPeer('peer-1')?.displayName).toBe('Alice');
    expect(discovery.getPeer('my-device')).toBeNull();
  });

  it('removes peers on peer lost', () => {
    const discovery = new PeerDiscovery({ localDeviceId: 'my-device' });

    discovery.onPeerDiscovered(createPeer('peer-1', 'Alice'));
    discovery.onPeerDiscovered(createPeer('peer-2', 'Bob'));
    expect(discovery.getDiscoveredPeers()).toHaveLength(2);

    discovery.onPeerLost('peer-1');
    expect(discovery.getDiscoveredPeers()).toHaveLength(1);
    expect(discovery.getPeer('peer-1')).toBeNull();
    expect(discovery.getPeer('peer-2')).not.toBeNull();
  });
});
