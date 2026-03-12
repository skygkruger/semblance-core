/**
 * InheritanceScreen — Inheritance protocol configuration.
 * DR-gated: requires Digital Representative license.
 * Shows trusted parties, enable/disable protocol, and drill test capability.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import './InheritanceScreen.css';

interface TrustedParty {
  id: string;
  name: string;
  role: 'primary' | 'secondary' | 'backup';
  status: 'active' | 'pending';
}

const STORAGE_KEY_ENABLED = 'semblance.inheritance.protocol_enabled';
const STORAGE_KEY_PARTIES = 'semblance.inheritance.trusted_parties';

export function InheritanceScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [protocolEnabled, setProtocolEnabled] = useState(false);
  const [trustedParties, setTrustedParties] = useState<TrustedParty[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load persisted inheritance settings from localStorage
  useEffect(() => {
    try {
      const savedEnabled = localStorage.getItem(STORAGE_KEY_ENABLED);
      if (savedEnabled !== null) {
        setProtocolEnabled(JSON.parse(savedEnabled) as boolean);
      }

      const savedParties = localStorage.getItem(STORAGE_KEY_PARTIES);
      if (savedParties) {
        setTrustedParties(JSON.parse(savedParties) as TrustedParty[]);
      }
    } catch (err) {
      console.error('[InheritanceScreen] Failed to load persisted data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle protocol enabled and persist
  const handleToggleProtocol = useCallback(() => {
    setProtocolEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(next));
      return next;
    });
  }, []);

  // Add a trusted party (placeholder prompt for now)
  const handleAddTrustedParty = useCallback(() => {
    const name = window.prompt(t('screen.inheritance.enter_name', 'Enter the name of the trusted party:'));
    if (!name || !name.trim()) return;

    const roleStr = window.prompt(
      t('screen.inheritance.enter_role', 'Enter role (primary, secondary, or backup):'),
      'primary',
    );
    const role = (['primary', 'secondary', 'backup'].includes(roleStr ?? '')
      ? roleStr
      : 'primary') as TrustedParty['role'];

    const newParty: TrustedParty = {
      id: `party_${Date.now()}`,
      name: name.trim(),
      role,
      status: 'pending',
    };

    setTrustedParties((prev) => {
      const updated = [...prev, newParty];
      localStorage.setItem(STORAGE_KEY_PARTIES, JSON.stringify(updated));
      return updated;
    });

    setStatusMessage(t('screen.inheritance.party_added', 'Trusted party added.'));
    setTimeout(() => setStatusMessage(null), 3000);
  }, [t]);

  // Remove a trusted party
  const handleRemoveParty = useCallback((id: string) => {
    setTrustedParties((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      localStorage.setItem(STORAGE_KEY_PARTIES, JSON.stringify(updated));
      return updated;
    });
  }, []);

  if (!license.isPremium) {
    return (
      <div className="inheritance h-full overflow-y-auto">
        <div className="inheritance__container">
          <h1 className="inheritance__title">{t('screen.inheritance.title')}</h1>
          <div className="inheritance__card surface-void opal-wireframe">
            <p className="inheritance__gate-message">
              {t('screen.inheritance.requires_dr')}
            </p>
            <button
              type="button"
              className="inheritance__gate-btn"
              onClick={() => navigate('/upgrade')}
            >
              {t('screen.inheritance.activate_dr')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inheritance h-full overflow-y-auto">
      <div className="inheritance__container">
        <h1 className="inheritance__title">{t('screen.inheritance.title')}</h1>
        <p className="inheritance__subtitle">
          {t('screen.inheritance.subtitle')}
        </p>

        {loading && (
          <p className="inheritance__empty">{t('common.loading', 'Loading...')}</p>
        )}

        {/* Protocol toggle */}
        <div className="inheritance__card surface-void opal-wireframe">
          <h2 className="inheritance__section-title">{t('screen.inheritance.protocol_status')}</h2>
          <div className="inheritance__toggle-row">
            <span className="inheritance__toggle-label">
              {t('screen.inheritance.enable_protocol')}
            </span>
            <button
              type="button"
              className={`inheritance__toggle ${protocolEnabled ? 'inheritance__toggle--active' : ''}`}
              onClick={handleToggleProtocol}
              aria-pressed={protocolEnabled}
              aria-label="Toggle inheritance protocol"
            >
              <span className="inheritance__toggle-knob" />
            </button>
          </div>
        </div>

        {/* Trusted parties */}
        <div className="inheritance__card surface-void opal-wireframe">
          <h2 className="inheritance__section-title">{t('screen.inheritance.trusted_parties')}</h2>
          {trustedParties.length === 0 ? (
            <p className="inheritance__empty">
              {t('screen.inheritance.empty')}
            </p>
          ) : (
            <div className="inheritance__party-list">
              {trustedParties.map((party) => (
                <div key={party.id} className="inheritance__party-item">
                  <div className="inheritance__party-info">
                    <span className="inheritance__party-name">{party.name}</span>
                    <span className="inheritance__party-role">{party.role}</span>
                  </div>
                  <div className="inheritance__party-actions">
                    <span
                      className={`inheritance__party-status inheritance__party-status--${party.status}`}
                    >
                      {party.status}
                    </span>
                    <button
                      type="button"
                      className="inheritance__btn inheritance__btn--secondary"
                      onClick={() => handleRemoveParty(party.id)}
                    >
                      {t('common.remove', 'Remove')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="inheritance__actions">
            <button
              type="button"
              className="inheritance__btn inheritance__btn--primary"
              onClick={handleAddTrustedParty}
            >
              {t('screen.inheritance.add_trusted_party')}
            </button>
            <button
              type="button"
              className="inheritance__btn inheritance__btn--secondary"
              disabled={trustedParties.length === 0}
              onClick={() => setStatusMessage(t('screen.inheritance.drill_coming_soon'))}
            >
              {t('screen.inheritance.run_drill_test')}
            </button>
          </div>
          {statusMessage && (
            <p className="inheritance__status-message">{statusMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
