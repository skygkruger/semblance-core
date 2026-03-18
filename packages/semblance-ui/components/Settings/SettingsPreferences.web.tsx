// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import { useState, useEffect } from 'react';
import './Settings.css';
import { BackArrow } from './SettingsIcons';

interface PreferenceNode {
  id: string;
  domain: string;
  pattern: string;
  confidence: number;
  evidenceCount: number;
  lastObservedAt: string;
  override: boolean;
  overrideValue: boolean | null;
}

export function SettingsPreferences({ onBack }: { onBack: () => void }) {
  const [preferences, setPreferences] = useState<PreferenceNode[]>([]);

  useEffect(() => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      invoke('ipc_send', { method: 'preference_list', params: { min_confidence: 0.3 } })
        .then((result: PreferenceNode[]) => {
          if (Array.isArray(result)) setPreferences(result);
        })
        .catch(() => {});
    } catch { /* IPC unavailable */ }
  }, []);

  const highConfidence = preferences.filter(p => p.confidence >= 0.85 && p.overrideValue !== false);
  const detected = preferences.filter(p => p.confidence < 0.85 && p.overrideValue !== false);
  const denied = preferences.filter(p => p.overrideValue === false);

  const handleConfirm = async (id: string) => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      await invoke('ipc_send', { method: 'preference_confirm', params: { id } });
      setPreferences(prev => prev.map(p => p.id === id ? { ...p, confidence: 1.0, override: true, overrideValue: true } : p));
    } catch { /* ignore */ }
  };

  const handleDeny = async (id: string) => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      await invoke('ipc_send', { method: 'preference_deny', params: { id } });
      setPreferences(prev => prev.map(p => p.id === id ? { ...p, confidence: 0, override: true, overrideValue: false } : p));
    } catch { /* ignore */ }
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Learned Preferences</h1>
      </div>

      <div className="settings-content">
        <div className="settings-section-header">HIGH CONFIDENCE <span className="settings-badge">{highConfidence.length} patterns</span></div>
        <p style={{ fontSize: 12, color: 'var(--sv2)', margin: '0 16px 8px', lineHeight: 1.4 }}>
          These preferences actively influence autonomous decisions.
        </p>

        {highConfidence.map(pref => (
          <div key={pref.id} className="settings-card" style={{ margin: '0 16px 8px' }}>
            <div style={{ fontSize: 13, color: 'var(--white)' }}>
              <span style={{ color: 'var(--sv2)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>{pref.domain}</span>
              <div style={{ marginTop: 4 }}>{pref.pattern}</div>
              <div style={{ fontSize: 11, color: 'var(--sv2)', marginTop: 4 }}>
                Confidence: {Math.round(pref.confidence * 100)}% &middot; {pref.evidenceCount} observations
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {pref.override && pref.overrideValue === true ? (
                <span style={{ color: 'var(--v)', fontSize: 12 }}>Confirmed</span>
              ) : (
                <>
                  <button type="button" onClick={() => handleConfirm(pref.id)} style={{ background: 'none', border: '1px solid var(--v)', color: 'var(--v)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>Confirm</button>
                  <button type="button" onClick={() => handleDeny(pref.id)} style={{ background: 'none', border: '1px solid var(--critical)', color: 'var(--critical)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>Deny</button>
                </>
              )}
            </div>
          </div>
        ))}

        {highConfidence.length === 0 && (
          <div className="settings-card" style={{ margin: '0 16px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--sv2)', margin: 0 }}>No high-confidence patterns detected yet. Semblance learns from your behavior over time.</p>
          </div>
        )}

        <div className="settings-section-header">DETECTED <span className="settings-badge">{detected.length} patterns</span></div>
        {detected.map(pref => (
          <button key={pref.id} type="button" className="settings-row">
            <span className="settings-row__label">{pref.domain} &middot; {pref.pattern}</span>
            <span className="settings-row__value">{Math.round(pref.confidence * 100)}%</span>
          </button>
        ))}

        {denied.length > 0 && (
          <>
            <div className="settings-section-header">DENIED</div>
            {denied.map(pref => (
              <button key={pref.id} type="button" className="settings-row" style={{ opacity: 0.5 }}>
                <span className="settings-row__label">{pref.domain} &middot; {pref.pattern}</span>
                <span className="settings-row__value">Denied</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
