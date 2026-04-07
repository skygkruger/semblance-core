export interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  streaming?: boolean;
  className?: string;
  onCopy?: () => void;
  onRegenerate?: () => void;
}
