import { useEffect } from 'react';
import { useAutoSheetSync } from '@/hooks/useAutoSheetSync';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import { useCloudSync } from '@/hooks/useCloudSync';

/** One-time Google consent; subsequent writes are handled by the server queue. */
export function SheetSetupModal() {
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

  if (!auto.ready) return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-(--color-bg-primary) text-sm text-(--color-text-primary)">
    Sheet bağlantısı kontrol ediliyor…
  </div>;
  if (connection?.status === 'active') return null;

  const needsRenewal = connection?.status === 'reauthorize';
  const existingId = connection?.spreadsheet_id ?? sheets.settings.spreadsheetId;
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="sheet-setup-title"
        className="w-full max-w-md rounded-lg border lb-rule bg-(--color-bg-card) p-6 shadow-2xl">
        <h2 id="sheet-setup-title" className="mb-3 text-lg font-bold">
          {needsRenewal ? 'Google Sheets iznini yenile' : 'Google Sheet dosyanı oluştur'}
        </h2>
        <p className="mb-5 text-sm text-(--color-text-secondary)">
          {needsRenewal
            ? 'Google erişimi sona erdi. Antrenmanlarının otomatik aktarımının sürmesi için izni yeniden ver.'
            : 'Antrenmanların kendi Google Sheet dosyana otomatik aktarılır. Google iznini bir kez verdiğinde dosyan oluşturulur ve sonraki kayıtlar kendiliğinden güncellenir.'}
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
            {!needsRenewal && <button disabled={auto.busy} onClick={() => auto.connect(true)}
              className="lb-press rounded-lg bg-(--color-text-primary) px-4 py-3 text-sm font-semibold text-(--color-bg-primary) disabled:opacity-50">
              {auto.busy ? 'Bağlanıyor…' : 'Google ile devam et ve Sheet oluştur'}
            </button>}
            {existingId && <button disabled={auto.busy} onClick={() => auto.connect()}
              className="lb-press rounded-lg border lb-rule px-4 py-3 text-sm disabled:opacity-50">
              {needsRenewal ? 'Google iznini yenile' : 'Mevcut Sheet dosyamı bağla'}
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
