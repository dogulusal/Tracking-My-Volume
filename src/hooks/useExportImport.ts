import { applyMigrations, CURRENT_DATA_VERSION } from '@/data/migrations';
import { useContext } from 'react';
import { AppContext } from '@/context/AppContext';
import type { AppState, ExportData } from '@/types';

function validateImportData(data: unknown): data is AppState {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.programs)) return false;
  if (!Array.isArray(d.weekLogs)) return false;
  if (typeof d.currentWeek !== 'number') return false;
  return true;
}

export function useExportImport() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useExportImport must be used within AppProvider');
  const { state, dispatch } = ctx;

  const buildExportData = (): ExportData => ({
    exportDate: new Date().toISOString().split('T')[0],
    version: '3.0',
    dataVersion: CURRENT_DATA_VERSION,
    programs: state.programs,
    plans: state.plans,
    activePlanId: state.activePlanId,
    weekLogs: state.weekLogs,
    currentWeek: state.currentWeek,
    phases: state.phases,
    googleSheetsSettings: state.googleSheetsSettings,
    sheetColumnMappings: state.sheetColumnMappings,
    programVersions: state.programVersions,
    phaseRecordTransitions: state.phaseRecordTransitions,
    exerciseRowOrder: state.exerciseRowOrder,
    muscleGroups: state.muscleGroups,
    exerciseSettings: state.exerciseSettings,
    hideRemovedExercises: state.hideRemovedExercises,
    statusColors: state.statusColors,
    cellColorOverrides: state.cellColorOverrides,
    appliedCoachUpdates: state.appliedCoachUpdates,
    bodyMeasurements: state.bodyMeasurements,
    bodyGoals: state.bodyGoals,
    plates: state.plates,
  });

  const downloadExport = (exportData: ExportData, filename: string) => {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Anything that replaces all data first saves what is there now.
  const createSafetyBackup = (reason: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadExport(buildExportData(), `antrenman-safety-${reason}-${stamp}.json`);
  };

  return {
    exportAll: () => {
      const exportData = buildExportData();
      downloadExport(exportData, `antrenman-export-${exportData.exportDate}.json`);
    },

    importData: (jsonString: string): { success: boolean; error?: string } => {
      try {
        createSafetyBackup('before-import-json');
        const parsed = JSON.parse(jsonString);
        // Support both direct AppState and ExportData format
        const data = parsed.version ? {
          ...parsed,
          programs: parsed.programs,
          plans: parsed.plans ?? [],
          activePlanId: parsed.activePlanId ?? null,
          weekLogs: parsed.weekLogs,
          currentWeek: parsed.currentWeek,
        } : parsed;

        if (!validateImportData(data)) {
          return { success: false, error: 'Geçersiz veri formatı' };
        }
        dispatch({ type: 'IMPORT_DATA', payload: applyMigrations(data as AppState) });
        return { success: true };
      } catch {
        return { success: false, error: 'JSON parse hatası' };
      }
    },

    /** Replace everything with a cloud copy, after saving what is there now. */
    restoreState: (data: unknown): { success: boolean; error?: string } => {
      if (!validateImportData(data)) return { success: false, error: 'Kopya okunamadı' };
      createSafetyBackup('before-restore');
      dispatch({ type: 'IMPORT_DATA', payload: applyMigrations(data as AppState) });
      return { success: true };
    },

    resetAll: () => {
      createSafetyBackup('before-reset');
      dispatch({ type: 'RESET_DATA' });
    },
  };
}
