/**
 * WitnessScreen — Cryptographic attestation list with select/share/verify.
 * DR-gated: requires Digital Representative license.
 * Shows Semblance Witness attestations for actions taken on behalf of the user.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import { SkeletonCard, FeatureGate } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { PageContainer } from '../components/PageContainer';
import { FeatureStatusBanner } from '../components/FeatureStatusBanner';
import { EmptyFeatureState } from '../components/EmptyFeatureState';
import { ShimmerDescription } from '../components/ShimmerDescription';
import {
  witnessGetAttestations,
  witnessGenerateAttestation,
  witnessExportAttestation,
  witnessVerifyAttestation,
  getActionLog,
} from '../ipc/commands';
import type { WitnessAttestation } from '../ipc/commands';
import './WitnessScreen.css';

export function WitnessScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [attestations, setAttestations] = useState<WitnessAttestation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const records = await witnessGetAttestations();
        setAttestations(records);
      } catch (err) {
        console.error('[WitnessScreen] load failed:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleCreateAttestation = useCallback(async () => {
    setCreating(true);
    setStatusMessage(null);
    try {
      // Get the actual latest audit entry ID
      const log = await getActionLog(1, 0).catch(() => []);
      const latestId = log?.[0]?.id ?? `manual_${Date.now()}`;
      const attestation = await witnessGenerateAttestation({
        auditEntryId: latestId,
        actionSummary: 'Knowledge graph state attestation',
      });
      setAttestations((prev) => [attestation, ...prev]);
      setStatusMessage(t('screen.witness.attestation_created', 'Attestation created successfully'));
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('[WitnessScreen] create attestation failed:', err);
      setStatusMessage(t('screen.witness.create_failed', 'Failed to create attestation'));
    } finally {
      setCreating(false);
    }
  }, [t]);

  const handleShareSelected = useCallback(async () => {
    setStatusMessage(null);
    try {
      const ids = Array.from(selectedIds);
      for (const attId of ids) {
        const result = await witnessExportAttestation(attId);
        if (result.json) {
          // Download via blob — writes attestation JSON to user's disk
          const blob = new Blob([result.json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `attestation-${attId}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
      setStatusMessage(
        t('screen.witness.share_success', 'Exported {{count}} attestation(s)', { count: ids.length }),
      );
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('[WitnessScreen] share failed:', err);
      setStatusMessage(t('screen.witness.share_failed', 'Failed to export attestations'));
    }
  }, [selectedIds, t]);

  const handleVerifySelected = useCallback(async () => {
    setStatusMessage(null);
    try {
      const ids = Array.from(selectedIds);
      let allValid = true;
      for (const id of ids) {
        const result = await witnessVerifyAttestation(id);
        if (!result.valid) {
          allValid = false;
        }
      }
      if (allValid) {
        setStatusMessage(
          t('screen.witness.verify_success', 'All {{count}} attestation(s) verified', { count: ids.length }),
        );
      } else {
        setStatusMessage(t('screen.witness.verify_partial', 'Some attestations failed verification'));
      }
      // Refresh attestation list to update verified status
      const refreshed = await witnessGetAttestations();
      setAttestations(refreshed);
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err) {
      console.error('[WitnessScreen] verify failed:', err);
      setStatusMessage(t('screen.witness.verify_failed', 'Verification failed'));
    }
  }, [selectedIds, t]);

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const hasSelection = selectedIds.size > 0;

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
          feature="witness-attestation"
          isPremium={false}
          onLearnMore={() => navigate('/upgrade')}
        />
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <GhostSprite insight="Cryptographic attestations of every autonomous action.">
        <h1 className="page-title" style={{ fontSize: 28 }}>{t('screen.witness.title')}</h1>
        <ShimmerDescription text="Cryptographic attestations of autonomous actions" />
          {loading ? (
            <SkeletonCard
              variant="generic"
              message="Loading Witness"
              subMessage="Retrieving attestation records"
              showSpinner
            />
          ) : (
            <PageContainer>
              <FeatureStatusBanner title="ATTESTATIONS" statusLabel={attestations.length > 0 ? `${attestations.length} ATTESTATIONS` : 'NO ATTESTATIONS'} status={attestations.length > 0 ? 'active' : 'error'} />

              {attestations.length === 0 ? (
                <EmptyFeatureState
                  message="Attestations will appear here as Semblance takes actions on your behalf"
                  actionLabel="Create Attestation"
                  onAction={handleCreateAttestation}
                />
              ) : (
                <>
                  <div className="witness__section-header" style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      className="btn btn--opal btn--sm"
                      onClick={handleCreateAttestation}
                      disabled={creating}
                    >
                      <span className="btn__text">{creating ? t('screen.witness.creating', 'Creating...') : t('screen.witness.create_attestation', 'Create Attestation')}</span>
                    </button>
                  </div>

                  <div className="witness__attestation-list">
                    {attestations.map((att) => (
                      <div
                        key={att.id}
                        className={`witness__attestation-item ${selectedIds.has(att.id) ? 'witness__attestation-item--selected' : ''}`}
                        onClick={() => toggleSelection(att.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleSelection(att.id);
                          }
                        }}
                      >
                        <span
                          className={`witness__attestation-check ${selectedIds.has(att.id) ? 'witness__attestation-check--active' : ''}`}
                        >
                          {selectedIds.has(att.id) && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <div className="witness__attestation-info">
                          <div className="witness__attestation-action">{att.description}</div>
                          <div className="witness__attestation-time">{att.timestamp}</div>
                        </div>
                        <span className="witness__attestation-hash">
                          {(att.hash ?? '').slice(0, 8)}...
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="witness__actions">
                    <button
                      type="button"
                      className="btn btn--opal btn--sm"
                      disabled={!hasSelection}
                      onClick={handleShareSelected}
                    >
                      <span className="btn__text">{t('screen.witness.share_selected')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={!hasSelection}
                      onClick={handleVerifySelected}
                    >
                      <span className="btn__text">{t('screen.witness.verify_selected')}</span>
                    </button>
                  </div>
                </>
              )}
              {statusMessage && (
                <p className="witness__status-message">{statusMessage}</p>
              )}
            </PageContainer>
          )}
        </GhostSprite>
        </ContentBracket>
      </div>
    </div>
  );
}
