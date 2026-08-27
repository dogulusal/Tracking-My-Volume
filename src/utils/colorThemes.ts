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
    textMuted: '#858d95',
    bgPrimary: '#0b0d0f',
    bgCard: '#16191d',
    bgInput: '#1c2025',
    border: '#232830',
    btnBg: '#ffffff0f',
    btnHover: '#ffffff1a',
    light: {
      bgPrimary: '#eef0f2',
      bgCard: '#ffffff',
      bgInput: '#f4f6f7',
      textMuted: '#5f666d',
      border: '#dfe4e8',
      btnBg: '#00000008',
      btnHover: '#00000012',
      accentGlow: '#10b98119',
    },
  },
  blue: {
    id: 'blue',
    name: 'Electric Blue',
    accent: '#6366f1',
    accentHover: '#4f46e5',
    accentGlow: '#6366f133',
    textMuted: '#858d95',
    bgPrimary: '#0b0d0f',
    bgCard: '#16191d',
    bgInput: '#1c2025',
    border: '#232830',
    btnBg: '#ffffff0f',
    btnHover: '#ffffff1a',
    light: {
      bgPrimary: '#eef0f2',
      bgCard: '#ffffff',
      bgInput: '#f4f6f7',
      textMuted: '#5f666d',
      border: '#dfe4e8',
      btnBg: '#00000008',
      btnHover: '#00000012',
      accentGlow: '#6366f119',
    },
  },
  amber: {
    id: 'amber',
    name: 'Warm Amber',
    accent: '#f59e0b',
    accentHover: '#d97706',
    accentGlow: '#f59e0b33',
    textMuted: '#858d95',
    bgPrimary: '#0b0d0f',
    bgCard: '#16191d',
    bgInput: '#1c2025',
    border: '#232830',
    btnBg: '#ffffff0f',
    btnHover: '#ffffff1a',
    light: {
      bgPrimary: '#eef0f2',
      bgCard: '#ffffff',
      bgInput: '#f4f6f7',
      textMuted: '#5f666d',
      border: '#dfe4e8',
      btnBg: '#00000008',
      btnHover: '#00000012',
      accentGlow: '#f59e0b19',
    },
  },
  cyan: {
    id: 'cyan',
    name: 'Ice Cyan',
    accent: '#06b6d4',
    accentHover: '#0891b2',
    accentGlow: '#06b6d433',
    textMuted: '#858d95',
    bgPrimary: '#0b0d0f',
    bgCard: '#16191d',
    bgInput: '#1c2025',
    border: '#232830',
    btnBg: '#ffffff0f',
    btnHover: '#ffffff1a',
    light: {
      bgPrimary: '#eef0f2',
      bgCard: '#ffffff',
      bgInput: '#f4f6f7',
      textMuted: '#5f666d',
      border: '#dfe4e8',
      btnBg: '#00000008',
      btnHover: '#00000012',
      accentGlow: '#06b6d419',
    },
  },
  rose: {
    id: 'rose',
    name: 'Neon Rose',
    accent: '#f43f5e',
    accentHover: '#e11d48',
    accentGlow: '#f43f5e33',
    textMuted: '#858d95',
    bgPrimary: '#0b0d0f',
    bgCard: '#16191d',
    bgInput: '#1c2025',
    border: '#232830',
    btnBg: '#ffffff0f',
    btnHover: '#ffffff1a',
    light: {
      bgPrimary: '#eef0f2',
      bgCard: '#ffffff',
      bgInput: '#f4f6f7',
      textMuted: '#5f666d',
      border: '#dfe4e8',
      btnBg: '#00000008',
      btnHover: '#00000012',
      accentGlow: '#f43f5e19',
    },
  },
  purple: {
    id: 'purple',
    name: 'Royal Purple',
    accent: '#a855f7',
    accentHover: '#9333ea',
    accentGlow: '#a855f733',
    textMuted: '#858d95',
    bgPrimary: '#0b0d0f',
    bgCard: '#16191d',
    bgInput: '#1c2025',
    border: '#232830',
    btnBg: '#ffffff0f',
    btnHover: '#ffffff1a',
    light: {
      bgPrimary: '#eef0f2',
      bgCard: '#ffffff',
      bgInput: '#f4f6f7',
      textMuted: '#5f666d',
      border: '#dfe4e8',
      btnBg: '#00000008',
      btnHover: '#00000012',
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
