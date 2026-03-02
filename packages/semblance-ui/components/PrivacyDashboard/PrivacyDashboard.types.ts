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

export interface PrivacyDashboardProps {
  dataSources?: number;
  cloudConnections?: number;
  actionsLogged?: number;
  timeSavedHours?: number;
  networkEntries?: NetworkEntry[];
  auditEntries?: AuditEntry[];
  proofVerified?: boolean;
  className?: string;
}
