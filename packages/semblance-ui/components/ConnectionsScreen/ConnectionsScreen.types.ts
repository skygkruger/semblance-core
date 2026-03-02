import type { ConnectorCardStatus } from '../ConnectorCard/ConnectorCard.types';

export type ConnectorCategory = 'native' | 'oauth' | 'manual';

export interface ConnectorEntry {
  id: string;
  displayName: string;
  description: string;
  status: ConnectorCardStatus;
  category: ConnectorCategory;
  isPremium: boolean;
  platform: 'all' | 'macos' | 'windows' | 'linux';
  userEmail?: string;
  lastSyncedAt?: string;
  iconType?: string;
}

export interface ConnectionsScreenProps {
  connectors: ConnectorEntry[];
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onSync: (id: string) => void;
}

export const SECTION_CONFIG: { key: ConnectorCategory; label: string }[] = [
  { key: 'native', label: 'NATIVE CONNECTIONS' },
  { key: 'oauth', label: 'CONNECTED SERVICES' },
  { key: 'manual', label: 'MANUAL IMPORTS' },
];
