export interface DataSourceEntry {
  id: string;
  name: string;
  entityCount: number;
  lastIndexed: string;
}

export interface SettingsPrivacyProps {
  lastAuditTime: string | null;
  auditStatus: 'clean' | 'review-needed' | 'never-run';
  dataSources: DataSourceEntry[];
  onRunAudit: () => void;
  onExportData: () => void;
  onExportHistory: () => void;
  onDeleteSourceData: (sourceId: string) => void;
  onDeleteAllData: () => void;
  onResetSemblance: () => void;
  onBack: () => void;
}
