import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addTabs,
  extractSpreadsheetId,
  getSpreadsheetMeta,
  readTab,
  requestAccessToken,
  revokeAccessToken,
  writeTab,
  type AccessToken,
  type SpreadsheetMeta,
} from '@/lib/googleSheets';
import { mergeSheetRows } from '@/utils/sheetExport';
import { DEFAULT_GOOGLE_CLIENT_ID } from '@/config';

export interface GoogleSheetsSettings {
  /** OAuth client id from the user's own Google Cloud project. */
  clientId: string;
  spreadsheetId: string;
  /**
   * Which tab each program has been written to. Without this, renaming a
   * program would orphan its tab and start a second one beside it.
   */
  tabByProgramId: Record<string, string>;
}

const SETTINGS_KEY = 'trackingVolume_googleSheets';
const LAST_PUSH_KEY = 'trackingVolume_googleSheetsLastPush';
const TOKEN_KEY = 'trackingVolume_googleSheetsToken';

/** Refresh a little early so a long write cannot start on a dying token. */
const TOKEN_SAFETY_MS = 60_000;

const emptySettings: GoogleSheetsSettings = {
  clientId: DEFAULT_GOOGLE_CLIENT_ID,
  spreadsheetId: '',
  tabByProgramId: {},
};

function readSettings(): GoogleSheetsSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return emptySettings;
    const parsed = JSON.parse(saved) as Partial<GoogleSheetsSettings>;
    return {
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : DEFAULT_GOOGLE_CLIENT_ID,
      spreadsheetId: typeof parsed.spreadsheetId === 'string' ? parsed.spreadsheetId : '',
      tabByProgramId: parsed.tabByProgramId && typeof parsed.tabByProgramId === 'object'
        ? parsed.tabByProgramId
        : {},
    };
  } catch {
    return emptySettings;
  }
}

/**
 * The token lives in sessionStorage, not localStorage: it dies with the tab and
 * expires within the hour anyway. Keeping it across a reload is what stops iOS
 * — where the silent request usually fails — from opening a popup every time
 * the page is refreshed.
 */
function readCachedToken(): AccessToken | null {
  try {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<AccessToken>;
    if (typeof parsed.value !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt - TOKEN_SAFETY_MS <= Date.now()) return null;
    return { value: parsed.value, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function cacheToken(token: AccessToken | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode can refuse storage; the in-memory copy still works.
  }
}

export interface SheetTarget {
  programId: string;
  tab: string;
  values: string[][];
}

export interface PushFailure {
  tab: string;
  message: string;
}

export type PushResult =
  | { status: 'done'; written: string[]; failed: PushFailure[]; updatedCells: number }
  | { status: 'needs-tabs'; missingTabs: string[] }
  | { status: 'needs-overwrite'; tabs: string[] }
  | { status: 'error'; message: string };

export interface PushOptions {
  createMissing?: boolean;
  /** Write over tabs whose existing contents could not be merged. */
  overwriteUnmergeable?: boolean;
}

export function useGoogleSheets() {
  const [settings, setSettingsState] = useState<GoogleSheetsSettings>(readSettings);
  const [meta, setMeta] = useState<SpreadsheetMeta | null>(null);
  const [busy, setBusy] = useState<'idle' | 'connecting' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastPushAt, setLastPushAt] = useState<string | null>(
    () => localStorage.getItem(LAST_PUSH_KEY),
  );

  const tokenRef = useRef<AccessToken | null>(readCachedToken());

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
        cacheToken(null);
      }
      return next;
    });
  }, []);

  const forgetTabMapping = useCallback(() => {
    setSettingsState(prev => ({ ...prev, tabByProgramId: {} }));
  }, []);

  const isConfigured = Boolean(settings.clientId && settings.spreadsheetId);

  /** A usable token, asking Google silently first so the common path is quiet. */
  const ensureToken = useCallback(async (): Promise<string> => {
    const current = tokenRef.current;
    if (current && current.expiresAt - TOKEN_SAFETY_MS > Date.now()) return current.value;

    const remember = (token: AccessToken) => {
      tokenRef.current = token;
      cacheToken(token);
      return token.value;
    };

    try {
      return remember(await requestAccessToken(settings.clientId, true));
    } catch {
      // No existing grant (or it was revoked) — fall back to asking properly.
      return remember(await requestAccessToken(settings.clientId, false));
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
    cacheToken(null);
    setMeta(null);
    setError(null);
  }, []);

  /**
   * Writes one tab per program, merging into what the tab already holds so a
   * narrow week range cannot truncate the sheet's history.
   *
   * Two things are never decided here: creating a tab that does not exist, and
   * overwriting a tab whose contents this app did not write. Both come back as
   * a question for the user.
   */
  const push = useCallback(async (
    targets: SheetTarget[],
    options: PushOptions = {},
  ): Promise<PushResult> => {
    if (!isConfigured) return { status: 'error', message: 'Ayarlar eksik.' };
    if (targets.length === 0) return { status: 'error', message: 'Gönderilecek veri yok.' };

    setBusy('sending');
    setError(null);
    try {
      const token = await ensureToken();
      const info = meta ?? await getSpreadsheetMeta(token, settings.spreadsheetId);
      setMeta(info);

      // A remembered tab wins over the program's current name.
      const resolved = targets.map(target => ({
        ...target,
        tab: settings.tabByProgramId[target.programId] ?? target.tab,
      }));

      const missingTabs = [...new Set(
        resolved.filter(t => !info.tabs.includes(t.tab)).map(t => t.tab),
      )];
      if (missingTabs.length > 0) {
        if (!options.createMissing) return { status: 'needs-tabs', missingTabs };
        await addTabs(token, settings.spreadsheetId, missingTabs);
        info.tabs = [...info.tabs, ...missingTabs];
        setMeta({ ...info });
      }

      // Merge first, so an unmergeable tab can be reported before anything is written.
      const prepared: { tab: string; programId: string; values: string[][] }[] = [];
      const conflicts: string[] = [];
      const failed: PushFailure[] = [];

      for (const target of resolved) {
        try {
          const existing = missingTabs.includes(target.tab)
            ? []
            : await readTab(token, settings.spreadsheetId, target.tab);
          const merged = mergeSheetRows(existing, target.values);
          if (merged.unmergeable && !options.overwriteUnmergeable) {
            conflicts.push(target.tab);
            continue;
          }
          prepared.push({ tab: target.tab, programId: target.programId, values: merged.rows });
        } catch (e) {
          failed.push({ tab: target.tab, message: e instanceof Error ? e.message : 'okunamadı' });
        }
      }

      if (conflicts.length > 0) return { status: 'needs-overwrite', tabs: conflicts };

      const written: string[] = [];
      let updatedCells = 0;
      for (const item of prepared) {
        try {
          updatedCells += await writeTab(token, settings.spreadsheetId, item.tab, item.values);
          written.push(item.tab);
        } catch (e) {
          failed.push({ tab: item.tab, message: e instanceof Error ? e.message : 'yazılamadı' });
        }
      }

      if (written.length > 0) {
        const stamp = new Date().toISOString();
        localStorage.setItem(LAST_PUSH_KEY, stamp);
        setLastPushAt(stamp);
        // Remember where each program landed, so a rename follows its own tab.
        const learned = Object.fromEntries(
          prepared.filter(item => written.includes(item.tab)).map(item => [item.programId, item.tab]),
        );
        setSettingsState(prev => ({
          ...prev,
          tabByProgramId: { ...prev.tabByProgramId, ...learned },
        }));
      }

      if (failed.length > 0) {
        setError(failed.map(f => `${f.tab}: ${f.message}`).join(' · '));
      }
      return { status: 'done', written, failed, updatedCells };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Gönderilemedi.';
      setError(message);
      return { status: 'error', message };
    } finally {
      setBusy('idle');
    }
  }, [ensureToken, isConfigured, meta, settings.spreadsheetId, settings.tabByProgramId]);

  return {
    settings,
    setSettings,
    forgetTabMapping,
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
