import { useTranslation } from 'react-i18next';
import './Settings.css';
import { BackArrow } from './SettingsIcons';

export interface CronJobDisplay {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastFiredAt: string | null;
  nextFireAt: string;
}

export interface SettingsScheduledJobsProps {
  jobs: CronJobDisplay[];
  onToggleJob: (jobId: string, enabled: boolean) => void;
  onUpdateSchedule?: (jobId: string, schedule: string) => void;
  onBack: () => void;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="settings-toggle" data-on={String(on)} onClick={onToggle}>
      <span className="settings-toggle__thumb" />
    </button>
  );
}

function cronToHuman(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [min, hour, dom, , dow] = parts as [string, string, string, string, string];
  if (schedule.startsWith('*/')) return `Every ${min.slice(2)} minutes`;
  if (dom === '1' && hour !== '*') return `Monthly at ${hour}:${min.padStart(2, '0')}`;
  if (dow === '0' && hour !== '*') return `Weekly (Sun) at ${hour}:${min.padStart(2, '0')}`;
  if (hour !== '*' && hour.includes(',')) {
    const times = hour.split(',').map(h => `${h}:${min.padStart(2, '0')}`).join(', ');
    return `Daily at ${times}`;
  }
  if (hour !== '*') return `Daily at ${hour}:${min.padStart(2, '0')}`;
  return schedule;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) {
    const mins = Math.round(Math.abs(diffMs) / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.round(mins / 60);
    return `in ${hrs}h`;
  }
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function SettingsScheduledJobs({ jobs, onToggleJob, onBack }: SettingsScheduledJobsProps) {
  const { t } = useTranslation('settings');
  const enabledCount = jobs.filter(j => j.enabled).length;

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Scheduled Jobs</h1>
      </div>

      <div className="settings-content">
        <p className="settings-explanation" style={{ padding: '16px 0 8px' }}>
          Semblance runs these jobs automatically on schedule. Toggle to enable or disable.
          {' '}{enabledCount} of {jobs.length} jobs active.
        </p>

        {jobs.map((job) => (
          <div key={job.id} className="settings-row" onClick={() => onToggleJob(job.id, !job.enabled)}>
            <div style={{ flex: 1 }}>
              <span className="settings-row__label">{job.name}</span>
              <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C' }}>
                  {cronToHuman(job.schedule)}
                </span>
                <span style={{ fontSize: 11, color: '#5E6B7C' }}>
                  Last: {formatRelativeTime(job.lastFiredAt)}
                </span>
                <span style={{ fontSize: 11, color: '#5E6B7C' }}>
                  Next: {formatRelativeTime(job.nextFireAt)}
                </span>
              </div>
            </div>
            <Toggle on={job.enabled} onToggle={() => onToggleJob(job.id, !job.enabled)} />
          </div>
        ))}
      </div>
    </div>
  );
}
