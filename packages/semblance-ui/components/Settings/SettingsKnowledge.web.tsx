import './Settings.css';
import { BackArrow } from './SettingsIcons';

export interface KnowledgeStats {
  totalDocuments: number;
  totalEntities: number;
  totalRelationships: number;
  sourceBreakdown: Array<{ source: string; count: number; lastIndexed: string | null }>;
}

export interface SettingsKnowledgeProps {
  stats: KnowledgeStats | null;
  isReindexing: boolean;
  onReindex: () => void;
  onClearSource: (source: string) => void;
  onBack: () => void;
}

export function SettingsKnowledge({ stats, isReindexing, onReindex, onClearSource, onBack }: SettingsKnowledgeProps) {
  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Knowledge Graph</h1>
      </div>

      <div className="settings-content">
        <p className="settings-explanation" style={{ padding: '16px 0 8px' }}>
          Your local knowledge graph stores everything Semblance knows about your digital life.
          All data stays on this device.
        </p>

        {/* Stats */}
        <div className="settings-section-header bracket-section">Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: '0 0 16px' }}>
          {[
            { label: 'Documents', value: stats?.totalDocuments ?? 0 },
            { label: 'Entities', value: stats?.totalEntities ?? 0 },
            { label: 'Relationships', value: stats?.totalRelationships ?? 0 },
          ].map((s) => (
            <div key={s.label} style={{
              background: '#111518', border: '1px solid #1E2227', borderRadius: 8,
              padding: '12px 16px', textAlign: 'center',
            }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 400, color: '#6ECFA3' }}>
                {s.value.toLocaleString()}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#5E6B7C', marginTop: 4 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Sources */}
        {stats && stats.sourceBreakdown.length > 0 && (
          <>
            <div className="settings-section-header bracket-section">Sources</div>
            {stats.sourceBreakdown.map((src) => (
              <div key={src.source} className="settings-row">
                <div style={{ flex: 1 }}>
                  <span className="settings-row__label" style={{ textTransform: 'capitalize' }}>
                    {src.source.replace(/_/g, ' ')}
                  </span>
                  <div style={{ fontSize: 11, color: '#5E6B7C', marginTop: 2 }}>
                    {src.count} documents{src.lastIndexed ? ` — Last indexed: ${new Date(src.lastIndexed).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onClearSource(src.source)}
                  style={{
                    background: 'none', border: 'none', color: '#E8657A',
                    fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', padding: '4px 8px',
                  }}
                >
                  Clear
                </button>
              </div>
            ))}
          </>
        )}

        {/* Actions */}
        <div className="settings-section-header bracket-section">Actions</div>
        <button
          type="button"
          className="settings-row"
          onClick={onReindex}
          style={isReindexing ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
        >
          <span className="settings-row__label">
            {isReindexing ? 'Re-indexing...' : 'Re-index all sources'}
          </span>
        </button>
      </div>
    </div>
  );
}
