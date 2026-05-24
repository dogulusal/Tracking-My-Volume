import { useContext, useState, useEffect } from 'react';
import { AppContext } from '@/context/AppContext';
import type { AppState, ExportData } from '@/types';
import { parseTabularText, convertParsedToProgram, parseHtmlTable } from '@/utils/textImportParser';
import { generatePdfImportData } from '@/data/pdfImportData';

type BackupMode = 'notify' | 'download';

interface BackupSettings {
  enabled: boolean;
  mode: BackupMode;
}

interface BackupMeta {
  lastBackupAt: string | null;
  lastBackupWeek: number | null;
  pendingBackupWeek: number | null;
}

const BACKUP_SETTINGS_KEY = 'trackingVolume_backupSettings';
const BACKUP_META_KEY = 'trackingVolume_backupMeta';

const defaultBackupSettings: BackupSettings = {
  enabled: true,
  mode: 'notify',
};

const defaultBackupMeta: BackupMeta = {
  lastBackupAt: null,
  lastBackupWeek: null,
  pendingBackupWeek: null,
};

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

  const [backupSettings, setBackupSettingsState] = useState<BackupSettings>(() => {
    try {
      const saved = localStorage.getItem(BACKUP_SETTINGS_KEY);
      if (!saved) return defaultBackupSettings;
      const parsed = JSON.parse(saved) as Partial<BackupSettings>;
      return {
        enabled: parsed.enabled ?? defaultBackupSettings.enabled,
        mode: parsed.mode === 'download' ? 'download' : 'notify',
      };
    } catch {
      return defaultBackupSettings;
    }
  });

  const [backupMeta, setBackupMeta] = useState<BackupMeta>(() => {
    try {
      const saved = localStorage.getItem(BACKUP_META_KEY);
      if (!saved) return defaultBackupMeta;
      const parsed = JSON.parse(saved) as Partial<BackupMeta>;
      return {
        lastBackupAt: typeof parsed.lastBackupAt === 'string' ? parsed.lastBackupAt : null,
        lastBackupWeek: typeof parsed.lastBackupWeek === 'number' ? parsed.lastBackupWeek : null,
        pendingBackupWeek: typeof parsed.pendingBackupWeek === 'number' ? parsed.pendingBackupWeek : null,
      };
    } catch {
      return defaultBackupMeta;
    }
  });

  useEffect(() => {
    localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(backupSettings));
  }, [backupSettings]);

  useEffect(() => {
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify(backupMeta));
  }, [backupMeta]);

  const setBackupSettings = (patch: Partial<BackupSettings>) => {
    setBackupSettingsState(prev => ({ ...prev, ...patch }));
  };

  const buildExportData = (overrideWeekLogs?: AppState['weekLogs']): ExportData => ({
    exportDate: new Date().toISOString().split('T')[0],
    version: '2.0',
    programs: state.programs,
    plans: state.plans,
    activePlanId: state.activePlanId,
    weekLogs: overrideWeekLogs ?? state.weekLogs,
    currentWeek: state.currentWeek,
    phases: state.phases,
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

  const markBackupCompleted = (weekNumber: number | null) => {
    setBackupMeta(prev => ({
      ...prev,
      lastBackupAt: new Date().toISOString(),
      lastBackupWeek: weekNumber,
      pendingBackupWeek: null,
    }));
  };

  const quickBackup = (reason: string = 'manual') => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const exportData = buildExportData();
    const safeReason = reason.replace(/[^a-zA-Z0-9-_]/g, '_');
    downloadExport(exportData, `antrenman-backup-${safeReason}-${stamp}.json`);
    markBackupCompleted(state.currentWeek);
  };

  const createSafetyBackup = (reason: string) => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const exportData = buildExportData();
    const safeReason = reason.replace(/[^a-zA-Z0-9-_]/g, '_');
    downloadExport(exportData, `antrenman-safety-${safeReason}-${stamp}.json`);
    markBackupCompleted(state.currentWeek);
  };

  const handleWeekTransitionBackup = (finishedWeek: number) => {
    if (!backupSettings.enabled) return;
    if (backupMeta.lastBackupWeek === finishedWeek) return;

    if (backupSettings.mode === 'download') {
      quickBackup(`week-${finishedWeek}`);
      return;
    }

    setBackupMeta(prev => ({
      ...prev,
      pendingBackupWeek: finishedWeek,
    }));
  };

  return {
    backupSettings,
    backupMeta,
    setBackupSettings,
    quickBackup,
    createSafetyBackup,
    handleWeekTransitionBackup,
    exportAll: () => {
      const exportData = buildExportData();
      downloadExport(exportData, `antrenman-export-${exportData.exportDate}.json`);
      markBackupCompleted(state.currentWeek);
    },

    exportRange: (fromWeek: number, toWeek: number) => {
      const filteredLogs = state.weekLogs.filter(
        w => w.weekNumber >= fromWeek && w.weekNumber <= toWeek
      );
      const exportData = buildExportData(filteredLogs);
      downloadExport(exportData, `antrenman-export-H${fromWeek}-H${toWeek}.json`);
    },

    importData: (jsonString: string): { success: boolean; error?: string } => {
      try {
        createSafetyBackup('before-import-json');
        const parsed = JSON.parse(jsonString);
        // Support both direct AppState and ExportData format
        const data = parsed.version ? {
          programs: parsed.programs,
          plans: parsed.plans ?? [],
          activePlanId: parsed.activePlanId ?? null,
          weekLogs: parsed.weekLogs,
          currentWeek: parsed.currentWeek,
        } : parsed;

        if (!validateImportData(data)) {
          return { success: false, error: 'Geçersiz veri formatı' };
        }
        dispatch({ type: 'IMPORT_DATA', payload: data as AppState });
        return { success: true };
      } catch {
        return { success: false, error: 'JSON parse hatası' };
      }
    },

    resetAll: () => {
      createSafetyBackup('before-reset');
      dispatch({ type: 'RESET_DATA' });
    },

    // Import from text/CSV/TSV spreadsheet format
    importFromText: (text: string, programName: string, startWeek?: number): { success: boolean; error?: string } => {
      try {
        createSafetyBackup('before-import-text');
        // Check if it's HTML (pasted from Excel/Google Sheets)
        const textToParse = text.includes('<table') || text.includes('<tr')
          ? parseHtmlTable(text)
          : text;

        const parsed = parseTabularText(textToParse);
        if (parsed.rows.length === 0) {
          return { success: false, error: 'Tablo verisi bulunamadı. Format: Egzersiz | Set | H0 | H1 | ...' };
        }

        const { program, weekLogs } = convertParsedToProgram(
          programName,
          parsed,
          startWeek ?? state.currentWeek
        );

        // Add program and week logs to existing data
        const newState: AppState = {
          programs: [...state.programs, program],
          plans: state.plans,
          activePlanId: state.activePlanId,
          weekLogs: [...state.weekLogs, ...weekLogs],
          currentWeek: Math.max(state.currentWeek, ...weekLogs.map(w => w.weekNumber)),
          phases: state.phases,
        };
        dispatch({ type: 'IMPORT_DATA', payload: newState });
        return { success: true };
      } catch (e) {
        return { success: false, error: `Parse hatası: ${e instanceof Error ? e.message : 'Bilinmeyen hata'}` };
      }
    },

    // Load pre-parsed PDF data as starting point
    importPdfData: (): { success: boolean; error?: string } => {
      try {
        createSafetyBackup('before-import-pdf');
        const data = generatePdfImportData();
        const now = new Date().toISOString();
        const defaultPlan = {
          id: crypto.randomUUID(),
          name: 'Varsayilan Plan',
          programIds: data.programs.map(p => p.id),
          createdAt: now,
          updatedAt: now,
        };
        dispatch({
          type: 'IMPORT_DATA',
          payload: {
            ...data,
            plans: [defaultPlan],
            activePlanId: defaultPlan.id,
            phases: state.phases,
          },
        });
        return { success: true };
      } catch (e) {
        return { success: false, error: `PDF veri yükleme hatası: ${e instanceof Error ? e.message : 'Bilinmeyen hata'}` };
      }
    },
  };
}
