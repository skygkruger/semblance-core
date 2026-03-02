export interface DataSource {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
}

export interface DataSourcesStepProps {
  /** Set of source IDs that are already connected */
  initialConnected?: Set<string>;
  /** Called when user clicks Continue */
  onContinue?: (connectedIds: string[]) => void;
  /** Called when user clicks Skip */
  onSkip?: () => void;
}
