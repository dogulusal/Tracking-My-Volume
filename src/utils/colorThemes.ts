/**
 * Color theme system — allows users to pick an accent palette.
 * Stored in localStorage; applied via CSS custom properties on :root.
 */

export type ThemeColor = 'green' | 'blue' | 'amber' | 'cyan' | 'rose' | 'purple';

export interface ColorPalette {
  id: ThemeColor;
  name: string;
  accent: string;
  accentHover: string;
  accentGlow: string;
  textMuted: string;
  // Dark mode backgrounds
  bgPrimary: string;
  bgCard: string;
  bgInput: string;
  border: string;
  btnBg: string;
  btnHover: string;
  // Light mode overrides
  light: {
    bgPrimary: string;
    bgCard: string;
    bgInput: string;
    textMuted: string;
    border: string;
    btnBg: string;
    btnHover: string;
    accentGlow: string;
  };
}

export const COLOR_PALETTES: Record<ThemeColor, ColorPalette> = {
  green: {
    id: 'green',
    name: 'Neon Yeşil',
    accent: '#10b981',
    accentHover: '#059669',
    accentGlow: '#10b98133',
    textMuted: '#6ee7b7',
    bgPrimary: '#050a0a',
    bgCard: '#0a1412',
    bgInput: '#0f1f1a',
    border: '#10b98126',
    btnBg: '#10b98119',
    btnHover: '#10b98133',
    light: {
      bgPrimary: '#f0fdf4',
      bgCard: '#ffffff',
      bgInput: '#ecfdf5',
      textMuted: '#059669',
      border: '#d1fae5',
      btnBg: '#d1fae5',
      btnHover: '#a7f3d0',
      accentGlow: '#10b98119',
    },
  },
  blue: {
    id: 'blue',
    name: 'Electric Blue',
    accent: '#6366f1',
    accentHover: '#4f46e5',
    accentGlow: '#6366f133',
    textMuted: '#a5b4fc',
    bgPrimary: '#050810',
    bgCard: '#0a0d1a',
    bgInput: '#0f1328',
    border: '#6366f126',
    btnBg: '#6366f119',
    btnHover: '#6366f133',
    light: {
      bgPrimary: '#eef2ff',
      bgCard: '#ffffff',
      bgInput: '#e0e7ff',
      textMuted: '#4f46e5',
      border: '#c7d2fe',
      btnBg: '#e0e7ff',
      btnHover: '#c7d2fe',
      accentGlow: '#6366f119',
    },
  },
  amber: {
    id: 'amber',
    name: 'Warm Amber',
    accent: '#f59e0b',
    accentHover: '#d97706',
    accentGlow: '#f59e0b33',
    textMuted: '#fcd34d',
    bgPrimary: '#0a0806',
    bgCard: '#1a1408',
    bgInput: '#1f1a0f',
    border: '#f59e0b26',
    btnBg: '#f59e0b19',
    btnHover: '#f59e0b33',
    light: {
      bgPrimary: '#fffbeb',
      bgCard: '#ffffff',
      bgInput: '#fef3c7',
      textMuted: '#d97706',
      border: '#fde68a',
      btnBg: '#fef3c7',
      btnHover: '#fde68a',
      accentGlow: '#f59e0b19',
    },
  },
  cyan: {
    id: 'cyan',
    name: 'Ice Cyan',
    accent: '#06b6d4',
    accentHover: '#0891b2',
    accentGlow: '#06b6d433',
    textMuted: '#67e8f9',
    bgPrimary: '#04080a',
    bgCard: '#0a1416',
    bgInput: '#0f1a1e',
    border: '#06b6d426',
    btnBg: '#06b6d419',
    btnHover: '#06b6d433',
    light: {
      bgPrimary: '#ecfeff',
      bgCard: '#ffffff',
      bgInput: '#cffafe',
      textMuted: '#0891b2',
      border: '#a5f3fc',
      btnBg: '#cffafe',
      btnHover: '#a5f3fc',
      accentGlow: '#06b6d419',
    },
  },
  rose: {
    id: 'rose',
    name: 'Neon Rose',
    accent: '#f43f5e',
    accentHover: '#e11d48',
    accentGlow: '#f43f5e33',
    textMuted: '#fda4af',
    bgPrimary: '#0a0508',
    bgCard: '#1a0a10',
    bgInput: '#1f0f16',
    border: '#f43f5e26',
    btnBg: '#f43f5e19',
    btnHover: '#f43f5e33',
    light: {
      bgPrimary: '#fff1f2',
      bgCard: '#ffffff',
      bgInput: '#ffe4e6',
      textMuted: '#e11d48',
      border: '#fecdd3',
      btnBg: '#ffe4e6',
      btnHover: '#fecdd3',
      accentGlow: '#f43f5e19',
    },
  },
  purple: {
    id: 'purple',
    name: 'Royal Purple',
    accent: '#a855f7',
    accentHover: '#9333ea',
    accentGlow: '#a855f733',
    textMuted: '#d8b4fe',
    bgPrimary: '#08050a',
    bgCard: '#140a1f',
    bgInput: '#1a0f26',
    border: '#a855f726',
    btnBg: '#a855f719',
    btnHover: '#a855f733',
    light: {
      bgPrimary: '#faf5ff',
      bgCard: '#ffffff',
      bgInput: '#f3e8ff',
      textMuted: '#9333ea',
      border: '#e9d5ff',
      btnBg: '#f3e8ff',
      btnHover: '#e9d5ff',
      accentGlow: '#a855f719',
    },
  },
};

const COLOR_THEME_KEY = 'color-theme';

export function getStoredColorTheme(): ThemeColor {
  const stored = localStorage.getItem(COLOR_THEME_KEY);
  if (stored && stored in COLOR_PALETTES) return stored as ThemeColor;
  return 'green';
}

export function setStoredColorTheme(theme: ThemeColor): void {
  localStorage.setItem(COLOR_THEME_KEY, theme);
}

export function applyColorTheme(theme: ThemeColor): void {
  const palette = COLOR_PALETTES[theme];
  const root = document.documentElement;
  const isDark = root.classList.contains('dark');

  root.style.setProperty('--color-accent', palette.accent);
  root.style.setProperty('--color-accent-hover', palette.accentHover);
  root.style.setProperty('--color-accent-glow', palette.accentGlow);

  if (isDark) {
    root.style.setProperty('--color-text-muted', palette.textMuted);
    root.style.setProperty('--color-bg-primary', palette.bgPrimary);
    root.style.setProperty('--color-bg-card', palette.bgCard);
    root.style.setProperty('--color-bg-input', palette.bgInput);
    root.style.setProperty('--color-border', palette.border);
    root.style.setProperty('--color-btn-bg', palette.btnBg);
    root.style.setProperty('--color-btn-hover', palette.btnHover);
  } else {
    root.style.setProperty('--color-text-muted', palette.light.textMuted);
    root.style.setProperty('--color-bg-primary', palette.light.bgPrimary);
    root.style.setProperty('--color-bg-card', palette.light.bgCard);
    root.style.setProperty('--color-bg-input', palette.light.bgInput);
    root.style.setProperty('--color-border', palette.light.border);
    root.style.setProperty('--color-btn-bg', palette.light.btnBg);
    root.style.setProperty('--color-btn-hover', palette.light.btnHover);
    root.style.setProperty('--color-accent-glow', palette.light.accentGlow);
  }
}

export function initColorTheme(): void {
  const theme = getStoredColorTheme();
  applyColorTheme(theme);
}
