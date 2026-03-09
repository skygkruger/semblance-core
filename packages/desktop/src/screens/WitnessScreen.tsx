/**
 * WitnessScreen — Cryptographic attestation list with select/share/verify.
 * DR-gated: requires Digital Representative license.
 * Shows Semblance Witness attestations for actions taken on behalf of the user.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import './WitnessScreen.css';

interface Attestation {
  id: string;
  actionType: string;
  description: string;
  timestamp: string;
  hash: string;
  verified: boolean;
}

export function WitnessScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [attestations] = useState<Attestation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  return (
    <div className="witness h-full overflow-y-auto">
      <div className="witness__container">
        <h1 className="witness__title">{t('screen.witness.title')}</h1>
        <p className="witness__subtitle">
          {t('screen.witness.subtitle')}
        </p>

        <div className="witness__card surface-void opal-wireframe">
          <h2 className="witness__section-title">{t('screen.witness.attestations')}</h2>

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
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#6ECFA3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
              onClick={() => setStatusMessage(t('screen.witness.share_coming_soon'))}
            >
              {t('screen.witness.share_selected')}
            </button>
            <button
              type="button"
              className="witness__btn witness__btn--secondary"
              disabled={!hasSelection}
              onClick={() => setStatusMessage(t('screen.witness.verify_coming_soon'))}
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
