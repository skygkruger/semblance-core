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
import { Card, Button, Input, StatusIndicator, SkeletonCard, FeatureGate } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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
      setStatusMessage(t('semblanceNetwork.shareCode', 'Share this code with the other Semblance user.'));
    } catch (err) {
      setStatusMessage(t('semblanceNetwork.codeGenFailed', 'Failed to generate code: {{message}}', { message: (err as Error).message }));
    }
  }, []);

  const handleConnect = useCallback(async () => {
    if (!inputCode.trim()) return;
    setConnecting(true);
    setStatusMessage(null);
    try {
      await networkPeerConnect(inputCode.trim());
      setStatusMessage(t('semblanceNetwork.connected', 'Connected successfully.'));
      setInputCode('');
      await loadPeers();
    } catch (err) {
      setStatusMessage(t('semblanceNetwork.connectFailed', 'Connection failed: {{message}}', { message: (err as Error).message }));
    } finally {
      setConnecting(false);
    }
  }, [inputCode, loadPeers]);

  const handleDisconnect = useCallback(async (peerId: string) => {
    try {
      await networkPeerDisconnect(peerId);
      setStatusMessage(t('semblanceNetwork.disconnected', 'Peer disconnected. All shared context deleted.'));
      setPeers(prev => prev.filter(p => p.id !== peerId));
      if (selectedPeer === peerId) {
        setSelectedPeer(null);
        setSharingConfig(DEFAULT_SHARING);
      }
    } catch (err) {
      setStatusMessage(t('semblanceNetwork.disconnectFailed', 'Disconnect failed: {{message}}', { message: (err as Error).message }));
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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
      }}>
        <FeatureGate
          feature="semblance-network"
          isPremium={false}
          onLearnMore={() => navigate('/upgrade')}
        />
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <h1 className="page-title" style={{ fontSize: 28 }}>{t('semblanceNetwork.title', 'Semblance Network')}</h1>
        <ContentBracket>
        <p className="semblance-network-screen__subtitle">
          {t('semblanceNetwork.subtitle', 'Consent-first peer-to-peer sharing with other Semblance users.')}
        </p>

        {statusMessage && (
          <div className="semblance-network-screen__status">{statusMessage}</div>
        )}

        {loading ? (
          <SkeletonCard
            variant="generic"
            message="Loading Semblance Network"
            subMessage="Discovering peers on your network"
            showSpinner
          />
        ) : (
          <>
            {/* -- Connect Section -- */}
            <Card className="semblance-network-screen__section-card surface-void opal-wireframe">
              <h2 style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 16 }}>
                {t('semblanceNetwork.connect', 'Connect')}
              </h2>
              <div className="semblance-network-screen__connect-row">
                <div className="semblance-network-screen__connect-input-group">
                  <Input
                    type="text"
                    placeholder={t('semblanceNetwork.enterCode', 'Enter connection code')}
                    value={inputCode}
                    onChange={e => setInputCode(e.target.value)}
                    maxLength={12}
                    className="semblance-network-screen__input-wrapper"
                  />
                  <button
                    type="button"
                    className="btn btn--opal btn--sm"
                    onClick={handleConnect}
                    disabled={connecting || !inputCode.trim()}
                  >
                    <span className="btn__text">{connecting ? t('semblanceNetwork.connecting', 'Connecting...') : t('semblanceNetwork.connect', 'Connect')}</span>
                  </button>
                </div>
                <span className="semblance-network-screen__or">{t('semblanceNetwork.or', 'or')}</span>
                <button
                  type="button"
                  className="btn btn--opal btn--sm"
                  onClick={handleGenerateCode}
                >
                  <span className="btn__text">{t('semblanceNetwork.generateCode', 'Generate My Code')}</span>
                </button>
              </div>
              {connectCode && (
                <div className="semblance-network-screen__code-display">
                  <span className="semblance-network-screen__code">{connectCode}</span>
                  <span className="semblance-network-screen__code-hint">{t('semblanceNetwork.codeHint', 'Share this with the other user')}</span>
                </div>
              )}
            </Card>

            {/* -- Peer List -- */}
            <Card className="semblance-network-screen__section-card surface-void opal-wireframe">
              <h2 style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 16 }}>
                {t('semblanceNetwork.connectedPeers', 'Connected Peers')} {peers.length > 0 && <span className="semblance-network-screen__count">{peers.length}</span>}
              </h2>
              {peers.length === 0 ? (
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
                          <StatusIndicator status="success" />
                          {' '}
                          {t('semblanceNetwork.paired', 'Paired')} {new Date(peer.pairedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={e => { e.stopPropagation(); handleDisconnect(peer.id); }}
                      >
                        {t('button.disconnect', 'Disconnect')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* -- Sharing Controls -- */}
            {selectedPeer && (
              <Card className="semblance-network-screen__section-card surface-void opal-wireframe">
                <h2 style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 16 }}>
                  {t('semblanceNetwork.sharingControls', 'Sharing Controls')} — {peers.find(p => p.id === selectedPeer)?.name}
                </h2>
                <p className="semblance-network-screen__muted">
                  {t('semblanceNetwork.neverShareable', 'Financial data, health data, raw documents, and credentials are never shareable.')}
                </p>
                <div className="semblance-network-screen__sharing-list">
                  {(Object.keys(SHARING_LABELS) as Array<keyof PeerSharingConfig>).map(key => (
                    <label key={key} className="semblance-network-screen__sharing-item">
                      <span
                        className={`semblance-network-screen__checkbox ${sharingConfig[key] ? 'semblance-network-screen__checkbox--checked' : ''}`}
                        role="checkbox"
                        aria-checked={sharingConfig[key]}
                        onClick={(e) => { e.preventDefault(); handleToggleSharing(key); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleSharing(key); } }}
                        tabIndex={0}
                      >
                        {sharingConfig[key] && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <div className="semblance-network-screen__sharing-text">
                        <span className="semblance-network-screen__sharing-label">{t(`semblanceNetwork.sharing.${key}.label`, SHARING_LABELS[key].label)}</span>
                        <span className="semblance-network-screen__sharing-desc">{t(`semblanceNetwork.sharing.${key}.description`, SHARING_LABELS[key].description)}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
        </ContentBracket>
      </div>
    </div>
  );
}
