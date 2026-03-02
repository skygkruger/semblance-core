export type BriefingItemType = 'action' | 'pending' | 'insight';

export interface BriefingItem {
  type: BriefingItemType;
  text: string;
}

export interface BriefingCardProps {
  title?: string;
  timestamp?: string;
  items: BriefingItem[];
  userName?: string;
  isFoundingMember?: boolean;
  foundingSeat?: number;
  className?: string;
}

export const DOT_COLORS: Record<BriefingItemType, string> = {
  action:  '#6ECFA3',
  pending: '#C9A85C',
  insight: '#8593A4',
};

export function formatBriefDate(): string {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
}

export function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  let period = 'Good morning';
  if (hour >= 12 && hour < 17) period = 'Good afternoon';
  else if (hour >= 17) period = 'Good evening';

  if (name) return `${period}, ${name}.`;
  return `${period}.`;
}
