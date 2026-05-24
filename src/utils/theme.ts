/**
 * Dark mode utility — manages theme without React state
 * Priority: localStorage > system preference > default dark
 */

const THEME_KEY = 'theme-preference';

export function initTheme(): void {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') {
    document.documentElement.classList.remove('dark');
  } else if (saved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    // No saved preference — check system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      document.documentElement.classList.add('dark');
    } else {
      // Default: dark
      document.documentElement.classList.add('dark');
    }
  }
}

export function toggleTheme(): void {
  const isDark = document.documentElement.classList.contains('dark');
  if (isDark) {
    document.documentElement.classList.remove('dark');
    localStorage.setItem(THEME_KEY, 'light');
  } else {
    document.documentElement.classList.add('dark');
    localStorage.setItem(THEME_KEY, 'dark');
  }
}

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}
