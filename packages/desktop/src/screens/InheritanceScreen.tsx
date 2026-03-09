/**
 * InheritanceScreen — Inheritance protocol configuration.
 * DR-gated: requires Digital Representative license.
 * Shows trusted parties, enable/disable protocol, and drill test capability.
 */

import { useState } from 'react';
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

export function InheritanceScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [protocolEnabled, setProtocolEnabled] = useState(false);
  const [trustedParties] = useState<TrustedParty[]>([]);

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
              onClick={() => setProtocolEnabled(!protocolEnabled)}
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
                  <span
                    className={`inheritance__party-status inheritance__party-status--${party.status}`}
                  >
                    {party.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="inheritance__actions">
            <button type="button" className="inheritance__btn inheritance__btn--primary">
              {t('screen.inheritance.add_trusted_party')}
            </button>
            <button
              type="button"
              className="inheritance__btn inheritance__btn--secondary"
              disabled={trustedParties.length === 0}
            >
              {t('screen.inheritance.run_drill_test')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
