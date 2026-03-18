import { useState, useEffect, useCallback } from 'react';
import { prefGet, prefSet } from '../ipc/commands';

interface CanvasUpdate {
  componentType: 'morning_brief' | 'knowledge_graph' | 'chart' | 'timeline' | 'form_preview' | 'alter_ego_card' | 'custom';
  data: Record<string, unknown>;
  replace: boolean;
  title?: string;
  executedOn?: 'local' | 'remote';
  remoteDeviceName?: string;
}

interface CanvasCard {
  id: string;
  componentType: string;
  data: Record<string, unknown>;
  title?: string;
  receivedAt: string;
  executedOn?: 'local' | 'remote';
  remoteDeviceName?: string;
}

export function CanvasPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [cards, setCards] = useState<CanvasCard[]>([]);

  // Hydrate isOpen from SQLite prefs on mount
  useEffect(() => {
    let cancelled = false;
    prefGet('semblance.canvas.open').then((val) => {
      if (!cancelled && val === 'true') setIsOpen(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Persist isOpen to SQLite prefs
  const setIsOpenPersisted = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setIsOpen((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      prefSet('semblance.canvas.open', String(next)).catch(() => {});
      return next;
    });
  }, []);

  // Listen for canvas:update Tauri events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    try {
      const { listen } = require('@tauri-apps/api/event');
      listen('semblance://canvas:update', (event: { payload: CanvasUpdate | null }) => {
        if (!event.payload) {
          setCards([]);
          return;
        }
        const update = event.payload;
        const newCard: CanvasCard = {
          id: `card_${Date.now()}`,
          componentType: update.componentType,
          data: update.data,
          title: update.title,
          receivedAt: new Date().toISOString(),
          executedOn: update.executedOn,
          remoteDeviceName: update.remoteDeviceName,
        };

        if (update.replace) {
          setCards([newCard]);
        } else {
          setCards(prev => [...prev, newCard]);
        }
        setIsOpenPersisted(true); // Auto-expand when content arrives
      }).then((fn: () => void) => { unlisten = fn; });
    } catch { /* Tauri events not available */ }

    return () => { unlisten?.(); };
  }, []);

  return (
    <div
      style={{
        width: isOpen ? 320 : 0,
        minWidth: isOpen ? 320 : 0,
        overflow: 'hidden',
        transition: 'width 220ms cubic-bezier(0.16, 1, 0.3, 1), min-width 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        borderLeft: isOpen ? '1px solid rgba(255,255,255,0.09)' : 'none',
        background: '#111518',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          height: 44,
          minHeight: 44,
          background: '#161A1E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span style={{ fontFamily: 'var(--fm, "DM Mono", monospace)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#5E6B7C' }}>
          CANVAS
        </span>
        <button
          type="button"
          onClick={() => setIsOpenPersisted(!isOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: '#8593A4',
            cursor: 'pointer',
            fontSize: 16,
            padding: 4,
            transition: 'transform 150ms ease',
            transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)',
          }}
        >
          &#x276E;
        </button>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cards.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <span style={{ fontFamily: 'var(--fb, "DM Sans", sans-serif)', fontSize: 13, fontWeight: 300, color: '#8593A4' }}>
              Nothing on canvas yet.
            </span>
          </div>
        )}

        {cards.map(card => (
          <div
            key={card.id}
            style={{
              background: '#161A1E',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 12,
              padding: 16,
              animation: 'canvasFadeIn 220ms ease-out',
            }}
          >
            {card.title && (
              <div style={{ fontFamily: 'var(--fb, "DM Sans", sans-serif)', fontSize: 13, fontWeight: 400, color: '#CDD5DC', marginBottom: 8 }}>
                {card.title}
              </div>
            )}
            <CanvasCardContent componentType={card.componentType} data={card.data} />
            {card.executedOn === 'remote' && card.remoteDeviceName && (
              <div style={{ fontFamily: 'var(--fm, "DM Mono", monospace)', fontSize: 11, color: '#5E6B7C', marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
                Answered using {card.remoteDeviceName}&apos;s full knowledge graph
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes canvasFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function CanvasCardContent({ componentType, data }: { componentType: string; data: Record<string, unknown> }) {
  switch (componentType) {
    case 'morning_brief': {
      const urgent = data.urgentEmail as { subject?: string } | undefined;
      const meeting = data.meetingPrep as { title?: string } | undefined;
      return (
        <div style={{ fontSize: 12, color: '#A8B4C0', lineHeight: 1.5 }}>
          {urgent ? <div>Urgent: {urgent.subject ?? 'New email'}</div> : null}
          {meeting ? <div>Meeting: {meeting.title ?? 'Upcoming'}</div> : null}
          {!urgent && !meeting && <div>Morning brief ready.</div>}
        </div>
      );
    }
    case 'chart': {
      const anomaly = data.anomaly as { description?: string } | undefined;
      return (
        <div style={{ fontSize: 12, color: '#A8B4C0' }}>
          {anomaly ? <div style={{ color: '#B07A8A' }}>Anomaly: {anomaly.description}</div> : <div>Chart data available.</div>}
        </div>
      );
    }
    case 'timeline':
      return (
        <div style={{ fontSize: 12, color: '#A8B4C0' }}>
          {Array.isArray(data.items) && (data.items as Array<{ time: string; label: string }>).map((item, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: '#5E6B7C' }}>{item.time}</span> {item.label}
            </div>
          ))}
        </div>
      );
    case 'form_preview':
      return (
        <div style={{ fontSize: 12, color: '#A8B4C0' }}>
          {Object.entries(data).filter(([k]) => k !== 'title').map(([key, val]) => (
            <div key={key} style={{ marginBottom: 2 }}>
              <span style={{ color: '#5E6B7C' }}>{key}:</span> {String(val)}
            </div>
          ))}
        </div>
      );
    case 'custom':
      return (
        <div style={{ fontSize: 12, color: '#A8B4C0', lineHeight: 1.5 }}>
          {data.text ? String(data.text) : 'Custom content.'}
        </div>
      );
    default:
      return <div style={{ fontSize: 12, color: '#5E6B7C' }}>Unknown component: {componentType}</div>;
  }
}
