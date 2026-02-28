import { useState } from 'react';
import { SettingsRoot } from './SettingsRoot';
import { SettingsAIEngine } from './SettingsAIEngine';
import { SettingsConnections } from './SettingsConnections';
import { SettingsNotifications } from './SettingsNotifications';
import { SettingsAutonomy } from './SettingsAutonomy';
import { SettingsPrivacy } from './SettingsPrivacy';
import { SettingsAccount } from './SettingsAccount';

import type { SettingsScreen } from './SettingsRoot';

type Screen = 'root' | SettingsScreen;

interface SettingsNavigatorProps {
  /* SettingsRoot props */
  currentModel: string;
  activeConnections: number;
  notificationSummary: string;
  autonomyTier: 'guardian' | 'partner' | 'alter-ego';
  privacyStatus: 'clean' | 'review-needed';
  licenseStatus: 'founding-member' | 'active' | 'trial' | 'expired';
  appVersion: string;

  /* AI Engine props */
  modelName: string;
  modelSize: string;
  hardwareProfile: string;
  isModelRunning: boolean;
  inferenceThreads: number | 'auto';
  contextWindow: 4096 | 8192 | 16384 | 32768;
  gpuAcceleration: boolean;
  customModelPath: string | null;

  /* Connections props */
  connections: Array<{
    id: string;
    name: string;
    category: string;
    categoryColor: string;
    isConnected: boolean;
    lastSync: string | null;
    entityCount: number;
  }>;

  /* Notifications props */
  morningBriefEnabled: boolean;
  morningBriefTime: string;
  includeWeather: boolean;
  includeCalendar: boolean;
  remindersEnabled: boolean;
  defaultSnoozeDuration: '5m' | '15m' | '1h' | '1d';
  notifyOnAction: boolean;
  notifyOnApproval: boolean;
  actionDigest: 'immediate' | 'hourly' | 'daily';
  badgeCount: boolean;
  soundEffects: boolean;

  /* Autonomy props */
  domainOverrides: Record<string, 'guardian' | 'partner' | 'alter-ego' | 'default'>;
  requireConfirmationForIrreversible: boolean;
  actionReviewWindow: '30s' | '1m' | '5m';

  /* Privacy props */
  lastAuditTime: string | null;
  auditStatus: 'clean' | 'review-needed' | 'never-run';
  dataSources: Array<{
    id: string;
    name: string;
    entityCount: number;
    lastIndexed: string;
  }>;

  /* Account props */
  licenseActivationDate: string;
  trialDaysRemaining?: number;
  digitalRepresentativeActive: boolean;
  digitalRepresentativeActivationDate: string | null;
  semblanceName: string;

  /* Callbacks */
  onChange: (key: string, value: unknown) => void;
  onManageAllConnections: () => void;
  onConnectionTap: (id: string) => void;
  onRunAudit: () => void;
  onExportData: () => void;
  onExportHistory: () => void;
  onDeleteSourceData: (sourceId: string) => void;
  onDeleteAllData: () => void;
  onResetSemblance: () => void;
  onRenewLicense: () => void;
  onActivateDigitalRepresentative: () => void;
  onViewDRAgreement: () => void;
  onRenameSemblance: (name: string) => void;
  onSignOut: () => void;
  onDeactivateLicense: () => void;
}

export function SettingsNavigator(props: SettingsNavigatorProps) {
  const [currentScreen, setCurrentScreen] = useState<Screen>('root');
  const goBack = () => setCurrentScreen('root');

  switch (currentScreen) {
    case 'ai-engine':
      return (
        <SettingsAIEngine
          modelName={props.modelName}
          modelSize={props.modelSize}
          hardwareProfile={props.hardwareProfile}
          isModelRunning={props.isModelRunning}
          inferenceThreads={props.inferenceThreads}
          contextWindow={props.contextWindow}
          gpuAcceleration={props.gpuAcceleration}
          customModelPath={props.customModelPath}
          onChange={props.onChange}
          onBack={goBack}
        />
      );

    case 'connections':
      return (
        <SettingsConnections
          connections={props.connections}
          onManageAll={props.onManageAllConnections}
          onConnectionTap={props.onConnectionTap}
          onBack={goBack}
        />
      );

    case 'notifications':
      return (
        <SettingsNotifications
          morningBriefEnabled={props.morningBriefEnabled}
          morningBriefTime={props.morningBriefTime}
          includeWeather={props.includeWeather}
          includeCalendar={props.includeCalendar}
          remindersEnabled={props.remindersEnabled}
          defaultSnoozeDuration={props.defaultSnoozeDuration}
          notifyOnAction={props.notifyOnAction}
          notifyOnApproval={props.notifyOnApproval}
          actionDigest={props.actionDigest}
          badgeCount={props.badgeCount}
          soundEffects={props.soundEffects}
          onChange={props.onChange}
          onBack={goBack}
        />
      );

    case 'autonomy':
      return (
        <SettingsAutonomy
          currentTier={props.autonomyTier}
          domainOverrides={props.domainOverrides}
          requireConfirmationForIrreversible={props.requireConfirmationForIrreversible}
          actionReviewWindow={props.actionReviewWindow}
          onChange={props.onChange}
          onBack={goBack}
        />
      );

    case 'privacy':
      return (
        <SettingsPrivacy
          lastAuditTime={props.lastAuditTime}
          auditStatus={props.auditStatus}
          dataSources={props.dataSources}
          onRunAudit={props.onRunAudit}
          onExportData={props.onExportData}
          onExportHistory={props.onExportHistory}
          onDeleteSourceData={props.onDeleteSourceData}
          onDeleteAllData={props.onDeleteAllData}
          onResetSemblance={props.onResetSemblance}
          onBack={goBack}
        />
      );

    case 'account':
      return (
        <SettingsAccount
          licenseStatus={props.licenseStatus}
          licenseActivationDate={props.licenseActivationDate}
          trialDaysRemaining={props.trialDaysRemaining}
          digitalRepresentativeActive={props.digitalRepresentativeActive}
          digitalRepresentativeActivationDate={props.digitalRepresentativeActivationDate}
          semblanceName={props.semblanceName}
          onRenewLicense={props.onRenewLicense}
          onActivateDigitalRepresentative={props.onActivateDigitalRepresentative}
          onViewDRAgreement={props.onViewDRAgreement}
          onRenameSemblance={props.onRenameSemblance}
          onSignOut={props.onSignOut}
          onDeactivateLicense={props.onDeactivateLicense}
          onBack={goBack}
        />
      );

    default:
      return (
        <SettingsRoot
          currentModel={props.currentModel}
          activeConnections={props.activeConnections}
          notificationSummary={props.notificationSummary}
          autonomyTier={props.autonomyTier}
          privacyStatus={props.privacyStatus}
          licenseStatus={props.licenseStatus}
          appVersion={props.appVersion}
          onNavigate={(screen) => setCurrentScreen(screen)}
        />
      );
  }
}
