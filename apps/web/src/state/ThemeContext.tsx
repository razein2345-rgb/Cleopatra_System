import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'cp_theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * FEATURE-007 (2026-08-12, owner: "أخيرا الدارك مود واللايت") — the CSS
 * tokens for both themes already existed in `index.css` (`.dark` class
 * overrides + Tailwind's `dark:` variant already wired via
 * `@custom-variant dark (&:is(.dark *))`) but nothing ever toggled the
 * `.dark` class — this is the missing state/persistence layer. No
 * system-preference *tracking* after first load (only used once, as the
 * initial default) — an explicit toggle is a deliberate choice that should
 * stick regardless of the OS changing later, same as `cp_remember_me`'s
 * own explicit-choice-persists precedent.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
