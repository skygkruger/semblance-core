/**
 * TunnelPairingScreen — Compute Mesh device pairing over encrypted WireGuard tunnels.
 * Backend handlers: tunnel_wireguard_status, tunnel_wireguard_start, tunnel_wireguard_stop, tunnel_peer_manifest.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, Button, SkeletonCard, StatusIndicator } from '@semblance/ui';
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
      <div className="page-scroll">
        <div className="page-layout">
          <SkeletonCard
            variant="generic"
            message="Connecting to mesh"
            subMessage="Initializing tunnel service"
            showSpinner
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        {/* Header */}
        <h1 className="page-title" style={{ fontSize: 28, marginBottom: 6 }}>
          Compute Mesh
        </h1>
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 12,
          color: '#A8B4C0',
          letterSpacing: '0.04em',
          margin: 0,
          marginBottom: 32,
          lineHeight: 1.5,
        }}>
          Pair devices to share inference power over encrypted tunnels.
        </p>

        {/* Error banner */}
        {error && (
          <Card style={{ marginBottom: 20, borderColor: 'rgba(176, 122, 138, 0.3)', background: 'rgba(176, 122, 138, 0.12)' }}>
            <p style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: '#B07A8A',
              letterSpacing: '0.04em',
              margin: 0,
            }}>
              {error}
            </p>
          </Card>
        )}

        {/* Status Card */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontWeight: 300,
              fontSize: 18,
              color: '#EEF1F4',
              margin: 0,
            }}>
              Mesh Status
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusIndicator status={meshStatus.running ? 'success' : 'muted'} pulse={meshStatus.running} />
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 12,
                color: meshStatus.running ? '#6ECFA3' : '#5E6B7C',
              }}>
                {meshStatus.running ? 'Running' : 'Stopped'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
                Mesh IP
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em' }}>
                {meshStatus.meshIp ?? 'Not assigned'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
                Process
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: meshStatus.processAlive ? '#6ECFA3' : '#5E6B7C', letterSpacing: '0.04em' }}>
                {meshStatus.processAlive ? 'Alive' : 'Inactive'}
              </span>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            {!meshStatus.running ? (
              <Button variant="opal" disabled={starting} onClick={handleStartMesh}>
                {starting ? 'Starting...' : 'Start Mesh'}
              </Button>
            ) : (
              <Button variant="ghost" onClick={handleStopMesh}>
                Stop Mesh
              </Button>
            )}
          </div>
        </Card>

        {/* Paired Devices */}
        <Card style={{ marginBottom: 20 }}>
          <h2 style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 300,
            fontSize: 18,
            color: '#EEF1F4',
            margin: 0,
            marginBottom: 16,
          }}>
            Paired Devices
          </h2>

          {peers.length === 0 ? (
            <p style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: '#A8B4C0',
              letterSpacing: '0.04em',
              margin: 0,
              lineHeight: 1.5,
            }}>
              No devices found on your local network. Ensure both devices are on the same Wi-Fi.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {peers.map((peer) => (
                <div key={peer.deviceId} className="surface-slate" style={{
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>
                      {peer.displayName}
                    </div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#5E6B7C', marginTop: 2 }}>
                      {peer.platform} &middot; {peer.meshIp}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    color: '#5E6B7C',
                  }}>
                    {peer.lastSeen}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Pairing Section */}
        <Card>
          <h2 style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 300,
            fontSize: 18,
            color: '#EEF1F4',
            margin: 0,
            marginBottom: 8,
          }}>
            Pair a New Device
          </h2>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 12,
            color: '#A8B4C0',
            letterSpacing: '0.04em',
            margin: 0,
            lineHeight: 1.5,
          }}>
            Open Semblance on your other device and navigate to Compute Mesh. Both devices must be on the same local network. Pairing uses mutual TLS authentication over encrypted WireGuard tunnels.
          </p>
        </Card>
      </div>
    </div>
  );
}
