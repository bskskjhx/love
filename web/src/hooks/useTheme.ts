import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readStored(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/**
 * Light/dark theme, defaulting to the OS setting until the user chooses.
 *
 * The same resolution runs in the inline script in index.html before first
 * paint; this hook takes over afterwards and is the only thing that writes the
 * preference back.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStored() ?? (prefersDark() ? 'dark' : 'light'));

  useEffect(() => {
    apply(theme);
  }, [theme]);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (readStored()) return;
      setTheme(event.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // A blocked storage backend must not take the theme down with it.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
