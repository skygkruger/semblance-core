import { useState } from 'react';
import './Settings.css';
import { BackArrow } from './SettingsIcons';

export interface SettingsSearchProps {
  searchEngine: string;
  searchBraveApiKey: string;
  searchSearxngUrl: string;
  searchSaving: boolean;
  onSearchSave: (engine: string, braveApiKey: string, searxngUrl: string) => void;
  onBack: () => void;
}

const SEARCH_OPTIONS = [
  { value: 'searxng', label: 'SearXNG', desc: 'Self-hosted, private meta-search' },
  { value: 'duckduckgo', label: 'DuckDuckGo', desc: 'Zero-config privacy search' },
  { value: 'brave', label: 'Brave Search', desc: 'Requires API key' },
] as const;

export function SettingsSearch({
  searchEngine: initialEngine,
  searchBraveApiKey: initialBraveKey,
  searchSearxngUrl: initialSearxngUrl,
  searchSaving,
  onSearchSave,
  onBack,
}: SettingsSearchProps) {
  const [engine, setEngine] = useState(initialEngine);
  const [braveApiKey, setBraveApiKey] = useState(initialBraveKey);
  const [searxngUrl, setSearxngUrl] = useState(initialSearxngUrl);

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Web Search</h1>
      </div>

      <div className="settings-content">
        <div className="settings-section-header bracket-section">SEARCH ENGINE</div>
        <p className="settings-explanation" style={{ marginBottom: 16 }}>
          Choose which search engine Semblance uses for web queries.
        </p>

        {SEARCH_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`settings-row${engine === opt.value ? '' : ''}`}
            onClick={() => setEngine(opt.value)}
            style={{
              background: engine === opt.value ? 'rgba(110, 207, 163, 0.06)' : undefined,
              borderLeft: engine === opt.value ? '2px solid #6ECFA3' : '2px solid transparent',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="settings-row__label">{opt.label}</span>
              <div style={{ fontSize: 12, color: '#5E6B7C', marginTop: 2, fontWeight: 300 }}>
                {opt.desc}
              </div>
            </div>
            {engine === opt.value && (
              <span className="settings-badge settings-badge--veridian">Active</span>
            )}
          </button>
        ))}

        {/* SearXNG URL field */}
        {engine === 'searxng' && (
          <>
            <div className="settings-section-header bracket-section">SEARXNG INSTANCE</div>
            <div style={{ padding: '8px 20px 16px' }}>
              <input
                type="url"
                value={searxngUrl}
                onChange={(e) => setSearxngUrl(e.target.value)}
                placeholder="https://search.veridian.run"
                className="settings-inline-edit__input"
                style={{ width: '100%', fontFamily: "'DM Mono', monospace", fontSize: 13 }}
              />
            </div>
          </>
        )}

        {/* Brave API key field */}
        {engine === 'brave' && (
          <>
            <div className="settings-section-header bracket-section">API KEY</div>
            <div style={{ padding: '8px 20px 16px' }}>
              <input
                type="password"
                value={braveApiKey}
                onChange={(e) => setBraveApiKey(e.target.value)}
                placeholder="BSA..."
                className="settings-inline-edit__input"
                style={{ width: '100%', fontFamily: "'DM Mono', monospace", fontSize: 13 }}
              />
              <p className="settings-explanation--small" style={{ marginTop: 6, paddingLeft: 0 }}>
                Get a key at brave.com/search/api
              </p>
            </div>
          </>
        )}

        {/* Save button */}
        <div style={{ padding: '16px 20px' }}>
          <button
            type="button"
            className="settings-ghost-button"
            onClick={() => onSearchSave(engine, braveApiKey, searxngUrl)}
            disabled={searchSaving}
            style={{ opacity: searchSaving ? 0.5 : 1, cursor: searchSaving ? 'wait' : 'pointer' }}
          >
            {searchSaving ? 'Saving...' : 'Save Search Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
