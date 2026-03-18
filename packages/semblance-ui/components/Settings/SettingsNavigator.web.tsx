import { useState } from 'react';
import { SettingsRoot } from './SettingsRoot';
import { SettingsAIEngine } from './SettingsAIEngine';
import { SettingsConnections } from './SettingsConnections';
import { SettingsNotifications } from './SettingsNotifications';
import { SettingsAutonomy } from './SettingsAutonomy';
import { SettingsPrivacy } from './SettingsPrivacy';
import { SettingsAccount } from './SettingsAccount';
import { SettingsChannels } from './SettingsChannels.web';
import { SettingsSessions } from './SettingsSessions.web';
import { SettingsPreferences } from './SettingsPreferences.web';
import { SettingsSkills } from './SettingsSkills.web';
import { SettingsBinaryAllowlist } from './SettingsBinaryAllowlist.web';
import { SettingsTunnelPairing } from './SettingsTunnelPairing.web';
import type { Screen, SettingsNavigatorProps } from './SettingsNavigator.types';

export function SettingsNavigator(props: SettingsNavigatorProps) {
  const [currentScreen, setCurrentScreen] = useState<Screen>('root');
  const goBack = () => setCurrentScreen('root');

  // Screens that navigate externally (full desktop screens)
  const externalScreens: Record<string, string> = {
    'living-will': '/living-will',
    'witness': '/witness',
    'inheritance': '/inheritance',
    'adversarial': '/adversarial',
    'biometric': '/settings/biometric',
    'backup': '/settings/backup',
    'voice': '/settings/voice',
    'location': '/settings/location',
    'cloud-storage': '/settings/cloud-storage',
    'semblance-network': '/semblance-network',
  };

  const handleNavigate = (screen: Screen) => {
    const externalPath = externalScreens[screen];
    if (externalPath && props.onNavigateExternal) {
      props.onNavigateExternal(externalPath);
    } else {
      setCurrentScreen(screen);
    }
  };

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
          bitnetModels={props.bitnetModels}
          bitnetActiveModelId={props.bitnetActiveModelId}
          bitnetDownloadingModelId={props.bitnetDownloadingModelId}
          bitnetDownloadProgress={props.bitnetDownloadProgress}
          onBitNetDownload={props.onBitNetDownload}
          onBitNetActivate={props.onBitNetActivate}
          standardModels={props.standardModels}
          standardActiveModelId={props.standardActiveModelId}
          standardDownloadingModelId={props.standardDownloadingModelId}
          standardDownloadProgress={props.standardDownloadProgress}
          onStandardDownload={props.onStandardDownload}
          onStandardActivate={props.onStandardActivate}
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

    // Sprint-built in-settings panels
    case 'channels':
      return <SettingsChannels onBack={goBack} />;

    case 'sessions':
      return <SettingsSessions onBack={goBack} />;

    case 'preferences':
      return <SettingsPreferences onBack={goBack} />;

    case 'skills':
      return <SettingsSkills onBack={goBack} />;

    case 'binary-allowlist':
      return <SettingsBinaryAllowlist onBack={goBack} />;

    case 'tunnel-pairing':
      return <SettingsTunnelPairing onBack={goBack} />;

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
          onNavigate={(screen) => handleNavigate(screen)}
          onNavigateIntents={props.onNavigateIntents}
          onNavigateExternal={props.onNavigateExternal}
          channelCount={props.channelCount}
          sessionCount={props.sessionCount}
          pairedDeviceCount={props.pairedDeviceCount}
          preferenceCount={props.preferenceCount}
          installedSkillCount={props.installedSkillCount}
          livingWillLastBackup={props.livingWillLastBackup}
          witnessAttestationCount={props.witnessAttestationCount}
          inheritanceConfigured={props.inheritanceConfigured}
          biometricEnabled={props.biometricEnabled}
          lastBackupAt={props.lastBackupAt}
          binaryAllowlistCount={props.binaryAllowlistCount}
          adversarialAlertCount={props.adversarialAlertCount}
        />
      );
  }
}
