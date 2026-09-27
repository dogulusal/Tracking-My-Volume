import { useCallback, useContext, useRef } from 'react';
import { AppContext } from '@/context/AppContext';
import { normalizeGoogleSettings } from '@/utils/googleSheetsSettings';
import type { GoogleSheetsPreferences } from '@/types';

const emptySettings = normalizeGoogleSettings(null);

/**
 * Which Google client and Sheet file the automatic sync uses. Kept in the
 * synced state, so every device of the account points at the same file.
 */
export function useGoogleSheets() {
  const context = useContext(AppContext);
  const dispatch = context?.dispatch;
  // Cloud accounts read only their own state; a previous browser user's local
  // preferences must never fill a new account's spreadsheet ID.
  const settings = context?.state.googleSheetsSettings ?? emptySettings;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const setSettings = useCallback((patch: Partial<GoogleSheetsPreferences>) => {
    const next = normalizeGoogleSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    dispatch?.({ type: 'SET_GOOGLE_SHEETS_SETTINGS', payload: next });
  }, [dispatch]);

  return { settings, setSettings };
}
