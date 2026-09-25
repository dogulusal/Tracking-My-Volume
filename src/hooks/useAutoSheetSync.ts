import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { loadGis, SHEETS_SCOPE } from '@/lib/googleSheets';

interface AutoStatus {
  connection: { spreadsheet_id: string; status: 'active' | 'reauthorize'; last_error: string | null; last_synced_at: string | null } | null;
  queue: { status: 'pending' | 'processing' | 'error'; last_error: string | null } | null;
}

const emptyStatus: AutoStatus = { connection: null, queue: null };

export function useAutoSheetSync(clientId: string, spreadsheetId: string, enabled = true) {
  const [status, setStatus] = useState<AutoStatus>(emptyStatus);
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
    if (!enabled || !isSupabaseConfigured) return;
    try { setStatus(await call('status') as AutoStatus); }
    catch { setStatus(emptyStatus); }
  }, [call, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (clientId) void loadGis().catch(() => {});
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [clientId, refresh, enabled]);

  const connect = () => {
    if (!clientId || !spreadsheetId) { setError('Önce Sheet adresini ve OAuth istemci kimliğini kaydet.'); return; }
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
      const codeClient = google.accounts.oauth2.initCodeClient({
        client_id: clientId, scope: SHEETS_SCOPE, ux_mode: 'popup',
        callback: response => {
          if (!response.code) { setError(response.error ?? 'Google izin vermedi.'); setBusy(false); return; }
          void call('connect', { code: response.code, spreadsheetId }).then(async () => {
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

  return { status, busy, error, connect, disconnect, refresh };
}
