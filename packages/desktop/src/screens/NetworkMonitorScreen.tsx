import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, Button } from '@semblance/ui';
import {
  getNetworkStatistics,
  getActiveConnections,
  getNetworkAllowlist,
  getUnauthorizedAttempts,
  getConnectionTimeline,
  getConnectionHistory,
  generatePrivacyReport,
} from '../ipc/commands';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { ShimmerDescription } from '../components/ShimmerDescription';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActiveConnection {
  id: string;
  service: string;
  protocol: string;
  connectedSince: string;
  status: 'active' | 'idle' | 'reconnecting';
  lastActivity: string;
}

interface NetworkStatistics {
  period: string;
  totalConnections: number;
  connectionsByService: Record<string, number>;
  connectionsByAction: Record<string, number>;
  unauthorizedAttempts: number;
  uniqueServicesContacted: number;
  averageTimeSavedSeconds: number;
  totalTimeSavedSeconds: number;
}

interface AllowlistEntry {
  service: string;
  domain: string;
  protocol: string;
  addedAt: string;
  addedBy: string;
  connectionCount: number;
  lastUsed: string | null;
  isActive: boolean;
}

interface UnauthorizedAttempt {
  timestamp: string;
  requestedAction: string;
  reason: string;
  blocked: true;
}

interface TimelinePoint {
  timestamp: string;
  connections: number;
}

interface ConnectionRecord {
  id: string;
  timestamp: string;
  service: string;
  action: string;
  direction: 'outbound';
  status: 'success' | 'error' | 'timeout';
  requestId: string;
  durationMs: number;
}

interface PrivacyReport {
  metadata: {
    generatedAt: string;
    period: { start: string; end: string };
    appVersion: string;
    deviceId: string;
  };
  summary: {
    totalConnections: number;
    authorizedServices: string[];
    unauthorizedAttempts: number;
    totalTimeSavedSeconds: number;
  };
  services: Array<{
    name: string;
    domain: string;
    connectionCount: number;
    firstConnection: string | null;
    lastConnection: string | null;
  }>;
  auditTrailHash: string;
  statement: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('time.just_now');
  if (minutes < 60) return t('time.minutes_ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hours_ago', { count: hours });
  const days = Math.floor(hours / 24);
  return t('time.days_ago', { count: days });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TrustStatusCard({ unauthorizedAttempts, onGenerateReport }: {
  unauthorizedAttempts: number;
  onGenerateReport: () => void;
}) {
  const { t } = useTranslation();
  const isClean = unauthorizedAttempts === 0;
  return (
    <Card className={`surface-void opal-wireframe`}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 className="bracket-section" style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 400, color: '#EEF1F4', letterSpacing: '0.04em', margin: 0 }}>
            {isClean ? t('screen.network_monitor.zero_connections') : t('screen.network_monitor.blocked_attempts', { count: unauthorizedAttempts })}
          </h2>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: isClean ? '#6ECFA3' : '#EDDD52',
            animation: 'pulse 2s ease-in-out infinite',
            animationDelay: '-1000s',
          }} />
        </div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em', marginTop: 4 }}>
            {isClean
              ? t('screen.network_monitor.trust_clean_desc')
              : t('screen.network_monitor.trust_blocked_desc', { count: unauthorizedAttempts })
            }
          </p>
        <button type="button" className="btn btn--opal btn--sm" style={{ marginTop: 12 }} onClick={onGenerateReport}>
          <span className="btn__text">{t('screen.network_monitor.btn_proof_report')}</span>
        </button>
      </div>
    </Card>
  );
}

function ActiveConnectionsCard({ connections }: { connections: ActiveConnection[] }) {
  const { t } = useTranslation();
  if (connections.length === 0) {
    return (
      <Card className="p-4 surface-void opal-wireframe">
        <h2 className="bracket-section" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          {t('screen.network_monitor.section_active')}
        </h2>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
          {t('screen.network_monitor.empty_active')}
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-4 surface-void opal-wireframe">
      <h2 className="bracket-section" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 12 }}>
        {t('screen.network_monitor.section_active')}
      </h2>
      <div className="space-y-3">
        {connections.map(conn => (
          <div key={conn.id} className="flex items-center justify-between">
            <div>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>
                {conn.service} ({conn.protocol})
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${conn.status === 'active' ? 'bg-semblance-success' : conn.status === 'idle' ? 'bg-semblance-text-tertiary' : 'bg-semblance-attention'}`} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', textTransform: 'capitalize' as const }}>
                  {conn.status}
                </span>
              </div>
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
              {timeAgo(conn.lastActivity, t)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ActivityChart({ timeline, stats, period }: {
  timeline: TimelinePoint[];
  stats: NetworkStatistics | null;
  period: string;
}) {
  const { t } = useTranslation();
  const maxConnections = Math.max(1, ...timeline.map(tp => tp.connections));
  return (
    <Card className="p-4 surface-void opal-wireframe">
      <h2 className="bracket-section" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 12 }}>
        {period === 'today' ? t('screen.network_monitor.activity_today') : period === 'week' ? t('screen.network_monitor.activity_week') : t('screen.network_monitor.activity_month')}
      </h2>
      {timeline.length > 0 ? (
        <div className="flex items-end gap-[2px] h-16 mb-2">
          {timeline.map((point, i) => (
            <div
              key={i}
              className="flex-1 bg-semblance-primary rounded-t-sm transition-all duration-normal"
              style={{ height: `${(point.connections / maxConnections) * 100}%`, minHeight: point.connections > 0 ? '2px' : '0px' }}
              title={`${point.timestamp}: ${point.connections} connections`}
            />
          ))}
        </div>
      ) : (
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', marginBottom: 8 }}>
          {t('screen.network_monitor.empty_activity')}
        </p>
      )}
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
        {stats && (
          <>
            {t('screen.network_monitor.connections_summary', { connections: stats.totalConnections, services: stats.uniqueServicesContacted })}
          </>
        )}
      </div>
      {stats && Object.entries(stats.connectionsByService ?? {}).length > 0 && (
        <div className="mt-3 space-y-1">
          {Object.entries(stats.connectionsByService ?? {})
            .sort(([, a], [, b]) => b - a)
            .map(([service, count]) => (
              <div key={service} className="flex items-center gap-2">
                <div
                  className="h-2 bg-semblance-primary rounded-full"
                  style={{ width: `${Math.max(8, (count / stats.totalConnections) * 100)}%` }}
                />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }}>
                  {service} · {count}
                </span>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}

function AuthorizedServicesCard({ services }: { services: AllowlistEntry[] }) {
  const { t } = useTranslation();
  const activeServices = services.filter(s => s.isActive);
  return (
    <Card className="p-4 surface-void opal-wireframe">
      <h2 className="bracket-section" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 12 }}>
        {t('screen.network_monitor.section_services')}
      </h2>
      <div className="space-y-3">
        {activeServices.map((svc, i) => (
          <div key={i} className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6ECFA3' }}>&#10003;</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>
                  {svc.service}
                </span>
              </div>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', marginLeft: 20 }}>
                {svc.domain}
              </p>
            </div>
            <div className="text-right">
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
                {t('screen.network_monitor.connections_count', { count: svc.connectionCount })}
              </p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
                {svc.addedBy === 'onboarding' ? t('screen.network_monitor.added_during_onboarding') : t('screen.network_monitor.added_by_user')}
              </p>
            </div>
          </div>
        ))}
      </div>
      {activeServices.length > 0 && (
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 400, color: '#EEF1F4', letterSpacing: '0.04em', marginTop: 16 }}>
          {t('screen.network_monitor.services_footer')}
        </p>
      )}
      {activeServices.length === 0 && (
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
          {t('screen.network_monitor.empty_services')}
        </p>
      )}
    </Card>
  );
}

function ConnectionLogCard({ history }: { history: ConnectionRecord[] }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4 surface-void opal-wireframe">
      <h2 className="bracket-section" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 12 }}>
        {t('screen.network_monitor.section_log')}
      </h2>
      {history.length > 0 ? (
        <div className="space-y-1">
          {history.map(record => (
            <div key={record.id} className="flex items-center gap-3 py-1 text-xs font-mono">
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', width: 64, textAlign: 'right' as const }}>
                {formatTime(record.timestamp)}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em', width: 112, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {record.action}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {record.service}
              </span>
              <span style={{ color: record.status === 'success' ? '#6ECFA3' : '#EDDD52' }}>
                {record.status === 'success' ? '\u2713' : '\u2717'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
          {t('screen.network_monitor.empty_log')}
        </p>
      )}
    </Card>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export function NetworkMonitorScreen() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<NetworkStatistics | null>(null);
  const [connections, setConnections] = useState<ActiveConnection[]>([]);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [unauthorized, setUnauthorized] = useState<UnauthorizedAttempt[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [history, setHistory] = useState<ConnectionRecord[]>([]);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [loading, setLoading] = useState(true);
  const [reportGenerated, setReportGenerated] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        getNetworkStatistics(period),
        getActiveConnections(),
        getNetworkAllowlist(),
        getUnauthorizedAttempts(period),
        getConnectionTimeline(period, period === 'today' ? 'hour' : 'day'),
        getConnectionHistory(20),
      ]);
      if (results[0]!.status === 'fulfilled' && results[0]!.value) setStats(results[0]!.value as unknown as NetworkStatistics);
      if (results[1]!.status === 'fulfilled') setConnections((results[1]!.value ?? []) as unknown as ActiveConnection[]);
      if (results[2]!.status === 'fulfilled') setAllowlist((results[2]!.value ?? []) as unknown as AllowlistEntry[]);
      if (results[3]!.status === 'fulfilled') setUnauthorized((results[3]!.value ?? []) as unknown as UnauthorizedAttempt[]);
      if (results[4]!.status === 'fulfilled') setTimeline((results[4]!.value ?? []) as unknown as TimelinePoint[]);
      if (results[5]!.status === 'fulfilled') setHistory((results[5]!.value ?? []) as unknown as ConnectionRecord[]);
    } catch (err) {
      console.error('[NetworkMonitor] loadData failed:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleGenerateReport = async () => {
    try {
      const now = new Date();
      const endDate = now.toISOString();
      const startDate = period === 'today'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
        : period === 'week'
          ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await generatePrivacyReport(startDate, endDate);
      setReportGenerated(true);
      setTimeout(() => setReportGenerated(false), 3000);
    } catch (err) {
      console.error('[NetworkMonitor] generateReport failed:', err);
    }
  };

  if (loading && !stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em' }}>
          {t('screen.network_monitor.loading')}
        </p>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <GhostSprite insight="Real-time monitoring of every network connection.">
        <div className="flex items-center justify-between">
          <h1 className="page-title" style={{ fontSize: 28 }}>
            {t('screen.network_monitor.title')}
          </h1>
          <div className="flex gap-1">
            {(['today', 'week', 'month'] as const).map(pd => {
              const isActive = period === pd;
              return (
                <button
                  type="button"
                  key={pd}
                  onClick={() => setPeriod(pd)}
                  className="btn btn--opal btn--sm"
                  style={isActive ? {
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    borderColor: 'rgba(110, 207, 163, 0.45)',
                    boxShadow: '0 0 12px rgba(110, 207, 163, 0.18), inset 0 0 8px rgba(110, 207, 163, 0.08)',
                  } : {
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    letterSpacing: '0.04em',
                  }}
                >
                  <span className="btn__text">{t(`screen.network_monitor.period_${pd}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <ShimmerDescription text="Real-time network sovereignty monitoring" />

        <section>
          <TrustStatusCard
            unauthorizedAttempts={unauthorized.length}
            onGenerateReport={handleGenerateReport}
          />
        </section>

        {reportGenerated && (
          <section>
            <Card className="p-3 border border-semblance-success/30 bg-semblance-success/5 surface-void opal-wireframe">
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6ECFA3', letterSpacing: '0.04em' }}>
                {t('screen.network_monitor.proof_success')}
              </p>
            </Card>
          </section>
        )}

        <section><ActiveConnectionsCard connections={connections} /></section>

        <section><ActivityChart timeline={timeline} stats={stats} period={period} /></section>

        <section><AuthorizedServicesCard services={allowlist} /></section>

        <section><ConnectionLogCard history={history} /></section>
        </GhostSprite>
        </ContentBracket>
      </div>
    </div>
  );
}
