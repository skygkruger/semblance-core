export type ActionStatus = 'completed' | 'pending' | 'failed' | 'undone';

export interface ActionLogItemProps {
  status: ActionStatus;
  text: string;
  domain?: string;
  timestamp?: string;
  onUndo?: () => void;
  className?: string;
}
