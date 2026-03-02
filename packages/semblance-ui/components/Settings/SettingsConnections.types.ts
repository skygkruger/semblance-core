export interface ConnectionEntry {
  id: string;
  name: string;
  category: string;
  categoryColor: string;
  isConnected: boolean;
  lastSync: string | null;
  entityCount: number;
}

export interface SettingsConnectionsProps {
  connections: ConnectionEntry[];
  onManageAll: () => void;
  onConnectionTap: (id: string) => void;
  onBack: () => void;
}
