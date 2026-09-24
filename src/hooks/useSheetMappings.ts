import { useContext } from 'react';
import { AppContext } from '@/context/AppContext';
import type { SheetMapping } from '@/utils/sheetTemplate';

export function useSheetMappings(spreadsheetId: string, baseWeek: number) {
  const ctx = useContext(AppContext);
  const keyFor = (programId: string) => `${spreadsheetId}:${programId}:${baseWeek}`;
  const read = (programId: string): SheetMapping | null => {
    const key = keyFor(programId);
    const saved = ctx?.state.sheetColumnMappings?.[key];
    if (saved) return saved;
    try { return JSON.parse(localStorage.getItem(`sheet-column:${key}`) ?? 'null'); } catch { return null; }
  };
  const save = (mappings: Record<string, SheetMapping>) => {
    const entries = Object.fromEntries(Object.entries(mappings).map(([id, mapping]) => [keyFor(id), mapping]));
    ctx?.dispatch({ type: 'SET_SHEET_MAPPINGS', payload: entries });
    for (const [key, value] of Object.entries(entries)) {
      try { localStorage.setItem(`sheet-column:${key}`, JSON.stringify(value)); } catch { /* Cloud state still retains the mapping. */ }
    }
  };
  return { read, save, saved: ctx?.state.sheetColumnMappings };
}
