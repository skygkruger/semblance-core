/**
 * WitnessScreen — Cryptographic attestation list with select/share/verify.
 * DR-gated: requires Digital Representative license.
 * Shows Semblance Witness attestations for actions taken on behalf of the user.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import {
  witnessGetAttestations,
  witnessGenerateAttestation,
  witnessExportAttestation,
  witnessVerifyAttestation,
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
      const attestation = await witnessGenerateAttestation({
        auditEntryId: 'latest',
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
      for (const id of ids) {
        await witnessExportAttestation(id);
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

  if (!license.isPremium) {
    return (
      <div className="witness h-full overflow-y-auto">
        <div className="witness__container">
          <h1 className="witness__title">{t('screen.witness.title')}</h1>
          <div className="witness__card surface-void opal-wireframe">
            <p className="witness__gate-message">
              {t('screen.witness.requires_dr')}
            </p>
            <button
              type="button"
              className="witness__gate-btn"
              onClick={() => navigate('/upgrade')}
            >
              {t('screen.witness.activate_dr')}
            </button>
          </div>
        </div>
      </div>
    );
  }

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

  if (loading) {
    return (
      <div className="witness h-full overflow-y-auto">
        <div className="witness__container">
          <h1 className="witness__title">{t('screen.witness.title')}</h1>
          <div className="witness__card surface-void opal-wireframe">
            <p>{t('common.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="witness h-full overflow-y-auto">
      <div className="witness__container">
        <h1 className="witness__title">{t('screen.witness.title')}</h1>
        <p className="witness__subtitle">
          {t('screen.witness.subtitle')}
        </p>

        <div className="witness__card surface-void opal-wireframe">
          <div className="witness__section-header">
            <h2 className="witness__section-title">{t('screen.witness.attestations')}</h2>
            <button
              type="button"
              className="witness__btn witness__btn--primary"
              onClick={handleCreateAttestation}
              disabled={creating}
            >
              {creating ? t('screen.witness.creating', 'Creating...') : t('screen.witness.create_attestation', 'Create Attestation')}
            </button>
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
                    {att.hash.slice(0, 8)}...
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="witness__actions">
            <button
              type="button"
              className="witness__btn witness__btn--primary"
              disabled={!hasSelection}
              onClick={handleShareSelected}
            >
              {t('screen.witness.share_selected')}
            </button>
            <button
              type="button"
              className="witness__btn witness__btn--secondary"
              disabled={!hasSelection}
              onClick={handleVerifySelected}
            >
              {t('screen.witness.verify_selected')}
            </button>
          </div>
          {statusMessage && (
            <p className="witness__status-message">{statusMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
