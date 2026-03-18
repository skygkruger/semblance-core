// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import { useState, useEffect } from 'react';
import './Settings.css';
import { BackArrow } from './SettingsIcons';

interface NamedSessionInfo {
  key: string;
  label: string;
  channelBinding: string | null;
  messageCount: number;
  lastActiveAt: string;
}

export function SettingsSessions({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<NamedSessionInfo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      invoke('ipc_send', { method: 'session_list', params: {} })
        .then((result: NamedSessionInfo[]) => {
          if (Array.isArray(result)) setSessions(result);
        })
        .catch(() => {});
    } catch { /* IPC unavailable */ }
  }, []);

  const handleDelete = async (key: string) => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      await invoke('ipc_send', { method: 'session_delete', params: { key } });
      setSessions(prev => prev.filter(s => s.key !== key));
    } catch { /* ignore */ }
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Named Sessions</h1>
      </div>

      <div className="settings-content">
        <div className="settings-section-header">ACTIVE SESSIONS</div>

        {sessions.length === 0 && (
          <div className="settings-card" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--sv2)', margin: 0 }}>No named sessions yet. Sessions are created automatically when channels connect.</p>
          </div>
        )}

        {sessions.map(session => (
          <div key={session.key}>
            <button type="button" className="settings-row" onClick={() => setExpanded(expanded === session.key ? null : session.key)}>
              <span className="settings-row__label">{session.key}</span>
              <span className="settings-row__value">{session.messageCount} messages</span>
            </button>
            {expanded === session.key && (
              <div className="settings-card" style={{ margin: '0 16px 8px' }}>
                <div style={{ fontSize: 13, color: 'var(--sv3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Label: {session.label}</span>
                  <span>Channel: {session.channelBinding ?? 'Unbound'}</span>
                  <span>Last active: {new Date(session.lastActiveAt).toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(session.key)}
                  style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--critical)', cursor: 'pointer', fontSize: 13 }}
                >
                  Delete session
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
