import './Settings.css';
import { BackArrow } from './SettingsIcons';

export interface SettingsAboutProps {
  appVersion: string;
  hardwareProfile: string;
  activeModel: string;
  knowledgeDocCount: number;
  onBack: () => void;
}

export function SettingsAbout({ appVersion, hardwareProfile, activeModel, knowledgeDocCount, onBack }: SettingsAboutProps) {
  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">About Semblance</h1>
      </div>

      <div className="settings-content">
        <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 300, color: '#6ECFA3', letterSpacing: '0.05em' }}>
            SEMBLANCE
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#5E6B7C', marginTop: 4 }}>
            Your Intelligence. Your Device. Your Rules.
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#8593A4', marginTop: 8 }}>
            v{appVersion}
          </div>
        </div>

        <div className="settings-section-header bracket-section">System</div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Hardware</span>
          <span className="settings-row__value">{hardwareProfile}</span>
        </div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Active Model</span>
          <span className="settings-row__value">{activeModel}</span>
        </div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Knowledge Base</span>
          <span className="settings-row__value">{knowledgeDocCount.toLocaleString()} documents</span>
        </div>

        <div className="settings-section-header bracket-section">Privacy</div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Data Storage</span>
          <span className="settings-row__value" style={{ color: '#6ECFA3' }}>Local only</span>
        </div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Telemetry</span>
          <span className="settings-row__value" style={{ color: '#6ECFA3' }}>None</span>
        </div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Network Access</span>
          <span className="settings-row__value">Gateway only</span>
        </div>

        <div className="settings-section-header bracket-section">Legal</div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Built by</span>
          <span className="settings-row__value">VERIDIAN SYNTHETICS</span>
        </div>
        <div className="settings-row settings-row--static">
          <span className="settings-row__label">License</span>
          <span className="settings-row__value">Open Core (MIT/Apache 2.0)</span>
        </div>
      </div>
    </div>
  );
}
