/**
 * InheritanceScreen — Inheritance protocol configuration.
 * DR-gated: requires Digital Representative license.
 * Shows trusted parties, enable/disable protocol, and drill test capability.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import { Card, Button, Input, SkeletonCard, FeatureGate } from '@semblance/ui';
import {
  inheritanceGetConfig,
  inheritanceUpdateConfig,
  inheritanceGetTrustedParties,
  inheritanceAddTrustedParty,
  inheritanceRemoveTrustedParty,
  inheritanceRunTest,
} from '../ipc/commands';
import type { InheritanceTrustedParty } from '../ipc/commands';
import './InheritanceScreen.css';

export function InheritanceScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [protocolEnabled, setProtocolEnabled] = useState(false);
  const [trustedParties, setTrustedParties] = useState<InheritanceTrustedParty[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [runningDrill, setRunningDrill] = useState(false);

  // Add-party form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRelationship, setNewRelationship] = useState('');
  const [newPartyPassphrase, setNewPartyPassphrase] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const [config, parties] = await Promise.all([
          inheritanceGetConfig(),
          inheritanceGetTrustedParties(),
        ]);
        setProtocolEnabled(config.enabled);
        setTrustedParties(parties);
      } catch (err) {
        console.error('[InheritanceScreen] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleToggleProtocol = useCallback(async () => {
    const next = !protocolEnabled;
    setProtocolEnabled(next);
    try {
      await inheritanceUpdateConfig({ enabled: next });
    } catch (err) {
      console.error('[InheritanceScreen] Failed to update config:', err);
      setProtocolEnabled(!next);
    }
  }, [protocolEnabled]);

  const handleAddTrustedParty = useCallback(async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    try {
      // Hash the passphrase if provided
      let passphraseHash = '';
      if (newPartyPassphrase.trim()) {
        const buf = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(newPartyPassphrase.trim()),
        );
        passphraseHash = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
      const party = await inheritanceAddTrustedParty({
        name: newName.trim(),
        email: newEmail.trim(),
        relationship: newRelationship.trim() || 'primary',
        passphraseHash,
      });
      setTrustedParties((prev) => [...prev, party]);
      setNewName('');
      setNewEmail('');
      setNewRelationship('');
      setNewPartyPassphrase('');
      setShowAddForm(false);
      setStatusMessage(t('screen.inheritance.party_added', 'Trusted party added.'));
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('[InheritanceScreen] Failed to add party:', err);
      setStatusMessage(t('screen.inheritance.add_failed', 'Failed to add trusted party.'));
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }, [newName, newEmail, newRelationship, newPartyPassphrase, t]);

  const handleRemoveParty = useCallback(async (id: string) => {
    try {
      await inheritanceRemoveTrustedParty(id);
      setTrustedParties((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('[InheritanceScreen] Failed to remove party:', err);
    }
  }, []);

  const handleRunDrill = useCallback(async () => {
    setRunningDrill(true);
    setStatusMessage(null);
    try {
      const result = await inheritanceRunTest();
      setStatusMessage(
        result.success
          ? t('screen.inheritance.drill_success', 'Drill test passed successfully.')
          : t('screen.inheritance.drill_failed', 'Drill test failed: {{message}}', { message: result.message }),
      );
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err) {
      console.error('[InheritanceScreen] Drill test failed:', err);
      setStatusMessage(t('screen.inheritance.drill_error', 'Drill test encountered an error.'));
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setRunningDrill(false);
    }
  }, [t]);

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
          feature="inheritance-protocol"
          isPremium={false}
          onLearnMore={() => navigate('/upgrade')}
        />
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

          {loading ? (
            <SkeletonCard
              variant="generic"
              message="Loading Inheritance Protocol"
              subMessage="Retrieving trusted parties"
              showSpinner
            />
          ) : (
            <>
              {/* Protocol toggle */}
              <Card className="inheritance__card">
                <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 12 }}>
                  {t('screen.inheritance.protocol_status')}
                </h2>
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
              </Card>

              {/* Trusted parties */}
              <Card className="inheritance__card">
                <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 12 }}>
                  {t('screen.inheritance.trusted_parties')}
                </h2>
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
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRemoveParty(party.id)}
                          >
                            {t('common.remove', 'Remove')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline add-party form */}
                {showAddForm && (
                  <div className="inheritance__add-form">
                    <Input
                      type="text"
                      placeholder={t('screen.inheritance.name_placeholder', 'Name')}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <Input
                      type="email"
                      placeholder={t('screen.inheritance.email_placeholder', 'Email')}
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                    <Input
                      type="text"
                      placeholder={t('screen.inheritance.relationship_placeholder', 'Relationship (e.g. spouse, sibling)')}
                      value={newRelationship}
                      onChange={(e) => setNewRelationship(e.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder={t('screen.inheritance.passphrase_placeholder', 'Activation passphrase (required for recovery)')}
                      value={newPartyPassphrase}
                      onChange={(e) => setNewPartyPassphrase(e.target.value)}
                    />
                    <div className="inheritance__add-form-actions">
                      <Button
                        variant="opal"
                        size="sm"
                        onClick={handleAddTrustedParty}
                        disabled={!newName.trim() || !newEmail.trim()}
                      >
                        {t('screen.inheritance.confirm_add', 'Add')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddForm(false);
                          setNewName('');
                          setNewEmail('');
                          setNewRelationship('');
                          setNewPartyPassphrase('');
                        }}
                      >
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="inheritance__actions">
                  {!showAddForm && (
                    <Button
                      variant="opal"
                      size="sm"
                      onClick={() => setShowAddForm(true)}
                    >
                      {t('screen.inheritance.add_trusted_party')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={trustedParties.length === 0 || runningDrill}
                    onClick={handleRunDrill}
                  >
                    {runningDrill
                      ? t('screen.inheritance.running_drill', 'Running...')
                      : t('screen.inheritance.run_drill_test')}
                  </Button>
                </div>
                {statusMessage && (
                  <p className="inheritance__status-message">{statusMessage}</p>
                )}
              </Card>
            </>
          )}
      </div>
    </div>
  );
}
