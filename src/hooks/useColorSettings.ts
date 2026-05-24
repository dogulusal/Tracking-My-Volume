import { useState, useEffect, useCallback } from 'react';
import type { ExerciseStatus } from '@/types';

// Per-cell color override key: "weekNumber_exerciseId"
export interface CellColorOverrides {
  [cellKey: string]: ExerciseStatus;
}

export function makeCellKey(weekNumber: number, exerciseId: string): string {
  return `${weekNumber}_${exerciseId}`;
}

// Default background colors for each status
const STATUS_BG_COLORS: Record<ExerciseStatus, { dark: string; light: string }> = {
  improved: { dark: '#064e3b', light: '#a7f3d0' },
  decreased: { dark: '#4c0519', light: '#fda4af' },
  same: { dark: '#1f2937', light: '#d1d5db' },
  holiday: { dark: '#78350f', light: '#fde68a' },
  removed: { dark: '#111827', light: '#e5e7eb' },
  new: { dark: '#172554', light: '#93c5fd' },
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

  const isDark = (): boolean => document.documentElement.classList.contains('dark');

  const getStatusBgColor = useCallback((status: ExerciseStatus): string => {
    const colors = STATUS_BG_COLORS[status];
    return isDark() ? colors.dark : colors.light;
  }, []);

  const getCellColor = useCallback((weekNumber: number, exerciseId: string, autoStatus: ExerciseStatus): string => {
    const key = makeCellKey(weekNumber, exerciseId);
    const override = cellOverrides[key];
    if (override) {
      const colors = STATUS_BG_COLORS[override];
      return isDark() ? colors.dark : colors.light;
    }
    return getStatusBgColor(autoStatus);
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
    getStatusBgColor,
    getCellColor,
    setCellColor,
    removeCellColor,
    getCellOverride,
    resetAllOverrides,
  };
}

