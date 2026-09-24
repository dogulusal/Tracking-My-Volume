import { useState, useEffect, useCallback, useContext } from 'react';
import { AppContext } from '@/context/AppContext';
import type { ExerciseStatus } from '@/types';

// Per-cell color override key: "weekNumber_exerciseId"
export interface CellColorOverrides {
  [cellKey: string]: ExerciseStatus;
}

export function makeCellKey(weekNumber: number, exerciseId: string): string {
  return `${weekNumber}_${exerciseId}`;
}

// Default background colors for each status — the starting point users can
// override in History's ⚙️ panel.
export const DEFAULT_STATUS_BG_COLORS: Record<ExerciseStatus, { dark: string; light: string }> = {
  improved: { dark: '#064e3b', light: '#a7f3d0' },
  decreased: { dark: '#4c0519', light: '#fda4af' },
  same: { dark: '#1f2937', light: '#d1d5db' },
  holiday: { dark: '#78350f', light: '#fde68a' },
  removed: { dark: '#111827', light: '#e5e7eb' },
  new: { dark: '#1f2937', light: '#d1d5db' },
};

const STORAGE_KEY_CELLS = 'trackingVolume_cellColors';

export function useColorSettings() {
  const [cellOverrides, setCellOverrides] = useState<CellColorOverrides>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CELLS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CELLS, JSON.stringify(cellOverrides));
  }, [cellOverrides]);

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

  const ctx = useContext(AppContext);
  const statusColors = ctx?.state.statusColors;

  const getColorsFor = useCallback((status: ExerciseStatus) => {
    return statusColors?.[status] ?? DEFAULT_STATUS_BG_COLORS[status];
  }, [statusColors]);

  const getStatusBgColor = useCallback((status: ExerciseStatus): string => {
    const colors = getColorsFor(status);
    return isDark ? colors.dark : colors.light;
  }, [getColorsFor, isDark]);

  const setStatusBgColor = useCallback((status: ExerciseStatus, color: string) => {
    const current = getColorsFor(status);
    ctx?.dispatch({
      type: 'SET_STATUS_COLORS',
      payload: {
        ...statusColors,
        [status]: isDark ? { ...current, dark: color } : { ...current, light: color },
      },
    });
  }, [ctx, statusColors, getColorsFor, isDark]);

  const resetStatusColors = useCallback(() => {
    ctx?.dispatch({ type: 'SET_STATUS_COLORS', payload: {} });
  }, [ctx]);

  const hasCustomStatusColors = statusColors !== undefined && Object.keys(statusColors).length > 0;

  const getCellColor = useCallback((weekNumber: number, exerciseId: string, autoStatus: ExerciseStatus): string => {
    const key = makeCellKey(weekNumber, exerciseId);
    const override = cellOverrides[key];
    return getStatusBgColor(override ?? autoStatus);
  }, [cellOverrides, getStatusBgColor]);

  const setCellColor = useCallback((weekNumber: number, exerciseId: string, status: ExerciseStatus) => {
    const key = makeCellKey(weekNumber, exerciseId);
    setCellOverrides(prev => ({ ...prev, [key]: status }));
  }, []);

  const removeCellColor = useCallback((weekNumber: number, exerciseId: string) => {
    const key = makeCellKey(weekNumber, exerciseId);
    setCellOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const getCellOverride = useCallback((weekNumber: number, exerciseId: string): ExerciseStatus | undefined => {
    const key = makeCellKey(weekNumber, exerciseId);
    return cellOverrides[key];
  }, [cellOverrides]);

  const resetAllOverrides = useCallback(() => {
    setCellOverrides({});
    localStorage.removeItem(STORAGE_KEY_CELLS);
  }, []);

  return {
    cellOverrides,
    isDark,
    getStatusBgColor,
    setStatusBgColor,
    resetStatusColors,
    hasCustomStatusColors,
    getCellColor,
    setCellColor,
    removeCellColor,
    getCellOverride,
    resetAllOverrides,
  };
}

