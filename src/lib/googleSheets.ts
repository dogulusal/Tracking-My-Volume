import { foregroundForRgb, type CellFormatRange } from '@/utils/sheetFormat';
import { buildPhaseTemplateRequests, type PhaseSheetLayout } from '@/utils/sheetTemplate';
import { buildWeekRequests, columnLetters, type ColumnCell } from '@/utils/sheetColumn';
import { buildSheetLayoutRequests } from '@/utils/sheetLayout';

/**
 * Minimal Google Sheets v4 client for the "send to my sheet" button.
 *
 * Auth is the Google Identity Services token flow: the browser asks Google for
 * a short-lived access token, so there is no client secret and nothing on our
 * side to store. The token stays in memory (see useGoogleSheets) — writing it
 * to localStorage would outlive its usefulness and only add risk.
 *
 * The OAuth client id is not a secret, but it is specific to whoever deploys
 * this, so it comes from the user's settings rather than being baked in.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Write access to the spreadsheets the user picks. */
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
  /** GIS lets these be swapped per request, which is what allows one client to
   *  be built ahead of time and reused inside a click. */
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }) => TokenClient;
      revoke: (token: string, done?: () => void) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

let gisPromise: Promise<GoogleIdentityServices> | null = null;

/** Loads the Google script once and resolves when window.google is usable. */
export function loadGis(): Promise<GoogleIdentityServices> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('Google kimlik kütüphanesi yüklendi ama beklenen arayüz yok.'));
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', () => {
      gisPromise = null;
      reject(new Error('Google kimlik kütüphanesi yüklenemedi (internet bağlantısı?).'));
    });
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return gisPromise;
}

export interface AccessToken {
  value: string;
  /** Epoch ms; the token is refused a little before this to avoid a race. */
  expiresAt: number;
}

/**
 * The token client is built once, ahead of any click.
 *
 * This matters more than it looks: a popup only opens if it is asked for in the
 * same tick as the user's click. Anything awaited first — loading Google's
 * script, or trying for a silent token — spends that gesture, and the browser
 * answers the real request with "Failed to open popup window". So preparation
 * happens on mount and the click itself stays synchronous.
 */
let prepared: { clientId: string; client: TokenClient } | null = null;

export async function prepareTokenClient(clientId: string): Promise<void> {
  if (!clientId || prepared?.clientId === clientId) return;
  const google = await loadGis();
  prepared = {
    clientId,
    client: google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SHEETS_SCOPE,
      callback: () => {},
      error_callback: () => {},
    }),
  };
}

export function isTokenClientReady(clientId: string): boolean {
  return prepared?.clientId === clientId;
}

function describeTokenError(error: { type?: string; message?: string }): string {
  if (error.type === 'popup_failed_to_open') {
    return 'Tarayıcı Google penceresini engelledi. Adres çubuğundaki engelleme '
      + 'simgesinden bu siteye izin verip tekrar dene.';
  }
  if (error.type === 'popup_closed') {
    return 'Google penceresi kapatıldı, izin verilmedi.';
  }
  return error.message || 'Google izin akışı tamamlanamadı.';
}

/**
 * Must be called straight from a click.
 *
 * There is no quiet variant to fall back on: GIS opens a popup even for
 * `prompt: 'none'` (measured — it calls window.open with display=popup), so an
 * attempt made on page load is simply a blocked popup and a warning icon in the
 * address bar. Asking only on a real click is the only version of this that
 * behaves. The token is cached for the session so the ask stays rare.
 */
export function requestAccessToken(clientId: string): Promise<AccessToken> {
  const entry = prepared?.clientId === clientId ? prepared : null;
  if (!entry) {
    return Promise.reject(new Error('Google kimlik kütüphanesi henüz hazır değil, bir an sonra tekrar dene.'));
  }

  return new Promise<AccessToken>((resolve, reject) => {
    let settled = false;
    entry.client.callback = (response) => {
      if (settled) return;
      settled = true;
      if (response.access_token) {
        const lifetime = (response.expires_in ?? 3600) * 1000;
        resolve({ value: response.access_token, expiresAt: Date.now() + lifetime });
      } else {
        reject(new Error(response.error_description || response.error || 'Google izin vermedi.'));
      }
    };
    entry.client.error_callback = (error) => {
      if (settled) return;
      settled = true;
      reject(new Error(describeTokenError(error)));
    };
    // '' lets Google skip the consent screen once the grant exists, so a repeat
    // ask is a popup that opens and closes by itself.
    entry.client.requestAccessToken({ prompt: '' });
  });
}

export function revokeAccessToken(token: string): void {
  window.google?.accounts.oauth2.revoke(token);
}

export class SheetsApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function sheetsFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${SHEETS_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = await response.json() as { error?: { message?: string } };
      if (body.error?.message) detail = body.error.message;
    } catch {
      // Non-JSON error body; the status code is all we have.
    }
    throw new SheetsApiError(detail, response.status);
  }

  return response.json() as Promise<T>;
}

export interface SheetTab {
  title: string;
  /** Formatting is addressed by numeric id, not by name. */
  sheetId: number;
}

export interface SpreadsheetMeta {
  title: string;
  tabs: SheetTab[];
}

export async function getSpreadsheetMeta(token: string, spreadsheetId: string): Promise<SpreadsheetMeta> {
  const data = await sheetsFetch<{
    properties?: { title?: string };
    sheets?: { properties?: { title?: string; sheetId?: number } }[];
  }>(token, `/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties(title,sheetId)`);

  return {
    title: data.properties?.title ?? '(isimsiz)',
    tabs: (data.sheets ?? [])
      .map(sheet => sheet.properties)
      .filter((props): props is { title: string; sheetId: number } =>
        Boolean(props?.title) && typeof props?.sheetId === 'number')
      .map(props => ({ title: props.title, sheetId: props.sheetId })),
  };
}

export async function addTabs(
  token: string,
  spreadsheetId: string,
  titles: string[],
  dimensions?: Record<string, { rowCount: number; columnCount: number }>,
): Promise<SheetTab[]> {
  if (titles.length === 0) return [];
  const result = await sheetsFetch<{
    replies?: { addSheet?: { properties?: { title?: string; sheetId?: number } } }[];
  }>(token, `/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: titles.map(title => ({ addSheet: { properties: {
        title,
        ...(dimensions?.[title] ? { gridProperties: dimensions[title] } : {}),
      } } })),
    }),
  });

  // The reply carries the new ids, which the colouring pass needs straight away.
  return (result.replies ?? [])
    .map(reply => reply.addSheet?.properties)
    .filter((props): props is { title: string; sheetId: number } =>
      Boolean(props?.title) && typeof props?.sheetId === 'number')
    .map(props => ({ title: props.title, sheetId: props.sheetId }));
}

/**
 * Paints cell backgrounds, one request per row range. Only the ranges given are
 * touched — a column the app did not send keeps whatever colour it has, which
 * is the same promise the value merge makes.
 */
export async function formatCells(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  ranges: CellFormatRange[],
): Promise<void> {
  if (ranges.length === 0) return;
  await sheetsFetch(token, `/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: ranges.map(range => ({
        updateCells: {
          range: {
            sheetId,
            startRowIndex: range.rowIndex,
            endRowIndex: range.rowIndex + 1,
            startColumnIndex: range.startColumnIndex,
            endColumnIndex: range.startColumnIndex + range.colors.length,
          },
          rows: [{
            values: range.colors.map(backgroundColor => ({
              userEnteredFormat: {
                backgroundColor,
                textFormat: { foregroundColorStyle: { rgbColor: foregroundForRgb(backgroundColor) } },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
              },
            })),
          }],
          fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColorStyle,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment',
        },
      })),
    }),
  });
}

/** A1 range for a whole tab, with the quoting Sheets wants for spaced names. */
function tabRange(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

/** Everything the tab currently holds, so a write can be merged into it. */
export async function readTab(
  token: string,
  spreadsheetId: string,
  tab: string,
): Promise<string[][]> {
  const result = await sheetsFetch<{ values?: string[][] }>(
    token,
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(tabRange(tab))}`,
  );
  return result.values ?? [];
}

/**
 * Replaces a tab's contents with `values`. The clear comes first so that a
 * shorter export cannot leave last month's rows sitting underneath, and RAW
 * keeps every cell as the literal text of the grid — notably, a note that
 * starts with "=" stays a note instead of becoming a formula.
 *
 * Callers merge before writing (see mergeSheetRows), so `values` is expected to
 * already contain everything the tab should keep.
 */
export async function writeTab(
  token: string,
  spreadsheetId: string,
  tab: string,
  values: string[][],
): Promise<number> {
  const id = encodeURIComponent(spreadsheetId);
  const range = encodeURIComponent(tabRange(tab));

  await sheetsFetch(token, `/${id}/values/${range}:clear`, { method: 'POST', body: '{}' });

  const result = await sheetsFetch<{ updatedCells?: number }>(
    token,
    `/${id}/values/${encodeURIComponent(`${tabRange(tab)}!A1`)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values }) },
  );

  return result.updatedCells ?? 0;
}

/** Accepts either a bare id or a pasted Google Sheets URL. */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export async function writeWeekColumn(token: string, spreadsheetId: string, tab: SheetTab, column: number, cells: ColumnCell[]): Promise<void> {
  return writeWeekColumns(token, spreadsheetId, [{ tab, column, cells }]);
}

export async function writeWeekColumns(token: string, spreadsheetId: string, targets: { tab: SheetTab; column: number; cells: ColumnCell[] }[]): Promise<void> {
  const requests = buildWeekRequests(targets.map(t => ({ ...t, sheetId: t.tab.sheetId })));
  const layoutRequests: unknown[] = [];
  // Check every table before the single atomic write.
  for (const { tab, column, cells } of targets) {
    const header = cells[0];
    const address = `${tabRange(tab.title)}!${columnLetters(column)}${header.row}`;
    const existing = await sheetsFetch<{ values?: string[][] }>(token,
      `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(address)}`);
    const label = String(existing.values?.[0]?.[0] ?? '').trim();
    if (label && label !== header.value) throw new Error(`${tab.title}: hedef başlık ${label}; gönderilen ${header.value}. Başlık hücresini kontrol et.`);
  }
  for (const sheetId of new Set(targets.filter(t => t.cells.some(c => c.kind === 'note')).map(t => t.tab.sheetId))) {
    const group = targets.filter(t => t.tab.sheetId === sheetId);
    const rows = (await readTab(token, spreadsheetId, group[0].tab.title)).map(row => row.map(value => String(value ?? '')));
    for (const target of group) for (const cell of target.cells) {
      while (rows.length < cell.row) rows.push([]);
      const row = rows[cell.row - 1];
      while (row.length <= target.column) row.push('');
      row[target.column] = cell.value;
    }
    layoutRequests.push(...buildSheetLayoutRequests(sheetId, rows, Math.max(...group.map(t => t.column))));
  }
  await sheetsFetch(token, `/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST', body: JSON.stringify({ requests: [...layoutRequests, ...requests] }),
  });
}

export async function createPhaseTemplate(token: string, spreadsheetId: string, layout: PhaseSheetLayout): Promise<SheetTab> {
  const meta = await getSpreadsheetMeta(token, spreadsheetId);
  if (meta.tabs.some(tab => tab.title.toLocaleLowerCase() === layout.title.toLocaleLowerCase())) throw new Error('Bu isimde bir sekme zaten var. Mevcut sekmeye aktarım yap veya yeni sekmeye farklı bir ad ver.');
  let sheetId = Math.floor(Math.random() * 2_000_000_000);
  while (meta.tabs.some(tab => tab.sheetId === sheetId)) sheetId++;
  await sheetsFetch(token, `/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST', body: JSON.stringify({ requests: buildPhaseTemplateRequests(sheetId, layout) }),
  });
  return { sheetId, title: layout.title };
}
