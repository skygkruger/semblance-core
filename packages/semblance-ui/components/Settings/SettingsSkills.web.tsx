// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import { useState, useEffect } from 'react';
import './Settings.css';
import { BackArrow } from './SettingsIcons';

interface InstalledSkill {
  declaration: {
    id: string;
    name: string;
    version: string;
    author: string;
    description: string;
    capabilities: string[];
  };
  installedAt: string;
  consentedCapabilities: string[];
  enabled: boolean;
}

export function SettingsSkills({ onBack }: { onBack: () => void }) {
  const [skills, setSkills] = useState<InstalledSkill[]>([]);

  useEffect(() => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      invoke('ipc_send', { method: 'skill_list', params: {} })
        .then((result: InstalledSkill[]) => {
          if (Array.isArray(result)) setSkills(result);
        })
        .catch(() => {});
    } catch { /* IPC unavailable */ }
  }, []);

  const handleDisable = async (skillId: string) => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      await invoke('ipc_send', { method: 'skill_disable', params: { skill_id: skillId } });
      setSkills(prev => prev.map(s => s.declaration.id === skillId ? { ...s, enabled: false } : s));
    } catch { /* ignore */ }
  };

  const handleEnable = async (skillId: string) => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      await invoke('ipc_send', { method: 'skill_enable', params: { skill_id: skillId } });
      setSkills(prev => prev.map(s => s.declaration.id === skillId ? { ...s, enabled: true } : s));
    } catch { /* ignore */ }
  };

  const handleUninstall = async (skillId: string) => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      await invoke('ipc_send', { method: 'skill_uninstall', params: { skill_id: skillId } });
      setSkills(prev => prev.filter(s => s.declaration.id !== skillId));
    } catch { /* ignore */ }
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Skills</h1>
      </div>

      <div className="settings-content">
        <div className="settings-section-header">INSTALLED <span className="settings-badge">{skills.length} installed</span></div>

        {skills.map(skill => (
          <div key={skill.declaration.id} className="settings-card" style={{ margin: '0 16px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, color: 'var(--white)' }}>{skill.declaration.name}</span>
              <span style={{ fontSize: 11, color: 'var(--sv2)', fontFamily: 'var(--fm)' }}>v{skill.declaration.version}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--sv3)', marginTop: 4 }}>{skill.declaration.description}</div>
            <div style={{ fontSize: 11, color: 'var(--sv2)', marginTop: 6 }}>
              {skill.consentedCapabilities.map(cap => (
                <span key={cap} className="settings-badge" style={{ marginRight: 4, fontSize: 10 }}>{cap.replace(/_/g, ' ')}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {skill.enabled ? (
                <button type="button" onClick={() => handleDisable(skill.declaration.id)} style={{ background: 'none', border: '1px solid var(--caution)', color: 'var(--caution)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>Disable</button>
              ) : (
                <button type="button" onClick={() => handleEnable(skill.declaration.id)} style={{ background: 'none', border: '1px solid var(--v)', color: 'var(--v)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>Enable</button>
              )}
              <button type="button" onClick={() => handleUninstall(skill.declaration.id)} style={{ background: 'none', border: '1px solid var(--critical)', color: 'var(--critical)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>Uninstall</button>
            </div>
          </div>
        ))}

        {skills.length === 0 && (
          <div className="settings-card" style={{ margin: '0 16px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--sv2)', margin: 0 }}>No skills installed.</p>
          </div>
        )}

        <div className="settings-section-header">DISCOVER</div>
        <div className="settings-card" style={{ margin: '0 16px 8px' }}>
          <button type="button" className="settings-row" style={{ border: '1px solid var(--b2)', borderRadius: 8 }}>
            <span className="settings-row__label">Install from folder...</span>
          </button>
          <p style={{ fontSize: 12, color: 'var(--sv2)', margin: '8px 0 0', lineHeight: 1.4 }}>
            Skills run entirely on your device. No skill data leaves this machine or touches any server.
          </p>
        </div>
      </div>
    </div>
  );
}
