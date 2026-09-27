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
  // The reference week (H0, or an exercise's first record): blue, so it is not
  // mistaken for "same as last week".
  new: { dark: '#172554', light: '#93c5fd' },
};

const STORAGE_KEY_CELLS = 'trackingVolume_cellColors';
const EMPTY_OVERRIDES: CellColorOverrides = {};

export function useColorSettings() {
  const ctx = useContext(AppContext);
  const dispatch = ctx?.dispatch;
  const cellOverrides: CellColorOverrides = ctx?.state.cellColorOverrides ?? EMPTY_OVERRIDES;

  // Overrides used to live only in this browser, so other devices and backups
  // never saw them. Fold any left here into the synced state once.
  useEffect(() => {
    let local: CellColorOverrides = {};
    try {
      local = JSON.parse(localStorage.getItem(STORAGE_KEY_CELLS) ?? '{}') as CellColorOverrides;
    } catch { /* unreadable: nothing to carry over */ }
    localStorage.removeItem(STORAGE_KEY_CELLS);
    const missing = Object.fromEntries(Object.entries(local).filter(([key]) => !(key in cellOverrides)));
    if (Object.keys(missing).length) dispatch?.({ type: 'UPDATE_CELL_COLORS', payload: missing });
    // Once per mount; later changes go through dispatch.
  }, []);

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
    dispatch?.({ type: 'UPDATE_CELL_COLORS', payload: { [makeCellKey(weekNumber, exerciseId)]: status } });
  }, [dispatch]);

  const removeCellColor = useCallback((weekNumber: number, exerciseId: string) => {
    dispatch?.({ type: 'UPDATE_CELL_COLORS', payload: { [makeCellKey(weekNumber, exerciseId)]: null } });
  }, [dispatch]);

  const getCellOverride = useCallback((weekNumber: number, exerciseId: string): ExerciseStatus | undefined => {
    const key = makeCellKey(weekNumber, exerciseId);
    return cellOverrides[key];
  }, [cellOverrides]);

  const resetAllOverrides = useCallback(() => {
    dispatch?.({ type: 'UPDATE_CELL_COLORS', payload: null });
  }, [dispatch]);

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

