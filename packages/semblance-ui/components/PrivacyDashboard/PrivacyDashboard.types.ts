export interface NetworkEntry {
  label: string;
  value: string;
  isZero?: boolean;
}

export interface AuditEntry {
  status: 'completed' | 'pending' | 'failed' | 'undone';
  text: string;
  domain?: string;
  timestamp?: string;
}

export interface ChainIntegrityData {
  verified: boolean;
  entryCount: number;
  daysVerified: number;
  firstBreak?: string;
  loading?: boolean;
}

export interface KeySecurityData {
  hardwareBacked: boolean;
  backend: string;
  publicKeyFingerprint?: string;
  loading?: boolean;
}

export interface PrivacyDashboardProps {
  dataSources?: number;
  cloudConnections?: number;
  actionsLogged?: number;
  timeSavedHours?: number;
  networkEntries?: NetworkEntry[];
  auditEntries?: AuditEntry[];
  proofVerified?: boolean;
  chainIntegrity?: ChainIntegrityData;
  keySecurity?: KeySecurityData;
  onExportReceipt?: () => void;
  className?: string;
}
