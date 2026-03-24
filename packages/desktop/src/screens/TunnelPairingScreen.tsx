/**
 * TunnelPairingScreen — Compute Mesh device pairing over encrypted WireGuard tunnels.
 * Backend handlers: tunnel_wireguard_status, tunnel_wireguard_start, tunnel_wireguard_stop, tunnel_peer_manifest.
 */

import { useState, useEffect, useCallback } from 'react';
import { sidecarCall } from '../ipc/commands';

interface MeshStatus {
  running: boolean;
  meshIp: string | null;
  processAlive: boolean;
}

interface PeerDevice {
  deviceId: string;
  displayName: string;
  platform: string;
  meshIp: string;
  lastSeen: string;
}

export function TunnelPairingScreen() {
  const [loading, setLoading] = useState(true);
  const [meshStatus, setMeshStatus] = useState<MeshStatus>({ running: false, meshIp: null, processAlive: false });
  const [peers, setPeers] = useState<PeerDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const loadPeers = useCallback(async () => {
    try {
      const devices = await sidecarCall<PeerDevice[]>('tunnel_list_paired_devices');
      setPeers(Array.isArray(devices) ? devices : []);
    } catch (err) {
      console.error('[TunnelPairingScreen] Failed to load paired devices:', err);
      setPeers([]);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const status = await sidecarCall<MeshStatus>('tunnel_wireguard_status');
      setMeshStatus(status);
    } catch (err) {
      console.error('[TunnelPairingScreen] Failed to load status:', err);
      setMeshStatus({ running: false, meshIp: null, processAlive: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadPeers();
  }, [loadStatus, loadPeers]);

  // Reload peers when mesh status changes (e.g., after starting/stopping)
  useEffect(() => {
    if (meshStatus.running) {
      loadPeers();
    }
  }, [meshStatus.running, loadPeers]);

  const handleStartMesh = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await sidecarCall<MeshStatus>('tunnel_wireguard_start', {
        config: { listenPort: 51820 },
      });
      setMeshStatus(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[TunnelPairingScreen] Failed to start mesh:', err);
    } finally {
      setStarting(false);
    }
  }, []);

  const handleStopMesh = useCallback(async () => {
    setError(null);
    try {
      await sidecarCall<unknown>('tunnel_wireguard_stop');
      setMeshStatus({ running: false, meshIp: null, processAlive: false });
      setPeers([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[TunnelPairingScreen] Failed to stop mesh:', err);
    }
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
        <div style={{ color: '#8593A4', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14 }}>
          Loading mesh status...
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{
        fontFamily: "'Fraunces Variable', 'Fraunces', Georgia, serif",
        fontSize: 28,
        fontWeight: 300,
        color: '#EEF1F4',
        margin: 0,
        marginBottom: 6,
      }}>
        Compute Mesh
      </h1>
      <p style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        fontSize: 14,
        color: '#A8B4C0',
        margin: 0,
        marginBottom: 32,
        lineHeight: 1.5,
      }}>
        Pair devices to share inference power over encrypted tunnels.
      </p>

      {/* Error banner */}
      {error && (
        <div style={{
          background: 'rgba(176, 122, 138, 0.12)',
          border: '1px solid rgba(176, 122, 138, 0.3)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}>
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 13,
            color: '#B07A8A',
            margin: 0,
          }}>
            {error}
          </p>
        </div>
      )}

      {/* Status Card */}
      <div style={{
        background: '#111518',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 15,
            fontWeight: 500,
            color: '#CDD4DB',
            margin: 0,
          }}>
            Mesh Status
          </h2>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 12,
            color: meshStatus.running ? '#6ECFA3' : '#5E6B7C',
            padding: '2px 10px',
            borderRadius: 6,
            background: meshStatus.running ? 'rgba(110, 207, 163, 0.1)' : 'rgba(94, 107, 124, 0.1)',
          }}>
            {meshStatus.running ? 'Running' : 'Stopped'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: '#5E6B7C' }}>
              Mesh IP
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#A8B4C0' }}>
              {meshStatus.meshIp ?? 'Not assigned'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: '#5E6B7C' }}>
              Process
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: meshStatus.processAlive ? '#6ECFA3' : '#5E6B7C' }}>
              {meshStatus.processAlive ? 'Alive' : 'Inactive'}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          {!meshStatus.running ? (
            <button
              onClick={handleStartMesh}
              disabled={starting}
              style={{
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: '#0B0E11',
                background: '#6ECFA3',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                cursor: starting ? 'not-allowed' : 'pointer',
                opacity: starting ? 0.6 : 1,
              }}
            >
              {starting ? 'Starting...' : 'Start Mesh'}
            </button>
          ) : (
            <button
              onClick={handleStopMesh}
              style={{
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: '#EEF1F4',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 8,
                padding: '8px 20px',
                cursor: 'pointer',
              }}
            >
              Stop Mesh
            </button>
          )}
        </div>
      </div>

      {/* Paired Devices */}
      <div style={{
        background: '#111518',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
      }}>
        <h2 style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 15,
          fontWeight: 500,
          color: '#CDD4DB',
          margin: 0,
          marginBottom: 16,
        }}>
          Paired Devices
        </h2>

        {peers.length === 0 ? (
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 13,
            color: '#5E6B7C',
            margin: 0,
            lineHeight: 1.5,
          }}>
            No devices found on your local network. Ensure both devices are on the same Wi-Fi.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {peers.map((peer) => (
              <div key={peer.deviceId} style={{
                background: '#171B1F',
                borderRadius: 8,
                padding: 14,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, color: '#CDD4DB' }}>
                    {peer.displayName}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#525A64', marginTop: 2 }}>
                    {peer.platform} &middot; {peer.meshIp}
                  </div>
                </div>
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  color: '#525A64',
                }}>
                  {peer.lastSeen}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pairing Section */}
      <div style={{
        background: '#111518',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        padding: 24,
      }}>
        <h2 style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 15,
          fontWeight: 500,
          color: '#CDD4DB',
          margin: 0,
          marginBottom: 8,
        }}>
          Pair a New Device
        </h2>
        <p style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 13,
          color: '#5E6B7C',
          margin: 0,
          lineHeight: 1.5,
        }}>
          Open Semblance on your other device and navigate to Compute Mesh. Both devices must be on the same local network. Pairing uses mutual TLS authentication over encrypted WireGuard tunnels.
        </p>
      </div>
    </div>
  );
}
