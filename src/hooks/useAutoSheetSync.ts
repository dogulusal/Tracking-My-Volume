import { useCallback, useContext, useEffect, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { APP_CREATED_SHEETS_SCOPE, loadGis, SHEETS_SCOPE } from '@/lib/googleSheets';

interface AutoStatus {
  connection: { spreadsheet_id: string; status: 'active' | 'reauthorize'; access_scope: 'all' | 'app_files';
    last_error: string | null; last_synced_at: string | null;
    selection: { phaseId: string; programId: string | null; weekMode: 'latest' | 'one' | 'all'; weekNumber: number } | null } | null;
  queue: { status: 'pending' | 'processing' | 'error'; last_error: string | null } | null;
}

const emptyStatus: AutoStatus = { connection: null, queue: null };

export function useAutoSheetSync(clientId: string, spreadsheetId: string, enabled = true,
  onCreated?: (spreadsheetId: string) => void) {
  const userId = useContext(AppContext)?.cloud.userId ?? null;
  const [status, setStatus] = useState<AutoStatus>(emptyStatus);
  const [statusOwner, setStatusOwner] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase) throw new Error('Bulut bağlantısı ayarlı değil.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Önce bulut hesabına giriş yap.');
    const { data, error: invokeError } = await supabase.functions.invoke('sheets-auto-sync', {
      body: { action, ...extra },
      headers: { 'X-Requested-With': 'XmlHttpRequest' },
    });
    if (invokeError) {
      const body = await invokeError.context?.json?.().catch(() => null);
      throw new Error(body?.error ?? invokeError.message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !isSupabaseConfigured || !userId) return;
    try {
      const next = await call('status') as AutoStatus;
      setStatus(next);
      setStatusError(null);
      setStatusOwner(userId);
    } catch (error) {
      if (statusOwner !== userId) setStatus(emptyStatus);
      setStatusError(error instanceof Error ? error.message : 'Bağlantı durumu alınamadı.');
      setStatusOwner(userId);
    }
  }, [call, enabled, userId, statusOwner]);

  useEffect(() => {
    if (!enabled || !userId) return;
    if (clientId) void loadGis().catch(() => {});
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [clientId, refresh, enabled, userId]);

  const connect = (createNew = false) => {
    const targetId = createNew ? '' : spreadsheetId || status.connection?.spreadsheet_id || '';
    if (!clientId || (!createNew && !targetId)) { setError('Önce Sheet adresini ve OAuth istemci kimliğini kaydet.'); return; }
    if (!supabase) { setError('Bulut bağlantısı ayarlı değil.'); return; }
    setError(null);
    setBusy(true);
    const google = window.google;
    if (!google?.accounts?.oauth2) {
      setError('Google bağlantısı hazırlanıyor. Birkaç saniye sonra tekrar dene.');
      setBusy(false);
      return;
    }
    try {
      const appCreatedFile = createNew || (status.connection?.spreadsheet_id === targetId
        && status.connection.access_scope === 'app_files');
      const codeClient = google.accounts.oauth2.initCodeClient({
        client_id: clientId, scope: appCreatedFile ? APP_CREATED_SHEETS_SCOPE : SHEETS_SCOPE, ux_mode: 'popup',
        callback: response => {
          if (!response.code) { setError(response.error ?? 'Google izin vermedi.'); setBusy(false); return; }
          void call('connect', { code: response.code, spreadsheetId: targetId, createNew }).then(async data => {
            if (createNew && data.spreadsheetId) onCreated?.(data.spreadsheetId);
            await refresh();
          }).catch(e => setError(e instanceof Error ? e.message : 'Otomatik bağlantı kurulamadı.'))
            .finally(() => setBusy(false));
        },
        error_callback: e => { setError(e.message ?? e.type ?? 'Google penceresi açılamadı.'); setBusy(false); },
      });
      codeClient.requestCode();
    } catch (e) { setError(e instanceof Error ? e.message : 'Google hazırlanamadı.'); setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true); setError(null);
    try { await call('disconnect'); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Bağlantı kaldırılamadı.'); }
    finally { setBusy(false); }
  };

  const configure = async (selection: { phaseId: string; programId: string | null; weekMode: 'latest' | 'one' | 'all'; weekNumber: number }) => {
    setBusy(true); setError(null);
    try { await call('configure', selection); await refresh(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Aktarım seçimi kaydedilemedi.'); return false; }
    finally { setBusy(false); }
  };

  return { status: statusOwner === userId ? status : emptyStatus,
    ready: Boolean(userId && statusOwner === userId), statusError, busy, error,
    connect, disconnect, configure, refresh };
}
