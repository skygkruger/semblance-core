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
    <Card className={`p-6 border-l-[3px] ${isClean ? 'border-l-semblance-success' : 'border-l-semblance-attention'}`}>
      <div className="flex items-start gap-4">
        <div className={`w-4 h-4 rounded-full mt-0.5 ${isClean ? 'bg-semblance-success' : 'bg-semblance-attention'}`} />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
            {isClean ? t('screen.network_monitor.zero_connections') : t('screen.network_monitor.blocked_attempts', { count: unauthorizedAttempts })}
          </h2>
          <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-1">
            {isClean
              ? t('screen.network_monitor.trust_clean_desc')
              : t('screen.network_monitor.trust_blocked_desc', { count: unauthorizedAttempts })
            }
          </p>
          <Button size="sm" className="mt-3" onClick={onGenerateReport}>
            {t('screen.network_monitor.btn_proof_report')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ActiveConnectionsCard({ connections }: { connections: ActiveConnection[] }) {
  const { t } = useTranslation();
  if (connections.length === 0) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
          {t('screen.network_monitor.section_active')}
        </h2>
        <p className="text-sm text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark">
          {t('screen.network_monitor.empty_active')}
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
        {t('screen.network_monitor.section_active')}
      </h2>
      <div className="space-y-3">
        {connections.map(conn => (
          <div key={conn.id} className="flex items-center justify-between">
            <div>
              <span className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">
                {conn.service} ({conn.protocol})
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${conn.status === 'active' ? 'bg-semblance-success' : conn.status === 'idle' ? 'bg-semblance-text-tertiary' : 'bg-semblance-attention'}`} />
                <span className="text-xs text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark capitalize">
                  {conn.status}
                </span>
              </div>
            </div>
            <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
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
    <Card className="p-4">
      <h2 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
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
        <p className="text-sm text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark mb-2">
          {t('screen.network_monitor.empty_activity')}
        </p>
      )}
      <div className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
        {stats && (
          <>
            {t('screen.network_monitor.connections_summary', { connections: stats.totalConnections, services: stats.uniqueServicesContacted })}
          </>
        )}
      </div>
      {stats && Object.entries(stats.connectionsByService).length > 0 && (
        <div className="mt-3 space-y-1">
          {Object.entries(stats.connectionsByService)
            .sort(([, a], [, b]) => b - a)
            .map(([service, count]) => (
              <div key={service} className="flex items-center gap-2">
                <div
                  className="h-2 bg-semblance-primary rounded-full"
                  style={{ width: `${Math.max(8, (count / stats.totalConnections) * 100)}%` }}
                />
                <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark whitespace-nowrap">
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
    <Card className="p-4">
      <h2 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
        {t('screen.network_monitor.section_services')}
      </h2>
      <div className="space-y-3">
        {activeServices.map((svc, i) => (
          <div key={i} className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-semblance-success">&#10003;</span>
                <span className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">
                  {svc.service}
                </span>
              </div>
              <p className="text-xs text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark ml-5">
                {svc.domain}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                {t('screen.network_monitor.connections_count', { count: svc.connectionCount })}
              </p>
              <p className="text-xs text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark">
                {svc.addedBy === 'onboarding' ? t('screen.network_monitor.added_during_onboarding') : t('screen.network_monitor.added_by_user')}
              </p>
            </div>
          </div>
        ))}
      </div>
      {activeServices.length > 0 && (
        <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mt-4">
          {t('screen.network_monitor.services_footer')}
        </p>
      )}
      {activeServices.length === 0 && (
        <p className="text-sm text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark">
          {t('screen.network_monitor.empty_services')}
        </p>
      )}
    </Card>
  );
}

function ConnectionLogCard({ history }: { history: ConnectionRecord[] }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
        {t('screen.network_monitor.section_log')}
      </h2>
      {history.length > 0 ? (
        <div className="space-y-1">
          {history.map(record => (
            <div key={record.id} className="flex items-center gap-3 py-1 text-xs font-mono">
              <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark w-16 text-right">
                {formatTime(record.timestamp)}
              </span>
              <span className="text-semblance-text-primary dark:text-semblance-text-primary-dark w-28 truncate">
                {record.action}
              </span>
              <span className="text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark flex-1 truncate">
                {record.service}
              </span>
              <span className={record.status === 'success' ? 'text-semblance-success' : 'text-semblance-attention'}>
                {record.status === 'success' ? '\u2713' : '\u2717'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark">
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
      if (results[0]!.status === 'fulfilled') setStats(results[0]!.value as unknown as NetworkStatistics);
      if (results[1]!.status === 'fulfilled') setConnections(results[1]!.value as unknown as ActiveConnection[]);
      if (results[2]!.status === 'fulfilled') setAllowlist(results[2]!.value as unknown as AllowlistEntry[]);
      if (results[3]!.status === 'fulfilled') setUnauthorized(results[3]!.value as unknown as UnauthorizedAttempt[]);
      if (results[4]!.status === 'fulfilled') setTimeline(results[4]!.value as unknown as TimelinePoint[]);
      if (results[5]!.status === 'fulfilled') setHistory(results[5]!.value as unknown as ConnectionRecord[]);
    } catch {
      // Sidecar not wired
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
    } catch {
      // Error generating report
    }
  };

  if (loading && !stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          {t('screen.network_monitor.loading')}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
            {t('screen.network_monitor.title')}
          </h1>
          <div className="flex gap-1">
            {(['today', 'week', 'month'] as const).map(p => (
              <button
                type="button"
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-semblance-primary text-white'
                    : 'text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark'
                }`}
              >
                {t(`screen.network_monitor.period_${p}`)}
              </button>
            ))}
          </div>
        </div>

        <TrustStatusCard
          unauthorizedAttempts={unauthorized.length}
          onGenerateReport={handleGenerateReport}
        />

        {reportGenerated && (
          <Card className="p-3 border border-semblance-success/30 bg-semblance-success/5">
            <p className="text-sm text-semblance-success">
              {t('screen.network_monitor.proof_success')}
            </p>
          </Card>
        )}

        <ActiveConnectionsCard connections={connections} />

        <ActivityChart timeline={timeline} stats={stats} period={period} />

        <AuthorizedServicesCard services={allowlist} />

        <ConnectionLogCard history={history} />
      </div>
    </div>
  );
}
