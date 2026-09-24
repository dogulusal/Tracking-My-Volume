import { DEFAULT_GOOGLE_CLIENT_ID, DEFAULT_SPREADSHEET_ID } from '@/config';
import type { GoogleSheetsPreferences } from '@/types';

/** Explicit allow-list keeps tokens out of local preferences and cloud backups. */
export function normalizeGoogleSettings(value: unknown): GoogleSheetsPreferences {
  const input = value && typeof value === 'object' ? value as Partial<GoogleSheetsPreferences> : {};
  const rawId = typeof input.spreadsheetId === 'string' ? input.spreadsheetId.trim() : '';
  const spreadsheetId = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(rawId)?.[1] ?? rawId;
  return {
    clientId: typeof input.clientId === 'string' && input.clientId.trim() ? input.clientId.trim() : DEFAULT_GOOGLE_CLIENT_ID,
    spreadsheetId: spreadsheetId || DEFAULT_SPREADSHEET_ID,
    tabByProgramId: Object.fromEntries(Object.entries(input.tabByProgramId ?? {}).filter(([, tab]) => typeof tab === 'string')),
  };
}
