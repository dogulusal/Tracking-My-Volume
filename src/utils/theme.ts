/**
 * Dark mode utility — manages theme without React state
 * Priority: localStorage > system preference > default dark
 */

import { initColorTheme, applyColorTheme, getStoredColorTheme } from './colorThemes';

const THEME_KEY = 'theme-preference';

// The browser's own bar (Android's status bar, Safari's tab bar) takes the
// page's ground; index.html only knows the dark one. Same values as
// --color-bg-primary in index.css.
function syncThemeColor(): void {
  const color = document.documentElement.classList.contains('dark') ? '#0b0b0c' : '#f3f4f5';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

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
  // Apply color theme after dark/light is set
  initColorTheme();
  syncThemeColor();
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
  // Re-apply color theme for the new light/dark mode
  applyColorTheme(getStoredColorTheme());
  syncThemeColor();
}

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}
