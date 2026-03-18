/**
 * SemblanceNetworkScreen — Peer-to-peer context sharing with other Semblance users.
 * DR-gated: requires Digital Representative license.
 * Distinct from TunnelPairing (own devices) — this is sharing with OTHER users.
 *
 * BUILD BIBLE Section 6.6: Consent-first, granular, revocable sharing.
 * Never shareable: financial data, health data, raw documents, credentials.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import {
  networkPeersList,
  networkPeerConnect,
  networkPeerDisconnect,
  networkPeerSharingConfig,
  networkGenerateConnectCode,
} from '../ipc/commands';
import type { NetworkPeer, PeerSharingConfig } from '../ipc/commands';
import './SemblanceNetworkScreen.css';

const DEFAULT_SHARING: PeerSharingConfig = {
  calendarAvailability: false,
  communicationStyle: false,
  projectContext: false,
  topicExpertise: false,
};

const SHARING_LABELS: Record<keyof PeerSharingConfig, { label: string; description: string }> = {
  calendarAvailability: {
    label: 'Calendar Availability',
    description: 'Share free/busy status (not event details)',
  },
  communicationStyle: {
    label: 'Communication Style',
    description: 'Share writing style preferences for collaborative drafting',
  },
  projectContext: {
    label: 'Project Context',
    description: 'Share project-level knowledge graph nodes (not raw documents)',
  },
  topicExpertise: {
    label: 'Topic Expertise',
    description: 'Share expertise areas derived from knowledge graph',
  },
};

export function SemblanceNetworkScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const [loading, setLoading] = useState(true);
  const [peers, setPeers] = useState<NetworkPeer[]>([]);
  const [connectCode, setConnectCode] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [sharingConfig, setSharingConfig] = useState<PeerSharingConfig>(DEFAULT_SHARING);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadPeers = useCallback(async () => {
    try {
      const list = await networkPeersList();
      setPeers(list);
    } catch (err) {
      console.error('[SemblanceNetwork] Failed to load peers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPeers();
  }, [loadPeers]);

  // Load sharing config when a peer is selected
  useEffect(() => {
    if (!selectedPeer) return;
    networkPeerSharingConfig(selectedPeer).then(setSharingConfig).catch(() => setSharingConfig(DEFAULT_SHARING));
  }, [selectedPeer]);

  const handleGenerateCode = useCallback(async () => {
    try {
      const result = await networkGenerateConnectCode();
      setConnectCode(result.code);
      setStatusMessage('Share this code with the other Semblance user.');
    } catch (err) {
      setStatusMessage(`Failed to generate code: ${(err as Error).message}`);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    if (!inputCode.trim()) return;
    setConnecting(true);
    setStatusMessage(null);
    try {
      await networkPeerConnect(inputCode.trim());
      setStatusMessage('Connected successfully.');
      setInputCode('');
      await loadPeers();
    } catch (err) {
      setStatusMessage(`Connection failed: ${(err as Error).message}`);
    } finally {
      setConnecting(false);
    }
  }, [inputCode, loadPeers]);

  const handleDisconnect = useCallback(async (peerId: string) => {
    try {
      await networkPeerDisconnect(peerId);
      setStatusMessage('Peer disconnected. All shared context deleted.');
      setPeers(prev => prev.filter(p => p.id !== peerId));
      if (selectedPeer === peerId) {
        setSelectedPeer(null);
        setSharingConfig(DEFAULT_SHARING);
      }
    } catch (err) {
      setStatusMessage(`Disconnect failed: ${(err as Error).message}`);
    }
  }, [selectedPeer]);

  const handleToggleSharing = useCallback(async (key: keyof PeerSharingConfig) => {
    if (!selectedPeer) return;
    const updated = { ...sharingConfig, [key]: !sharingConfig[key] };
    setSharingConfig(updated);
    try {
      await networkPeerSharingConfig(selectedPeer, updated);
    } catch (err) {
      console.error('[SemblanceNetwork] Failed to save sharing config:', err);
    }
  }, [selectedPeer, sharingConfig]);

  if (!license.isPremium) {
    return (
      <div className="semblance-network-screen">
        <div className="semblance-network-screen__header">
          <h1 className="semblance-network-screen__title">{t('semblanceNetwork.title', 'Semblance Network')}</h1>
        </div>
        <div className="semblance-network-screen__gate">
          <p className="semblance-network-screen__gate-text">
            Semblance Network requires Digital Representative.
          </p>
          <p className="semblance-network-screen__gate-subtext">
            Share context with other Semblance users — calendar availability, communication style,
            project context, and topic expertise. Never financial data, health data, or raw documents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="semblance-network-screen">
      <div className="semblance-network-screen__header">
        <h1 className="semblance-network-screen__title">{t('semblanceNetwork.title', 'Semblance Network')}</h1>
        <p className="semblance-network-screen__subtitle">
          Consent-first peer-to-peer sharing with other Semblance users.
        </p>
      </div>

      {statusMessage && (
        <div className="semblance-network-screen__status">{statusMessage}</div>
      )}

      {/* ── Connect Section ──────────────────────────────────────────── */}
      <section className="semblance-network-screen__section">
        <h2 className="semblance-network-screen__section-title">Connect</h2>
        <div className="semblance-network-screen__connect-row">
          <div className="semblance-network-screen__connect-input-group">
            <input
              className="semblance-network-screen__input"
              type="text"
              placeholder="Enter connection code"
              value={inputCode}
              onChange={e => setInputCode(e.target.value)}
              maxLength={12}
            />
            <button
              className="semblance-network-screen__btn semblance-network-screen__btn--primary"
              onClick={handleConnect}
              disabled={connecting || !inputCode.trim()}
            >
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          </div>
          <span className="semblance-network-screen__or">or</span>
          <button
            className="semblance-network-screen__btn semblance-network-screen__btn--secondary"
            onClick={handleGenerateCode}
          >
            Generate My Code
          </button>
        </div>
        {connectCode && (
          <div className="semblance-network-screen__code-display">
            <span className="semblance-network-screen__code">{connectCode}</span>
            <span className="semblance-network-screen__code-hint">Share this with the other user</span>
          </div>
        )}
      </section>

      {/* ── Peer List ────────────────────────────────────────────────── */}
      <section className="semblance-network-screen__section">
        <h2 className="semblance-network-screen__section-title">
          Connected Peers {peers.length > 0 && <span className="semblance-network-screen__count">{peers.length}</span>}
        </h2>
        {loading ? (
          <p className="semblance-network-screen__muted">Loading...</p>
        ) : peers.length === 0 ? (
          <div className="semblance-network-screen__empty">
            <p>{t('semblanceNetwork.noPeers', 'No peer connections yet.')}</p>
            <p className="semblance-network-screen__muted">
              {t('semblanceNetwork.noPeersHint', 'Connect with other Semblance users on your local network or via connection codes.')}
            </p>
          </div>
        ) : (
          <ul className="semblance-network-screen__peer-list">
            {peers.map(peer => (
              <li
                key={peer.id}
                className={`semblance-network-screen__peer ${selectedPeer === peer.id ? 'semblance-network-screen__peer--selected' : ''}`}
                onClick={() => setSelectedPeer(peer.id === selectedPeer ? null : peer.id)}
              >
                <div className="semblance-network-screen__peer-info">
                  <span className="semblance-network-screen__peer-name">{peer.name}</span>
                  <span className="semblance-network-screen__peer-meta">
                    Paired {new Date(peer.pairedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="semblance-network-screen__btn semblance-network-screen__btn--danger"
                  onClick={e => { e.stopPropagation(); handleDisconnect(peer.id); }}
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Sharing Controls ─────────────────────────────────────────── */}
      {selectedPeer && (
        <section className="semblance-network-screen__section">
          <h2 className="semblance-network-screen__section-title">
            Sharing Controls — {peers.find(p => p.id === selectedPeer)?.name}
          </h2>
          <p className="semblance-network-screen__muted">
            Financial data, health data, raw documents, and credentials are never shareable.
          </p>
          <div className="semblance-network-screen__sharing-list">
            {(Object.keys(SHARING_LABELS) as Array<keyof PeerSharingConfig>).map(key => (
              <label key={key} className="semblance-network-screen__sharing-item">
                <input
                  type="checkbox"
                  checked={sharingConfig[key]}
                  onChange={() => handleToggleSharing(key)}
                />
                <div className="semblance-network-screen__sharing-text">
                  <span className="semblance-network-screen__sharing-label">{SHARING_LABELS[key].label}</span>
                  <span className="semblance-network-screen__sharing-desc">{SHARING_LABELS[key].description}</span>
                </div>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
