/**
 * WitnessScreen — Cryptographic attestation list with select/share/verify.
 * DR-gated: requires Digital Representative license.
 * Shows Semblance Witness attestations for actions taken on behalf of the user.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import { getKnowledgeStats } from '../ipc/commands';
import './WitnessScreen.css';

interface Attestation {
  id: string;
  actionType: string;
  description: string;
  timestamp: string;
  hash: string;
  verified: boolean;
}

const STORAGE_KEY = 'semblance.attestations';

function loadAttestations(): Attestation[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveAttestations(records: Attestation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/** Simple hash of a string using Web Crypto API */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function WitnessScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const records = loadAttestations();
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
    try {
      // Get current knowledge graph state for the attestation hash
      const stats = await getKnowledgeStats();

      // Create a hash of the current knowledge state
      const stateString = JSON.stringify({
        documentCount: stats.documentCount,
        chunkCount: stats.chunkCount,
        indexSizeBytes: stats.indexSizeBytes,
        lastIndexedAt: stats.lastIndexedAt,
        attestedAt: new Date().toISOString(),
      });
      const hash = await sha256(stateString);

      const attestation: Attestation = {
        id: crypto.randomUUID(),
        actionType: 'knowledge_state',
        description: `Knowledge graph attestation: ${stats.documentCount} documents, ${stats.chunkCount} chunks`,
        timestamp: new Date().toISOString(),
        hash,
        verified: true,
      };

      const updated = [attestation, ...attestations];
      setAttestations(updated);
      saveAttestations(updated);
    } catch (err) {
      console.error('[WitnessScreen] create attestation failed:', err);
    } finally {
      setCreating(false);
    }
  }, [attestations]);

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
