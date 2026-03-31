/**
 * WitnessScreen — Cryptographic attestation list with select/share/verify.
 * DR-gated: requires Digital Representative license.
 * Shows Semblance Witness attestations for actions taken on behalf of the user.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import { Card, Button, SkeletonCard, FeatureGate } from '@semblance/ui';
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
    <div className="witness page-scroll">
      <div className="witness__container page-layout">
        <h1 className="witness__title">{t('screen.witness.title')}</h1>

          <p className="witness__subtitle">
            {t('screen.witness.subtitle')}
          </p>

          {loading ? (
            <SkeletonCard
              variant="generic"
              message="Loading Witness"
              subMessage="Retrieving attestation records"
              showSpinner
            />
          ) : (
            <Card className="witness__card">
              <div className="witness__section-header">
                <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 0 }}>
                  {t('screen.witness.attestations')}
                </h2>
                <Button
                  variant="opal"
                  size="sm"
                  onClick={handleCreateAttestation}
                  disabled={creating}
                >
                  {creating ? t('screen.witness.creating', 'Creating...') : t('screen.witness.create_attestation', 'Create Attestation')}
                </Button>
              </div>

              {attestations.length === 0 ? (
                <p className="witness__empty">
                  {t('screen.witness.empty')}
                </p>
              ) : (
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
              )}

              <div className="witness__actions">
                <Button
                  variant="opal"
                  size="sm"
                  disabled={!hasSelection}
                  onClick={handleShareSelected}
                >
                  {t('screen.witness.share_selected')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!hasSelection}
                  onClick={handleVerifySelected}
                >
                  {t('screen.witness.verify_selected')}
                </Button>
              </div>
              {statusMessage && (
                <p className="witness__status-message">{statusMessage}</p>
              )}
            </Card>
          )}
      </div>
    </div>
  );
}
