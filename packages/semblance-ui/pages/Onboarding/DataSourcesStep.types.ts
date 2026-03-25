export interface DataSource {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  /** Connector ID for OAuth flow (null if not OAuth-capable) */
  connectorId?: string | null;
}

export type DataSourceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DataSourcesStepProps {
  /** Set of source IDs that are already connected */
  initialConnected?: Set<string>;
  /** Status per source ID (for real OAuth flows) */
  sourceStatuses?: Record<string, DataSourceStatus>;
  /** Called when user clicks Connect on an OAuth-capable source */
  onConnectSource?: (sourceId: string, connectorId: string) => void;
  /** Called when user clicks Continue */
  onContinue?: (connectedIds: string[]) => void;
  /** Called when user clicks Skip */
  onSkip?: () => void;
  /** Called to go back to previous step */
  onBack?: () => void;
}
