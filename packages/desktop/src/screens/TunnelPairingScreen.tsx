/**
 * TunnelPairingScreen — Compute Mesh device pairing over encrypted WireGuard tunnels.
 * Backend handlers: tunnel_wireguard_status, tunnel_wireguard_start, tunnel_wireguard_stop, tunnel_peer_manifest.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button, SkeletonCard, StatusIndicator } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { PageContainer } from '../components/PageContainer';
import { SectionDivider } from '../components/SectionDivider';
import { FeatureStatusBanner } from '../components/FeatureStatusBanner';
import { EmptyFeatureState } from '../components/EmptyFeatureState';
import { ShimmerDescription } from '../components/ShimmerDescription';
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
        <ContentBracket>
        <h1 className="page-title" style={{ fontSize: 28 }}>
          Compute Mesh
        </h1>
        <ShimmerDescription text="Pair devices to share inference power over encrypted tunnels" />
          <PageContainer>
            {/* Error banner */}
            {error && (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, borderColor: 'rgba(176, 122, 138, 0.3)', background: 'rgba(176, 122, 138, 0.12)' }}>
                <p style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 12,
                  color: '#B07A8A',
                  letterSpacing: '0.04em',
                  margin: 0,
                }}>
                  {error}
                </p>
              </div>
            )}

            {/* Status Section */}
            <FeatureStatusBanner title="MESH STATUS" statusLabel={meshStatus.meshIp ?? 'NOT ASSIGNED'} status={meshStatus.running ? 'active' : 'inactive'} />
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
            <div style={{ marginTop: 16 }}>
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

            <SectionDivider />

            {/* Paired Devices */}
            <FeatureStatusBanner title="PAIRED DEVICES" statusLabel={peers.length > 0 ? `${peers.length} DEVICES` : 'NO DEVICES'} status={peers.length > 0 ? 'active' : 'error'} />
            {peers.length === 0 ? (
              <EmptyFeatureState message="No devices found on your local network. Ensure both devices are on the same Wi&#8209;Fi." />
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

            <SectionDivider />

            {/* Pairing Section */}
            <FeatureStatusBanner title="PAIR A NEW DEVICE" statusLabel="READY" status="active" />
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
          </PageContainer>
        </ContentBracket>
      </div>
    </div>
  );
}
