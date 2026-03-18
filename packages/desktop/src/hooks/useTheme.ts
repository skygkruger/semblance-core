import { useCallback, useEffect, useState } from 'react';
import { prefGet, prefSet } from '../ipc/commands';

type ThemeMode = 'light' | 'dark' | 'system';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === 'system' ? getSystemTheme() : mode;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>('system');

  // Hydrate theme from SQLite prefs on mount
  useEffect(() => {
    let cancelled = false;
    prefGet('semblance-theme').then((stored) => {
      if (!cancelled && stored) {
        const mode = stored as ThemeMode;
        setThemeState(mode);
        applyTheme(mode);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    prefSet('semblance-theme', mode).catch(() => {});
    applyTheme(mode);
  }, []);

  useEffect(() => {
    applyTheme(theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  return { theme, setTheme };
}
