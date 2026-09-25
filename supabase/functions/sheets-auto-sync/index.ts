import { createClient } from 'npm:@supabase/supabase-js@2';
import { projectSheets } from '../_shared/sheetProjection.mjs';
import { buildAutoSheetStyleRequests } from '../_shared/sheetStyle.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const workerSecret = Deno.env.get('SHEET_SYNC_WORKER_SECRET')!;
const cryptoKey = Deno.env.get('SHEET_SYNC_ENCRYPTION_KEY')!;
const allowedOrigins = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const encoder = new TextEncoder();
const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

function response(body: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': allowedOrigins.includes(origin) ? origin : 'null',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-requested-with',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
  } });
}

async function aesKey() {
  if (!cryptoKey) throw new Error('SHEET_SYNC_ENCRYPTION_KEY eksik.');
  return crypto.subtle.importKey('raw', base64ToBytes(cryptoKey), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), encoder.encode(value)));
  return `${bytesToBase64(iv)}.${bytesToBase64(ciphertext)}`;
}
async function decrypt(value: string) {
  const [iv, ciphertext] = value.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv) }, await aesKey(), base64ToBytes(ciphertext));
  return new TextDecoder().decode(plain);
}

async function googleRequest(token: string, path: string, init: RequestInit = {}) {
  const result = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(`Google Sheets ${result.status}: ${data.error?.message ?? result.statusText}`);
  return data;
}

async function exchangeCode(code: string, origin: string) {
  const result = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: googleClientId, client_secret: googleClientSecret,
      redirect_uri: origin, grant_type: 'authorization_code' }),
  });
  const data = await result.json();
  if (!result.ok || !data.access_token || !data.refresh_token) {
    throw new Error('Google kalıcı erişim izni vermedi. Google bağlantısını yeniden onayla.');
  }
  return data;
}

async function accessToken(ciphertext: string) {
  const result = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: googleClientId, client_secret: googleClientSecret,
      refresh_token: await decrypt(ciphertext), grant_type: 'refresh_token' }),
  });
  const data = await result.json();
  if (!result.ok || !data.access_token) throw new Error(`Google izin yenileme başarısız: ${data.error ?? result.status}`);
  return data.access_token as string;
}

async function syncUser(userId: string) {
  const [{ data: connection, error: connectionError }, { data: stateRow, error: stateError }] = await Promise.all([
    admin.from('sheet_auto_connections').select('*').eq('user_id', userId).single(),
    admin.from('user_states').select('data').eq('user_id', userId).single(),
  ]);
  if (connectionError || stateError || !connection || !stateRow) throw new Error('Bağlantı veya bulut verisi bulunamadı.');
  const token = await accessToken(connection.refresh_token_ciphertext);
  const spreadsheetId = connection.spreadsheet_id as string;
  const metadata = await googleRequest(token, `${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title,gridProperties),merges)`);
  const existing = metadata.sheets?.map((sheet: { properties: Record<string, unknown>; merges?: unknown[] }) =>
    ({ ...sheet.properties, merges: sheet.merges ?? [] })) ?? [];
  const managedTabs: Record<string, number> = { ...(connection.managed_tabs ?? {}) };
  const state = stateRow.data;
  const currentPhase = [...(state.phases ?? [])].reverse().find((phase: { startWeek: number; endWeek: number | null }) =>
    state.currentWeek >= phase.startWeek && (phase.endWeek == null || state.currentWeek <= phase.endWeek));
  if (!currentPhase) throw new Error('Etkin faz bulunamadı.');
  const latestLoggedWeek = Math.max(currentPhase.startWeek, ...(state.weekLogs ?? [])
    .filter((log: { weekNumber: number }) => log.weekNumber >= currentPhase.startWeek && log.weekNumber <= state.currentWeek)
    .map((log: { weekNumber: number }) => log.weekNumber));
  const selection = connection.selection ?? { phaseId: currentPhase.id, programId: null, weekMode: 'latest', weekNumber: latestLoggedWeek };
  if (!connection.selection) {
    const { error } = await admin.from('sheet_auto_connections').update({ selection }).eq('user_id', userId);
    if (error) throw error;
  }
  const projected = projectSheets(state, selection);
  for (const sheet of projected) {
    let sheetId = managedTabs[sheet.phaseId];
    let tab = existing.find((item: { sheetId: number }) => item.sheetId === sheetId);
    if (!tab) {
      const titleExists = existing.some((item: { title: string }) => item.title === sheet.title);
      const title = titleExists ? `${sheet.title.slice(0, 92)} · yeni` : sheet.title;
      const created = await googleRequest(token, `${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
        method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: {
          title, gridProperties: { rowCount: sheet.rowCount, columnCount: sheet.columnCount, frozenColumnCount: 2 },
        } } }] }),
      });
      sheetId = created.replies[0].addSheet.properties.sheetId;
      managedTabs[sheet.phaseId] = sheetId;
      tab = { sheetId, title, gridProperties: { rowCount: sheet.rowCount, columnCount: sheet.columnCount }, merges: [] };
      existing.push(tab);
      // Persist ownership before writing, so a retry reuses the same tab.
      const { error } = await admin.from('sheet_auto_connections').update({ managed_tabs: managedTabs }).eq('user_id', userId);
      if (error) throw error;
    }
    const rowCount = Math.max(sheet.rowCount, tab.gridProperties?.rowCount ?? 0);
    const columnCount = Math.max(sheet.columnCount, tab.gridProperties?.columnCount ?? 0);
    const requests: unknown[] = [];
    const desiredMerges = sheet.blocks.map((block: { titleRow: number }) =>
      ({ startRowIndex: block.titleRow, endRowIndex: block.titleRow + 1, startColumnIndex: 2, endColumnIndex: 8 }));
    for (const merge of tab.merges ?? []) {
      if (desiredMerges.some((wanted: Record<string, number>) =>
        wanted.startRowIndex === merge.startRowIndex && wanted.endRowIndex === merge.endRowIndex
        && wanted.startColumnIndex === merge.startColumnIndex && wanted.endColumnIndex === merge.endColumnIndex)) continue;
      requests.push({ unmergeCells: { range: merge } });
    }
    if (rowCount > (tab.gridProperties?.rowCount ?? 0) || columnCount > (tab.gridProperties?.columnCount ?? 0)) {
      requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount, columnCount } },
        fields: 'gridProperties.rowCount,gridProperties.columnCount' } });
    }
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: rowCount,
      startColumnIndex: 0, endColumnIndex: columnCount }, cell: {}, fields: 'userEnteredValue' } });
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: rowCount,
      startColumnIndex: 0, endColumnIndex: columnCount }, cell: {}, fields: 'userEnteredFormat' } });
    requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 },
      rows: sheet.rows.map((row: string[]) => ({ values: row.map(value => ({ userEnteredValue: { stringValue: value } })) })),
      fields: 'userEnteredValue' } });
    requests.push(...buildAutoSheetStyleRequests(sheetId, sheet, tab.merges));
    await googleRequest(token, `${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST', body: JSON.stringify({ requests }),
    });
  }
  const activePhaseIds = new Set(projected.map((sheet: { phaseId: string }) => sheet.phaseId));
  for (const [phaseId, sheetId] of Object.entries(managedTabs)) {
    if (activePhaseIds.has(phaseId)) continue;
    if (existing.some((item: { sheetId: number }) => item.sheetId === sheetId)) {
      await googleRequest(token, `${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
        method: 'POST', body: JSON.stringify({ requests: [{ deleteSheet: { sheetId } }] }),
      });
    }
    delete managedTabs[phaseId];
  }
  const { error } = await admin.from('sheet_auto_connections').update({
    managed_tabs: managedTabs, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  if (error) throw error;
}

async function processQueue() {
  const { data: claims, error } = await admin.rpc('claim_sheet_auto_sync', { batch_size: 5 });
  if (error) throw error;
  const results = [];
  for (const claim of claims ?? []) {
    const userId = claim.claimed_user_id as string;
    const revision = claim.claimed_revision as number;
    try {
      await syncUser(userId);
      await admin.from('sheet_auto_queue').delete().eq('user_id', userId).eq('revision', revision).eq('status', 'processing');
      results.push({ userId, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { data: queue } = await admin.from('sheet_auto_queue').select('attempts').eq('user_id', userId).single();
      const attempts = (queue?.attempts ?? 0) + 1;
      await admin.from('sheet_auto_queue').update({ status: 'error', attempts, last_error: message,
        due_at: new Date(Date.now() + Math.min(3600, 2 ** Math.min(attempts, 10) * 30) * 1000).toISOString(),
        locked_at: null, updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('revision', revision).eq('status', 'processing');
      await admin.from('sheet_auto_connections').update({ last_error: message,
        ...(message.includes('invalid_grant') ? { status: 'reauthorize' } : {}) }).eq('user_id', userId);
      results.push({ userId, ok: false, error: message });
    }
  }
  return results;
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') ?? '';
  if (request.method === 'OPTIONS') return response({}, 200, origin);
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, origin);
  if (origin && !allowedOrigins.includes(origin)) return response({ error: 'Origin not allowed' }, 403, origin);
  try {
    const body = await request.json();
    if (body.action === 'run') {
      if (!workerSecret || request.headers.get('x-worker-key') !== workerSecret) return response({ error: 'Unauthorized' }, 401, origin);
      return response({ results: await processQueue() }, 200, origin);
    }
    const jwt = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!jwt) return response({ error: 'Giriş gerekli.' }, 401, origin);
    const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !user) return response({ error: 'Giriş geçersiz.' }, 401, origin);
    if (body.action === 'status') {
      const [{ data: connection }, { data: queue }] = await Promise.all([
        admin.from('sheet_auto_connections').select('spreadsheet_id,status,last_error,last_synced_at,selection').eq('user_id', user.id).maybeSingle(),
        admin.from('sheet_auto_queue').select('status,last_error,updated_at').eq('user_id', user.id).maybeSingle(),
      ]);
      return response({ connection, queue }, 200, origin);
    }
    if (body.action === 'disconnect') {
      const { data: connection } = await admin.from('sheet_auto_connections')
        .select('refresh_token_ciphertext').eq('user_id', user.id).maybeSingle();
      if (connection) {
        try {
          await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: await decrypt(connection.refresh_token_ciphertext) }) });
        } catch { /* Local disconnection must still complete. */ }
      }
      await admin.from('sheet_auto_queue').delete().eq('user_id', user.id);
      const { error } = await admin.from('sheet_auto_connections').delete().eq('user_id', user.id);
      if (error) throw error;
      return response({ ok: true }, 200, origin);
    }
    if (body.action === 'configure') {
      const { data: stateRow, error: stateError } = await admin.from('user_states').select('data').eq('user_id', user.id).single();
      const { data: connection } = await admin.from('sheet_auto_connections').select('user_id').eq('user_id', user.id).maybeSingle();
      if (stateError || !stateRow || !connection) return response({ error: 'Önce otomatik Google bağlantısını kur.' }, 400, origin);
      const state = stateRow.data;
      const phase = (state.phases ?? []).find((item: { id: string }) => item.id === body.phaseId);
      const programId = body.programId === null ? null : String(body.programId ?? '');
      const weekMode = String(body.weekMode ?? '');
      const weekNumber = Number(body.weekNumber);
      if (!phase || !['latest', 'one', 'all'].includes(weekMode)
        || (programId && !(state.programVersions ?? []).some((version: { phaseId: string; programs: { id: string }[] }) =>
          version.phaseId === phase.id && version.programs.some(program => program.id === programId))
          && !(state.weekLogs ?? []).some((log: { programId: string; weekNumber: number }) =>
            log.programId === programId && log.weekNumber >= phase.startWeek && log.weekNumber <= (phase.endWeek ?? state.currentWeek)))
        || (weekMode !== 'all' && (!Number.isInteger(weekNumber) || weekNumber < phase.startWeek
          || weekNumber > (phase.endWeek ?? state.currentWeek)))) {
        return response({ error: 'Faz, antrenman veya hafta seçimi geçersiz.' }, 400, origin);
      }
      const selection = { phaseId: phase.id, programId, weekMode,
        weekNumber: weekMode === 'all' ? phase.startWeek : weekNumber };
      const { error } = await admin.from('sheet_auto_connections').update({ selection, updated_at: new Date().toISOString() }).eq('user_id', user.id);
      if (error) throw error;
      const queued = await admin.rpc('request_sheet_auto_sync', { target_user_id: user.id });
      if (queued.error) throw queued.error;
      return response({ ok: true }, 200, origin);
    }
    if (body.action === 'connect') {
      if (!allowedOrigins.includes(origin) || request.headers.get('x-requested-with') !== 'XmlHttpRequest') {
        return response({ error: 'Bağlantı isteği doğrulanamadı.' }, 403, origin);
      }
      const spreadsheetId = String(body.spreadsheetId ?? '').trim();
      if (!/^[A-Za-z0-9_-]{15,}$/.test(spreadsheetId) || typeof body.code !== 'string') {
        return response({ error: 'Sheet adresi veya Google kodu geçersiz.' }, 400, origin);
      }
      if (!googleClientId || !googleClientSecret) throw new Error('Sunucu Google OAuth ayarları eksik.');
      const tokens = await exchangeCode(body.code, origin);
      await googleRequest(tokens.access_token, `${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId`);
      const { data: previous } = await admin.from('sheet_auto_connections')
        .select('spreadsheet_id,managed_tabs,selection').eq('user_id', user.id).maybeSingle();
      const { data: stateRow } = await admin.from('user_states').select('data').eq('user_id', user.id).maybeSingle();
      const state = stateRow?.data;
      const currentPhase = [...(state?.phases ?? [])].reverse().find((phase: { startWeek: number; endWeek: number | null }) =>
        state.currentWeek >= phase.startWeek && (phase.endWeek == null || state.currentWeek <= phase.endWeek));
      if (!currentPhase) throw new Error('Etkin faz bulunamadı.');
      const latestLoggedWeek = Math.max(currentPhase.startWeek, ...(state.weekLogs ?? [])
        .filter((log: { weekNumber: number }) => log.weekNumber >= currentPhase.startWeek && log.weekNumber <= state.currentWeek)
        .map((log: { weekNumber: number }) => log.weekNumber));
      const selection = previous?.selection ?? { phaseId: currentPhase.id, programId: null, weekMode: 'latest', weekNumber: latestLoggedWeek };
      const { error } = await admin.from('sheet_auto_connections').upsert({ user_id: user.id,
        spreadsheet_id: spreadsheetId, refresh_token_ciphertext: await encrypt(tokens.refresh_token),
        managed_tabs: previous?.spreadsheet_id === spreadsheetId ? previous.managed_tabs : {},
        selection,
        status: 'active', last_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      const queued = await admin.rpc('request_sheet_auto_sync', { target_user_id: user.id });
      if (queued.error) throw queued.error;
      return response({ ok: true }, 200, origin);
    }
    return response({ error: 'Bilinmeyen işlem.' }, 400, origin);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : String(error) }, 500, origin);
  }
});
