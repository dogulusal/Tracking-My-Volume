import { useState, useEffect, useCallback } from 'react';
import type { ExerciseStatus } from '@/types';

// History cell backgrounds per status. Nothing overrides them, so a cell's
// colour always means what the automatic Sheet tab shows for it.
export const DEFAULT_STATUS_BG_COLORS: Record<ExerciseStatus, { dark: string; light: string }> = {
  improved: { dark: '#064e3b', light: '#a7f3d0' },
  decreased: { dark: '#4c0519', light: '#fda4af' },
  same: { dark: '#1f2937', light: '#d1d5db' },
  holiday: { dark: '#78350f', light: '#fde68a' },
  removed: { dark: '#111827', light: '#e5e7eb' },
  // The reference week (H0, or an exercise's first record): blue, so it is not
  // mistaken for "same as last week".
  new: { dark: '#172554', light: '#93c5fd' },
};

export function useColorSettings() {
  // theme.ts flips a class on <html> without any React state, so reading the
  // DOM during render left these colours stale until something else caused a
  // re-render — toggling the theme on History did not recolour the grid.
  // Observing the attribute turns the theme into state the hook reacts to.
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => observer.disconnect();
  }, []);

  const getStatusBgColor = useCallback((status: ExerciseStatus): string => {
    const colors = DEFAULT_STATUS_BG_COLORS[status];
    return isDark ? colors.dark : colors.light;
  }, [isDark]);

  return { getStatusBgColor };
}
