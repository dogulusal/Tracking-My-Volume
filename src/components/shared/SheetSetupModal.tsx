import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAutoSheetSync } from '@/hooks/useAutoSheetSync';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import { useCloudSync } from '@/hooks/useCloudSync';

interface SheetRenewal { renew: () => void; busy: boolean; error: string | null }
const SheetRenewalContext = createContext<SheetRenewal | null>(null);

/** One-time Google consent; subsequent writes are handled by the server queue. */
export function SheetSetupModal({ children }: { children: ReactNode }) {
  const { signOut, userEmail } = useCloudSync();
  const sheets = useGoogleSheets();
  const auto = useAutoSheetSync(sheets.settings.clientId, sheets.settings.spreadsheetId,
    true, spreadsheetId => sheets.setSettings({ spreadsheetId }));
  const connection = auto.status.connection;

  useEffect(() => {
    if (connection?.spreadsheet_id && !sheets.settings.spreadsheetId) {
      sheets.setSettings({ spreadsheetId: connection.spreadsheet_id });
    }
  }, [connection?.spreadsheet_id, sheets.settings.spreadsheetId]);

  // Sheets mirrors the log; it must never stand between the user and logging.
  // An account that already has a Sheet gets in while its status is unknown
  // (no signal) and when Google asks for a renewed grant mid-workout. Only a
  // confirmed missing connection leads to the setup screen.
  const needsRenewal = connection?.status === 'reauthorize';
  const hasSheet = Boolean(connection?.spreadsheet_id || sheets.settings.spreadsheetId);
  const statusUnknown = !auto.ready || Boolean(auto.statusError);
  if (connection?.status === 'active' || needsRenewal || (statusUnknown && hasSheet)) {
    return (
      <SheetRenewalContext.Provider value={needsRenewal ? { renew: () => auto.connect(), busy: auto.busy, error: auto.error } : null}>
        {children}
      </SheetRenewalContext.Provider>
    );
  }

  if (!auto.ready) return <div className="logbook flex min-h-screen items-center justify-center bg-(--color-bg-primary) text-sm text-(--color-text-primary)">
    Sheet bağlantısı kontrol ediliyor…
  </div>;

  const existingId = connection?.spreadsheet_id ?? sheets.settings.spreadsheetId;
  return (
    <div className="logbook flex min-h-screen items-center justify-center bg-(--color-bg-primary) p-4 text-(--color-text-primary)">
      <div role="dialog" aria-modal="true" aria-labelledby="sheet-setup-title"
        className="w-full max-w-md rounded-lg border lb-rule bg-(--color-bg-card) p-6 shadow-2xl">
        <h2 id="sheet-setup-title" className="mb-3 text-lg font-bold">Google Sheet dosyanı oluştur</h2>
        <p className="mb-5 text-sm text-(--color-text-secondary)">
          Antrenmanların kendi Google Sheet dosyana otomatik aktarılır. Google iznini bir kez verdiğinde dosyan oluşturulur ve sonraki kayıtlar kendiliğinden güncellenir.
        </p>
        {userEmail && <p className="mb-4 text-xs text-(--color-text-secondary)">
          Sheet, giriş yaptığın <strong className="text-(--color-text-primary)">{userEmail}</strong> hesabıyla bağlanacak.
        </p>}
        {auto.statusError ? (
          <button onClick={() => void auto.refresh()} className="lb-press rounded-lg border lb-rule px-4 py-2 text-sm">
            Bağlantıyı yeniden dene
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <button disabled={auto.busy} onClick={() => auto.connect(true)}
              className="lb-press rounded-lg bg-(--color-text-primary) px-4 py-3 text-sm font-semibold text-(--color-bg-primary) disabled:opacity-50">
              {auto.busy ? 'Bağlanıyor…' : 'Google ile devam et ve Sheet oluştur'}
            </button>
            {existingId && <button disabled={auto.busy} onClick={() => auto.connect()}
              className="lb-press rounded-lg border lb-rule px-4 py-3 text-sm disabled:opacity-50">
              Mevcut Sheet dosyamı bağla
            </button>}
          </div>
        )}
        {(auto.error || auto.statusError) &&
          <p role="alert" className="mt-3 text-sm text-amber-300">{auto.error ?? auto.statusError}</p>}
        <p className="mt-4 text-xs text-(--color-text-secondary)">
          Yeni dosya için yalnızca bu uygulamanın oluşturduğu dosyalara erişim izni istenir.
          Bağlantı hesabına bağlı olarak sunucuda saklanır.
        </p>
        <button onClick={() => void signOut()} className="mt-4 text-xs underline">Hesaptan çık</button>
      </div>
    </div>
  );
}

/** Shown above every page while the Sheet grant needs renewing; logging carries on. */
export function SheetRenewalNotice() {
  const renewal = useContext(SheetRenewalContext);
  if (!renewal) return null;
  return (
    <div className="max-w-7xl mx-auto px-4 pt-4">
      <div role="status" className="flex flex-wrap items-center gap-3 border-l-2 border-(--lb-drop) pl-3 py-1">
        <p className="flex-1 min-w-[200px] text-sm text-(--color-text-secondary)">
          Google Sheets izni sona erdi, antrenmanların Sheet'e aktarılmıyor. Kayıtların uygulamada ve bulutta duruyor.
        </p>
        <button disabled={renewal.busy} onClick={renewal.renew}
          className="lb-press px-3 py-1.5 border lb-rule rounded-lg text-xs font-semibold disabled:opacity-50">
          {renewal.busy ? 'Bağlanıyor…' : 'İzni yenile'}
        </button>
      </div>
      {renewal.error && <p role="alert" className="mt-2 text-sm text-amber-300">{renewal.error}</p>}
    </div>
  );
}
