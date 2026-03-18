// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import { useState, useEffect } from 'react';
import './Settings.css';
import { BackArrow } from './SettingsIcons';

interface AllowedBinary {
  id: string;
  binaryName: string;
  binaryPath: string;
  description: string | null;
  maxExecutionSeconds: number;
  isActive: boolean;
}

export function SettingsBinaryAllowlist({ onBack }: { onBack: () => void }) {
  const [binaries, setBinaries] = useState<AllowedBinary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      invoke('ipc_send', { method: 'binary_allowlist_list', params: {} })
        .then((result: AllowedBinary[]) => {
          if (Array.isArray(result)) setBinaries(result);
        })
        .catch(() => {});
    } catch { /* IPC unavailable */ }
  }, []);

  const handleRemove = async (name: string) => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      await invoke('ipc_send', { method: 'binary_allowlist_remove', params: { binary_name: name } });
      setBinaries(prev => prev.filter(b => b.binaryName !== name));
    } catch { /* ignore */ }
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Binary Allowlist</h1>
      </div>

      <div className="settings-content">
        <p style={{ fontSize: 12, color: 'var(--sv2)', margin: '0 16px 12px', lineHeight: 1.4 }}>
          Semblance can execute these approved programs on your behalf.
          Shells, interpreters, and network tools are permanently blocked.
        </p>

        <div className="settings-section-header">ALLOWED BINARIES <span className="settings-badge">{binaries.length} binaries</span></div>

        {binaries.map(bin => (
          <div key={bin.id}>
            <button type="button" className="settings-row" onClick={() => setExpanded(expanded === bin.binaryName ? null : bin.binaryName)}>
              <span className="settings-row__label">{bin.binaryName}</span>
              <span className="settings-row__value">{bin.maxExecutionSeconds}s limit</span>
            </button>
            {expanded === bin.binaryName && (
              <div className="settings-card" style={{ margin: '0 16px 8px' }}>
                <div style={{ fontSize: 12, color: 'var(--sv3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Path: {bin.binaryPath}</span>
                  {bin.description && <span>Description: {bin.description}</span>}
                  <span>Max execution: {bin.maxExecutionSeconds} seconds</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(bin.binaryName)}
                  style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--critical)', cursor: 'pointer', fontSize: 13 }}
                >
                  Remove from allowlist
                </button>
              </div>
            )}
          </div>
        ))}

        {binaries.length === 0 && (
          <div className="settings-card" style={{ margin: '0 16px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--sv2)', margin: 0 }}>No binaries allowlisted.</p>
          </div>
        )}

        <div className="settings-section-header">ADD BINARY</div>
        <div className="settings-card" style={{ margin: '0 16px 8px' }}>
          <button type="button" className="settings-row" style={{ border: '1px solid var(--b2)', borderRadius: 8 }}>
            <span className="settings-row__label">Add binary...</span>
          </button>
        </div>
      </div>
    </div>
  );
}
