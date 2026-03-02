export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeToggleProps {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  className?: string;
}
