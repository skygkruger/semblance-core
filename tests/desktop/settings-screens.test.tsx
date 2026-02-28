// @vitest-environment jsdom
// Tests for Settings screens — all seven components (Root + 6 section screens)

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsRoot } from '../../packages/semblance-ui/components/Settings/SettingsRoot';
import { SettingsAIEngine } from '../../packages/semblance-ui/components/Settings/SettingsAIEngine';
import { SettingsConnections } from '../../packages/semblance-ui/components/Settings/SettingsConnections';
import { SettingsNotifications } from '../../packages/semblance-ui/components/Settings/SettingsNotifications';
import { SettingsAutonomy } from '../../packages/semblance-ui/components/Settings/SettingsAutonomy';
import { SettingsPrivacy } from '../../packages/semblance-ui/components/Settings/SettingsPrivacy';
import { SettingsAccount } from '../../packages/semblance-ui/components/Settings/SettingsAccount';
import { SettingsNavigator } from '../../packages/semblance-ui/components/Settings/SettingsNavigator';

// ─── SettingsRoot ─────────────────────────────────────────

describe('SettingsRoot', () => {
  const defaultProps = {
    currentModel: 'llama3.2:3b',
    activeConnections: 12,
    notificationSummary: 'Daily · 8:00 AM',
    autonomyTier: 'partner' as const,
    privacyStatus: 'clean' as const,
    licenseStatus: 'founding-member' as const,
    appVersion: 'Semblance v0.1.0',
    onNavigate: vi.fn(),
  };

  it('renders Settings title', () => {
    render(<SettingsRoot {...defaultProps} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders all six navigation rows', () => {
    render(<SettingsRoot {...defaultProps} />);
    expect(screen.getByText('AI Engine')).toBeInTheDocument();
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Autonomy')).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('shows model name as AI Engine value', () => {
    render(<SettingsRoot {...defaultProps} />);
    expect(screen.getByText('llama3.2:3b')).toBeInTheDocument();
  });

  it('shows active connections count', () => {
    render(<SettingsRoot {...defaultProps} />);
    expect(screen.getByText('12 active')).toBeInTheDocument();
  });

  it('shows autonomy tier label', () => {
    render(<SettingsRoot {...defaultProps} />);
    expect(screen.getByText('Partner')).toBeInTheDocument();
  });

  it('shows "Audit clean" for clean privacy status', () => {
    render(<SettingsRoot {...defaultProps} />);
    expect(screen.getByText('Audit clean')).toBeInTheDocument();
  });

  it('shows "Review needed" for review-needed privacy status', () => {
    render(<SettingsRoot {...defaultProps} privacyStatus="review-needed" />);
    expect(screen.getByText('Review needed')).toBeInTheDocument();
  });

  it('shows version footer', () => {
    render(<SettingsRoot {...defaultProps} />);
    expect(screen.getByText('Semblance v0.1.0')).toBeInTheDocument();
  });

  it('calls onNavigate when a row is clicked', async () => {
    const onNavigate = vi.fn();
    render(<SettingsRoot {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Autonomy'));
    expect(onNavigate).toHaveBeenCalledWith('autonomy');
  });
});

// ─── SettingsAIEngine ─────────────────────────────────────

describe('SettingsAIEngine', () => {
  const defaultProps = {
    modelName: 'llama3.2:3b',
    modelSize: '3.2B parameters · 2.1 GB',
    hardwareProfile: 'Apple M3 Pro · 18GB unified memory',
    isModelRunning: true,
    inferenceThreads: 'auto' as const,
    contextWindow: 8192 as const,
    gpuAcceleration: true,
    customModelPath: null,
    onChange: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders AI Engine header', () => {
    render(<SettingsAIEngine {...defaultProps} />);
    expect(screen.getByText('AI Engine')).toBeInTheDocument();
  });

  it('shows model name', () => {
    render(<SettingsAIEngine {...defaultProps} />);
    expect(screen.getByText('llama3.2:3b')).toBeInTheDocument();
  });

  it('shows Running badge when model is running', () => {
    render(<SettingsAIEngine {...defaultProps} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows Not loaded badge when model is not running', () => {
    render(<SettingsAIEngine {...defaultProps} isModelRunning={false} />);
    expect(screen.getByText('Not loaded')).toBeInTheDocument();
  });

  it('shows hardware profile', () => {
    render(<SettingsAIEngine {...defaultProps} />);
    expect(screen.getByText('Apple M3 Pro · 18GB unified memory')).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn();
    render(<SettingsAIEngine {...defaultProps} onBack={onBack} />);
    const backButton = screen.getAllByRole('button')[0]!;
    await userEvent.click(backButton);
    expect(onBack).toHaveBeenCalled();
  });

  it('renders context window segment options', () => {
    render(<SettingsAIEngine {...defaultProps} />);
    expect(screen.getByText('4K')).toBeInTheDocument();
    expect(screen.getByText('8K')).toBeInTheDocument();
    expect(screen.getByText('16K')).toBeInTheDocument();
    expect(screen.getByText('32K')).toBeInTheDocument();
  });
});

// ─── SettingsConnections ──────────────────────────────────

describe('SettingsConnections', () => {
  const connections = [
    { id: 'email', name: 'Email (IMAP)', category: 'communication', categoryColor: '#6ECFA3', isConnected: true, lastSync: '2m ago', entityCount: 4821 },
    { id: 'notes', name: 'Notes', category: 'documents', categoryColor: '#A8B4C0', isConnected: false, lastSync: null, entityCount: 0 },
  ];

  const defaultProps = {
    connections,
    onManageAll: vi.fn(),
    onConnectionTap: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders Connections header', () => {
    render(<SettingsConnections {...defaultProps} />);
    expect(screen.getByText('Connections')).toBeInTheDocument();
  });

  it('shows connected and disconnected sections', () => {
    render(<SettingsConnections {...defaultProps} />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
  });

  it('shows connection names', () => {
    render(<SettingsConnections {...defaultProps} />);
    expect(screen.getByText('Email (IMAP)')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('shows empty state when no connections', () => {
    render(<SettingsConnections {...defaultProps} connections={[]} />);
    expect(screen.getByText(/No data sources configured/)).toBeInTheDocument();
  });

  it('shows manage all connections button', () => {
    render(<SettingsConnections {...defaultProps} />);
    expect(screen.getByText('Manage all connections')).toBeInTheDocument();
  });
});

// ─── SettingsNotifications ────────────────────────────────

describe('SettingsNotifications', () => {
  const defaultProps = {
    morningBriefEnabled: true,
    morningBriefTime: '08:00',
    includeWeather: true,
    includeCalendar: true,
    remindersEnabled: true,
    defaultSnoozeDuration: '15m' as const,
    notifyOnAction: true,
    notifyOnApproval: true,
    actionDigest: 'daily' as const,
    badgeCount: true,
    soundEffects: false,
    onChange: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders Notifications header', () => {
    render(<SettingsNotifications {...defaultProps} />);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('shows all section headers', () => {
    render(<SettingsNotifications {...defaultProps} />);
    expect(screen.getByText('Morning Brief')).toBeInTheDocument();
    expect(screen.getByText('Reminders')).toBeInTheDocument();
    expect(screen.getByText('Autonomous Actions')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('shows delivery time', () => {
    render(<SettingsNotifications {...defaultProps} />);
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });

  it('shows snooze duration label', () => {
    render(<SettingsNotifications {...defaultProps} />);
    expect(screen.getByText('15 min')).toBeInTheDocument();
  });

  it('calls onChange when toggle is clicked', () => {
    const onChange = vi.fn();
    render(<SettingsNotifications {...defaultProps} onChange={onChange} />);
    const toggles = screen.getAllByRole('button').filter((el) => el.classList.contains('settings-toggle'));
    fireEvent.click(toggles[0]!); // First toggle: Morning Brief enabled
    expect(onChange).toHaveBeenCalledWith('morningBriefEnabled', false);
  });
});

// ─── SettingsAutonomy ─────────────────────────────────────

describe('SettingsAutonomy', () => {
  const defaultProps = {
    currentTier: 'partner' as const,
    domainOverrides: {} as Record<string, 'guardian' | 'partner' | 'alter-ego' | 'default'>,
    requireConfirmationForIrreversible: true,
    actionReviewWindow: '1m' as const,
    onChange: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders Autonomy header', () => {
    render(<SettingsAutonomy {...defaultProps} />);
    expect(screen.getByText('Autonomy')).toBeInTheDocument();
  });

  it('renders all three tier cards', () => {
    render(<SettingsAutonomy {...defaultProps} />);
    expect(screen.getByText('Guardian')).toBeInTheDocument();
    expect(screen.getByText('Partner')).toBeInTheDocument();
    expect(screen.getByText('Alter Ego')).toBeInTheDocument();
  });

  it('shows ACTIVE badge on current tier', () => {
    render(<SettingsAutonomy {...defaultProps} />);
    const badges = screen.getAllByText('ACTIVE');
    const visible = badges.filter((el) => el.style.visibility !== 'hidden');
    expect(visible).toHaveLength(1);
  });

  it('shows tier descriptions', () => {
    render(<SettingsAutonomy {...defaultProps} />);
    expect(screen.getByText('Approve everything before it happens')).toBeInTheDocument();
    expect(screen.getByText('Handle routine tasks, ask about important ones')).toBeInTheDocument();
    expect(screen.getByText('Act as me for nearly everything')).toBeInTheDocument();
  });

  it('shows domain override section', () => {
    render(<SettingsAutonomy {...defaultProps} />);
    expect(screen.getByText('Domain Overrides')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
  });

  it('shows domain override values when provided', () => {
    render(<SettingsAutonomy {...defaultProps} domainOverrides={{ finance: 'guardian' }} />);
    // "Guardian" appears both as a tier card name and as a domain override value
    const guardianElements = screen.getAllByText('Guardian');
    expect(guardianElements.length).toBeGreaterThanOrEqual(2);
  });

  it('shows safety section', () => {
    render(<SettingsAutonomy {...defaultProps} />);
    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('Require confirmation for irreversible actions')).toBeInTheDocument();
    expect(screen.getByText('1 minute')).toBeInTheDocument();
  });

  it('calls onChange when tier card is clicked', async () => {
    const onChange = vi.fn();
    render(<SettingsAutonomy {...defaultProps} onChange={onChange} />);
    await userEvent.click(screen.getByText('Alter Ego'));
    expect(onChange).toHaveBeenCalledWith('currentTier', 'alter-ego');
  });
});

// ─── SettingsPrivacy ──────────────────────────────────────

describe('SettingsPrivacy', () => {
  const defaultProps = {
    lastAuditTime: 'Feb 28, 2026 · 08:12',
    auditStatus: 'clean' as const,
    dataSources: [
      { id: 'email', name: 'Email', entityCount: 4821, lastIndexed: '2m ago' },
      { id: 'calendar', name: 'Calendar', entityCount: 342, lastIndexed: '5m ago' },
    ],
    onRunAudit: vi.fn(),
    onExportData: vi.fn(),
    onExportHistory: vi.fn(),
    onDeleteSourceData: vi.fn(),
    onDeleteAllData: vi.fn(),
    onResetSemblance: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders Privacy header', () => {
    render(<SettingsPrivacy {...defaultProps} />);
    expect(screen.getByText('Privacy')).toBeInTheDocument();
  });

  it('shows PASS badge for clean audit', () => {
    render(<SettingsPrivacy {...defaultProps} />);
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });

  it('shows REVIEW NEEDED badge for review-needed audit', () => {
    render(<SettingsPrivacy {...defaultProps} auditStatus="review-needed" />);
    expect(screen.getByText('REVIEW NEEDED')).toBeInTheDocument();
  });

  it('shows NEVER RUN badge when never audited', () => {
    render(<SettingsPrivacy {...defaultProps} auditStatus="never-run" lastAuditTime={null} />);
    expect(screen.getByText('NEVER RUN')).toBeInTheDocument();
  });

  it('shows Run audit button', () => {
    render(<SettingsPrivacy {...defaultProps} />);
    expect(screen.getByText('Run audit')).toBeInTheDocument();
  });

  it('shows data source rows', () => {
    render(<SettingsPrivacy {...defaultProps} />);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('shows export options', () => {
    render(<SettingsPrivacy {...defaultProps} />);
    expect(screen.getByText('Export all my data')).toBeInTheDocument();
    expect(screen.getByText('Export action history')).toBeInTheDocument();
  });

  it('shows danger zone rows', () => {
    render(<SettingsPrivacy {...defaultProps} />);
    expect(screen.getByText('Delete all indexed data')).toBeInTheDocument();
    expect(screen.getByText('Reset Semblance')).toBeInTheDocument();
  });
});

// ─── SettingsAccount ──────────────────────────────────────

describe('SettingsAccount', () => {
  const defaultProps = {
    licenseStatus: 'founding-member' as const,
    licenseActivationDate: 'Feb 1, 2026',
    digitalRepresentativeActive: true,
    digitalRepresentativeActivationDate: 'Feb 1, 2026',
    semblanceName: 'Atlas',
    onRenewLicense: vi.fn(),
    onActivateDigitalRepresentative: vi.fn(),
    onViewDRAgreement: vi.fn(),
    onRenameSemblance: vi.fn(),
    onSignOut: vi.fn(),
    onDeactivateLicense: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders Account header', () => {
    render(<SettingsAccount {...defaultProps} />);
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('shows Founding Member badge', () => {
    render(<SettingsAccount {...defaultProps} />);
    expect(screen.getByText('FOUNDING MEMBER')).toBeInTheDocument();
  });

  it('shows Active badge for active license', () => {
    render(<SettingsAccount {...defaultProps} licenseStatus="active" />);
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('shows trial days remaining for trial license', () => {
    render(<SettingsAccount {...defaultProps} licenseStatus="trial" trialDaysRemaining={12} />);
    expect(screen.getByText('12 days remaining')).toBeInTheDocument();
  });

  it('shows Renew button for expired license', () => {
    render(<SettingsAccount {...defaultProps} licenseStatus="expired" />);
    expect(screen.getByText('Renew license')).toBeInTheDocument();
  });

  it('shows DR active status', () => {
    render(<SettingsAccount {...defaultProps} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Activate DR link when not active', () => {
    render(<SettingsAccount {...defaultProps} digitalRepresentativeActive={false} digitalRepresentativeActivationDate={null} />);
    expect(screen.getByText('Activate Digital Representative')).toBeInTheDocument();
  });

  it('shows semblance name', () => {
    render(<SettingsAccount {...defaultProps} />);
    expect(screen.getByText('Atlas')).toBeInTheDocument();
  });

  it('shows danger zone rows', () => {
    render(<SettingsAccount {...defaultProps} />);
    expect(screen.getByText('Sign out')).toBeInTheDocument();
    expect(screen.getByText('Deactivate license')).toBeInTheDocument();
  });

  it('shows confirmation when deactivate is clicked', async () => {
    render(<SettingsAccount {...defaultProps} />);
    await userEvent.click(screen.getByText('Deactivate license'));
    expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
  });
});

// ─── SettingsNavigator ────────────────────────────────────

describe('SettingsNavigator', () => {
  const defaultProps = {
    currentModel: 'llama3.2:3b',
    activeConnections: 12,
    notificationSummary: 'Daily · 8:00 AM',
    autonomyTier: 'partner' as const,
    privacyStatus: 'clean' as const,
    licenseStatus: 'founding-member' as const,
    appVersion: 'Semblance v0.1.0',
    modelName: 'llama3.2:3b',
    modelSize: '3.2B parameters · 2.1 GB',
    hardwareProfile: 'Apple M3 Pro · 18GB',
    isModelRunning: true,
    inferenceThreads: 'auto' as const,
    contextWindow: 8192 as const,
    gpuAcceleration: true,
    customModelPath: null,
    connections: [],
    morningBriefEnabled: true,
    morningBriefTime: '08:00',
    includeWeather: true,
    includeCalendar: true,
    remindersEnabled: true,
    defaultSnoozeDuration: '15m' as const,
    notifyOnAction: true,
    notifyOnApproval: true,
    actionDigest: 'daily' as const,
    badgeCount: true,
    soundEffects: false,
    domainOverrides: {} as Record<string, 'guardian' | 'partner' | 'alter-ego' | 'default'>,
    requireConfirmationForIrreversible: true,
    actionReviewWindow: '1m' as const,
    lastAuditTime: null,
    auditStatus: 'clean' as const,
    dataSources: [],
    licenseActivationDate: 'Feb 1, 2026',
    digitalRepresentativeActive: true,
    digitalRepresentativeActivationDate: 'Feb 1, 2026',
    semblanceName: 'Atlas',
    onChange: vi.fn(),
    onManageAllConnections: vi.fn(),
    onConnectionTap: vi.fn(),
    onRunAudit: vi.fn(),
    onExportData: vi.fn(),
    onExportHistory: vi.fn(),
    onDeleteSourceData: vi.fn(),
    onDeleteAllData: vi.fn(),
    onResetSemblance: vi.fn(),
    onRenewLicense: vi.fn(),
    onActivateDigitalRepresentative: vi.fn(),
    onViewDRAgreement: vi.fn(),
    onRenameSemblance: vi.fn(),
    onSignOut: vi.fn(),
    onDeactivateLicense: vi.fn(),
  };

  it('starts at SettingsRoot', () => {
    render(<SettingsNavigator {...defaultProps} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('AI Engine')).toBeInTheDocument();
  });

  it('navigates to AI Engine and back', async () => {
    render(<SettingsNavigator {...defaultProps} />);
    await userEvent.click(screen.getByText('AI Engine'));
    // Now on AI Engine screen
    expect(screen.getByText('llama3.2:3b')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    // Click back
    const backButton = screen.getAllByRole('button')[0]!;
    await userEvent.click(backButton);
    // Back on root
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('navigates to Autonomy screen', async () => {
    render(<SettingsNavigator {...defaultProps} />);
    await userEvent.click(screen.getByText('Autonomy'));
    expect(screen.getByText('Guardian')).toBeInTheDocument();
    expect(screen.getByText('Partner')).toBeInTheDocument();
    expect(screen.getByText('Alter Ego')).toBeInTheDocument();
  });

  it('navigates to Account screen', async () => {
    render(<SettingsNavigator {...defaultProps} />);
    await userEvent.click(screen.getByText('Account'));
    expect(screen.getByText('FOUNDING MEMBER')).toBeInTheDocument();
  });
});
