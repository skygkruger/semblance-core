export interface VariantMessages {
  message: string;
  sub: string | null;
}

export const DEFAULT_MESSAGES: Record<string, VariantMessages> = {
  inference: { message: 'On it.', sub: 'Your AI is thinking' },
  indexing: { message: 'Building your knowledge', sub: 'This takes a moment the first time' },
  briefing: { message: 'Preparing your brief', sub: 'Pulling together everything relevant' },
  generic: { message: 'Working...', sub: null },
};

export interface SkeletonCardProps {
  variant?: 'inference' | 'indexing' | 'briefing' | 'generic';
  message?: string;
  subMessage?: string;
  showSpinner?: boolean;
  height?: number | string;
}
