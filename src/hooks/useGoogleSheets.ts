import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addTabs,
  extractSpreadsheetId,
  getSpreadsheetMeta,
  requestAccessToken,
  revokeAccessToken,
  writeTab,
  type AccessToken,
  type SpreadsheetMeta,
} from '@/lib/googleSheets';

export interface GoogleSheetsSettings {
  /** OAuth client id from the user's own Google Cloud project. */
  clientId: string;
  spreadsheetId: string;
}

const SETTINGS_KEY = 'trackingVolume_googleSheets';
const LAST_PUSH_KEY = 'trackingVolume_googleSheetsLastPush';

/** Refresh a little early so a long write cannot start on a dying token. */
const TOKEN_SAFETY_MS = 60_000;

const emptySettings: GoogleSheetsSettings = { clientId: '', spreadsheetId: '' };

function readSettings(): GoogleSheetsSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return emptySettings;
    const parsed = JSON.parse(saved) as Partial<GoogleSheetsSettings>;
    return {
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
      spreadsheetId: typeof parsed.spreadsheetId === 'string' ? parsed.spreadsheetId : '',
    };
  } catch {
    return emptySettings;
  }
}

export interface SheetTarget {
  tab: string;
  values: string[][];
}

export type PushResult =
  | { status: 'done'; updatedCells: number; tabs: string[] }
  | { status: 'needs-tabs'; missingTabs: string[] }
  | { status: 'error'; message: string };

export function useGoogleSheets() {
  const [settings, setSettingsState] = useState<GoogleSheetsSettings>(readSettings);
  const [meta, setMeta] = useState<SpreadsheetMeta | null>(null);
  const [busy, setBusy] = useState<'idle' | 'connecting' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastPushAt, setLastPushAt] = useState<string | null>(
    () => localStorage.getItem(LAST_PUSH_KEY),
  );

  // In memory on purpose: the token expires within the hour anyway, and
  // keeping it out of storage keeps it out of anything that reads storage.
  const tokenRef = useRef<AccessToken | null>(null);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const setSettings = useCallback((patch: Partial<GoogleSheetsSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch };
      if (patch.spreadsheetId !== undefined) {
        next.spreadsheetId = extractSpreadsheetId(patch.spreadsheetId);
      }
      // Pointing at a different sheet or project invalidates what we know.
      if (patch.clientId !== undefined || patch.spreadsheetId !== undefined) {
        setMeta(null);
        tokenRef.current = null;
      }
      return next;
    });
  }, []);

  const isConfigured = Boolean(settings.clientId && settings.spreadsheetId);

  /** A usable token, asking Google silently first so the common path is quiet. */
  const ensureToken = useCallback(async (): Promise<string> => {
    const current = tokenRef.current;
    if (current && current.expiresAt - TOKEN_SAFETY_MS > Date.now()) return current.value;

    try {
      const silent = await requestAccessToken(settings.clientId, true);
      tokenRef.current = silent;
      return silent.value;
    } catch {
      // No existing grant (or it was revoked) — fall back to asking properly.
      const consented = await requestAccessToken(settings.clientId, false);
      tokenRef.current = consented;
      return consented.value;
    }
  }, [settings.clientId]);

  const connect = useCallback(async (): Promise<SpreadsheetMeta | null> => {
    if (!isConfigured) {
      setError('Önce OAuth istemci kimliği ve sheet adresini gir.');
      return null;
    }
    setBusy('connecting');
    setError(null);
    try {
      const token = await ensureToken();
      const info = await getSpreadsheetMeta(token, settings.spreadsheetId);
      setMeta(info);
      return info;
    } catch (e) {
      setMeta(null);
      setError(e instanceof Error ? e.message : 'Bağlanılamadı.');
      return null;
    } finally {
      setBusy('idle');
    }
  }, [ensureToken, isConfigured, settings.spreadsheetId]);

  const disconnect = useCallback(() => {
    if (tokenRef.current) revokeAccessToken(tokenRef.current.value);
    tokenRef.current = null;
    setMeta(null);
    setError(null);
  }, []);

  /**
   * Writes one tab per program. Missing tabs are reported back rather than
   * created silently: creating tabs in someone's spreadsheet is not a decision
   * this button gets to make on its own.
   */
  const push = useCallback(async (
    targets: SheetTarget[],
    options: { createMissing?: boolean } = {},
  ): Promise<PushResult> => {
    if (!isConfigured) return { status: 'error', message: 'Ayarlar eksik.' };
    if (targets.length === 0) return { status: 'error', message: 'Gönderilecek veri yok.' };

    setBusy('sending');
    setError(null);
    try {
      const token = await ensureToken();
      const info = meta ?? await getSpreadsheetMeta(token, settings.spreadsheetId);
      setMeta(info);

      const missingTabs = targets
        .map(target => target.tab)
        .filter(tab => !info.tabs.includes(tab));

      if (missingTabs.length > 0) {
        if (!options.createMissing) return { status: 'needs-tabs', missingTabs };
        await addTabs(token, settings.spreadsheetId, missingTabs);
        setMeta({ ...info, tabs: [...info.tabs, ...missingTabs] });
      }

      let updatedCells = 0;
      for (const target of targets) {
        updatedCells += await writeTab(token, settings.spreadsheetId, target.tab, target.values);
      }

      const stamp = new Date().toISOString();
      localStorage.setItem(LAST_PUSH_KEY, stamp);
      setLastPushAt(stamp);
      return { status: 'done', updatedCells, tabs: targets.map(t => t.tab) };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Gönderilemedi.';
      setError(message);
      return { status: 'error', message };
    } finally {
      setBusy('idle');
    }
  }, [ensureToken, isConfigured, meta, settings.spreadsheetId]);

  return {
    settings,
    setSettings,
    isConfigured,
    meta,
    busy,
    error,
    lastPushAt,
    connect,
    disconnect,
    push,
  };
}
