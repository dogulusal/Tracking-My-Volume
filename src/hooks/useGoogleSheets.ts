import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { normalizeGoogleSettings } from '@/utils/googleSheetsSettings';
import { readGoogleSession, saveGoogleSession, GOOGLE_SESSION_EVENT, TOKEN_SAFETY_MS } from '@/utils/googleSheetsSession';
import {
  addTabs,
  createPhaseTemplate,
  extractSpreadsheetId,
  formatCells,
  getSpreadsheetMeta,
  isTokenClientReady,
  prepareTokenClient,
  readTab,
  requestAccessToken,
  revokeAccessToken,
  writeTab,
  writeWeekColumns,
  SheetsApiError,
  type AccessToken,
  type SpreadsheetMeta,
} from '@/lib/googleSheets';
import { buildFormatRanges, type StatusColorOverrides } from '@/utils/sheetFormat';
import type { ExerciseStatus } from '@/types';
import { mergeSheetRows } from '@/utils/sheetExport';
import type { ColumnCell, WeekColumnTarget } from '@/utils/sheetColumn';
import type { PhaseSheetLayout } from '@/utils/sheetTemplate';

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


/** Refresh a little early so a long write cannot start on a dying token. */


const emptySettings: GoogleSheetsSettings = normalizeGoogleSettings(null);

function readSettings(): GoogleSheetsSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return emptySettings;
    const parsed = JSON.parse(saved) as Partial<GoogleSheetsSettings>;
    return normalizeGoogleSettings(parsed);
  } catch {
    return emptySettings;
  }
}

export interface SheetTarget {
  programId: string;
  tab: string;
  values: string[][];
  /** Cell statuses keyed by statusKey(); drives the colours written after. */
  statuses: Map<string, ExerciseStatus>;
  /** Week column labels this send covers — nothing outside them is recoloured. */
  weekLabels: string[];
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
  /** The user's own status palette, when they have changed it. */
  statusColors?: StatusColorOverrides;
}

export function useGoogleSheets() {
  const context = useContext(AppContext);
  const dispatch = context?.dispatch;
  const [localSettings, setLocalSettings] = useState<GoogleSheetsSettings>(readSettings);
  const settings = context?.state.googleSheetsSettings ?? localSettings;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const setSettingsState = useCallback((update: (prev: GoogleSheetsSettings) => GoogleSheetsSettings) => {
    const next = normalizeGoogleSettings(update(settingsRef.current));
    settingsRef.current = next;
    setLocalSettings(next);
    dispatch?.({ type: 'SET_GOOGLE_SHEETS_SETTINGS', payload: next });
  }, [dispatch]);
  const [meta, setMeta] = useState<SpreadsheetMeta | null>(null);
  const [busy, setBusy] = useState<'idle' | 'connecting' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastPushAt, setLastPushAt] = useState<string | null>(
    () => localStorage.getItem(LAST_PUSH_KEY),
  );

  const owner = context?.cloud.userEmail ?? 'local';
  const [connected, setConnected] = useState(() => Boolean(readGoogleSession(settings.clientId, owner)));

  // Every dialog observes the same session. Restore metadata without opening
  // an authorization window; a new token is requested only on an explicit click.
  useEffect(() => {
    let disposed = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let revision = 0;
    const restore = () => {
      const currentRevision = ++revision;
      if (expiry) clearTimeout(expiry);
      const token = readGoogleSession(settings.clientId, owner);
      setConnected(Boolean(token));
      setMeta(null);
      if (!token || !settings.spreadsheetId) return;
      expiry = setTimeout(restore, Math.max(1, token.expiresAt - TOKEN_SAFETY_MS - Date.now()));
      void getSpreadsheetMeta(token.value, settings.spreadsheetId).then(info => {
        if (!disposed && revision === currentRevision) setMeta(info);
      }).catch(e => {
        if (disposed || revision !== currentRevision) return;
        if (e instanceof SheetsApiError && e.status === 401) saveGoogleSession(null, settings.clientId, owner);
      });
    };
    restore();
    window.addEventListener(GOOGLE_SESSION_EVENT, restore);
    window.addEventListener('focus', restore);
    return () => {
      disposed = true;
      if (expiry) clearTimeout(expiry);
      window.removeEventListener(GOOGLE_SESSION_EVENT, restore);
      window.removeEventListener('focus', restore);
    };
  }, [settings.clientId, settings.spreadsheetId, owner]);

  const invalidateRejectedToken = useCallback((e: unknown) => {
    if (e instanceof SheetsApiError && e.status === 401) saveGoogleSession(null, settings.clientId, owner);
  }, [settings.clientId, owner]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const setSettings = useCallback((patch: Partial<GoogleSheetsSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch };
      if (patch.spreadsheetId !== undefined) {
        next.spreadsheetId = extractSpreadsheetId(patch.spreadsheetId);
      }
      // File changes need fresh metadata, not a fresh Google authorization.
      if (next.clientId !== prev.clientId || next.spreadsheetId !== prev.spreadsheetId) {
        setMeta(null);
      }
      if (next.spreadsheetId !== prev.spreadsheetId) next.tabByProgramId = {};
      if (next.clientId !== prev.clientId) {

        saveGoogleSession(null, prev.clientId, owner);
      }
      return next;
    });
  }, [setSettingsState, owner]);

  const forgetTabMapping = useCallback(() => {
    setSettingsState(prev => ({ ...prev, tabByProgramId: {} }));
  }, [setSettingsState, owner]);

  const isConfigured = Boolean(settings.clientId && settings.spreadsheetId);

  const remember = useCallback((token: AccessToken) => {

    saveGoogleSession(token, settings.clientId, owner);
    return token.value;
  }, [settings.clientId, owner]);

  // Building the token client is the one thing that can be done ahead of time.
  // Asking for a token cannot: GIS opens a popup even when asked quietly, so
  // anything on this path outside a click would be blocked on sight.
  useEffect(() => {
    if (!settings.clientId) return;
    prepareTokenClient(settings.clientId).catch(() => {
      // Offline, or the script is blocked; connect() reports it when tried.
    });
  }, [settings.clientId]);

  /**
   * Returns a token, opening Google's window when there is none.
   *
   * Deliberately synchronous up to the point of asking: every caller reaches
   * here straight from a click, and the first `await` on the way would cost
   * that click its right to open a window.
   */
  const ensureToken = useCallback((): Promise<string> => {
    const current = readGoogleSession(settings.clientId, owner);
    if (current && current.expiresAt - TOKEN_SAFETY_MS > Date.now()) {
      return Promise.resolve(current.value);
    }
    if (!isTokenClientReady(settings.clientId)) {
      void prepareTokenClient(settings.clientId).catch(() => {});
      return Promise.reject(new Error('Google bağlantısı hazırlanıyor. Birkaç saniye sonra tekrar tıkla.'));
    }
    return requestAccessToken(settings.clientId).then(remember);
  }, [remember, settings.clientId, owner]);

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
      invalidateRejectedToken(e);
      setError(e instanceof Error ? e.message : 'Bağlanılamadı.');
      return null;
    } finally {
      setBusy('idle');
    }
  }, [ensureToken, isConfigured, settings.spreadsheetId, invalidateRejectedToken]);

  const disconnect = useCallback(() => {
    const token = readGoogleSession(settings.clientId, owner);
    if (token) revokeAccessToken(token.value);
    saveGoogleSession(null, settings.clientId, owner);
    setMeta(null);
    setError(null);
  }, [settings.clientId, owner]);
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

      const titles = new Set(info.tabs.map(tab => tab.title));
      const missingTabs = [...new Set(
        resolved.filter(t => !titles.has(t.tab)).map(t => t.tab),
      )];
      if (missingTabs.length > 0) {
        if (!options.createMissing) return { status: 'needs-tabs', missingTabs };
        const created = await addTabs(token, settings.spreadsheetId, missingTabs);
        info.tabs = [...info.tabs, ...created];
        setMeta({ ...info });
      }
      const sheetIdOf = (title: string) =>
        info.tabs.find(tab => tab.title === title)?.sheetId;

      // Merge first, so an unmergeable tab can be reported before anything is written.
      const prepared: (SheetTarget & { values: string[][] })[] = [];
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
          prepared.push({ ...target, values: merged.rows });
        } catch (e) {
          invalidateRejectedToken(e);
          failed.push({ tab: target.tab, message: e instanceof Error ? e.message : 'okunamadı' });
        }
      }

      if (conflicts.length > 0) return { status: 'needs-overwrite', tabs: conflicts };

      const written: string[] = [];
      let updatedCells = 0;
      for (const item of prepared) {
        try {
          updatedCells += await writeTab(token, settings.spreadsheetId, item.tab, item.values);

          // Colours are a second pass: values land even if formatting fails,
          // and a failure here is worth reporting rather than swallowing.
          const sheetId = sheetIdOf(item.tab);
          if (sheetId !== undefined) {
            await formatCells(token, settings.spreadsheetId, sheetId,
              buildFormatRanges(item.values, item.weekLabels, item.statuses, options.statusColors));
          }
          written.push(item.tab);
        } catch (e) {
          invalidateRejectedToken(e);
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
      invalidateRejectedToken(e);
      setError(message);
      return { status: 'error', message };
    } finally {
      setBusy('idle');
    }
  }, [ensureToken, isConfigured, meta, settings.spreadsheetId, settings.tabByProgramId, setSettingsState, invalidateRejectedToken]);

  const pushWeek = async (targets: WeekColumnTarget[]): Promise<boolean> => {
    if (!isConfigured || busy !== 'idle') return false;
    setBusy('sending');
    setError(null);
    try {
      const token = await ensureToken();
      const info = await getSpreadsheetMeta(token, settings.spreadsheetId);
      setMeta(info);
      const resolved = targets.map(target => {
        const tab = info.tabs.find(t => t.title === target.tab);
        if (!tab) throw new Error(`Hedef sekme bulunamadı: ${target.tab}`);
        return { ...target, tab };
      });
      await writeWeekColumns(token, settings.spreadsheetId, resolved);
      const stamp = new Date().toISOString();
      setLastPushAt(stamp);
      localStorage.setItem(LAST_PUSH_KEY, stamp);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sütun gönderilemedi.');
      invalidateRejectedToken(e);
      return false;
    } finally { setBusy('idle'); }
  };

  const pushColumn = (tab: string, column: number, cells: ColumnCell[]) => pushWeek([{ tab, column, cells }]);

  const createTemplate = async (layout: PhaseSheetLayout): Promise<boolean> => {
    if (!isConfigured || busy !== 'idle') return false;
    setBusy('sending'); setError(null);
    try {
      const token = await ensureToken();
      const tab = await createPhaseTemplate(token, settings.spreadsheetId, layout);
      setMeta(prev => prev ? { ...prev, tabs: [...prev.tabs, tab] } : null);
      return true;
    } catch (e) {
      invalidateRejectedToken(e);
      setError(e instanceof Error ? e.message : 'Sekme oluşturulamadı.');
      return false;
    } finally { setBusy('idle'); }
  };

  return {
    settings,
    connected,
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
    pushColumn,
    pushWeek,
    createTemplate,
  };
}
