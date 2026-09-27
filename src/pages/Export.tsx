import { useRef, useState } from 'react';
import { useExportImport } from '@/hooks/useExportImport';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import { useAutoSheetSync } from '@/hooks/useAutoSheetSync';
import { useCloudSync } from '@/hooks/useCloudSync';
import { PageContainer } from '@/components/layout/PageContainer';
import { Modal } from '@/components/shared/Modal';

const AUTO_SYNC_ENABLED = import.meta.env.VITE_SHEETS_AUTO_SYNC_ENABLED !== 'false';

const syncTime = (iso: string) => new Date(iso).toLocaleString('tr-TR',
  { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * Workouts reach the cloud and the Sheet on their own after every save, so
 * this page only says where the Sheet is and whether it is up to date, and
 * keeps a backup file for the day something goes wrong.
 */
export function Export() {
  const { exportAll, importData, resetAll } = useExportImport();
  const { configured } = useCloudSync();
  // The Sheet is written by the cloud worker; without a cloud there is none.
  const showSheet = configured && AUTO_SYNC_ENABLED;
  const sheets = useGoogleSheets();
  const auto = useAutoSheetSync(sheets.settings.clientId, sheets.settings.spreadsheetId, showSheet,
    spreadsheetId => sheets.setSettings({ spreadsheetId }));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const connection = auto.status.connection;
  const queue = auto.status.queue;
  const spreadsheetId = connection?.spreadsheet_id || sheets.settings.spreadsheetId;
  const failure = queue?.last_error ?? connection?.last_error;
  const sheetStatus = !auto.ready ? 'Durum kontrol ediliyor…'
    : !connection ? 'Sheet bağlı değil.'
    : connection.status === 'reauthorize' ? 'Google izni sona erdi. İzni yenileyene kadar Sheet güncellenmez.'
    : queue?.status === 'pending' || queue?.status === 'processing' ? 'Son kayıt aktarılıyor…'
    : failure ? `Son aktarım başarısız: ${failure} Kendiliğinden yeniden denenecek.`
    : connection.last_synced_at ? `Güncel · son aktarım ${syncTime(connection.last_synced_at)}`
    : 'İlk aktarım bekleniyor.';

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const result = importData(event.target?.result as string);
      setMessage(result.success
        ? { ok: true, text: 'Yedek yüklendi.' }
        : { ok: false, text: result.error || 'Yedek okunamadı.' });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <PageContainer>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Dışa Aktar</h1>
      <div className="max-w-lg">
        {showSheet && (
          <section className="py-5 border-b lb-rule">
            <h2 className="text-base font-semibold">Google Sheet</h2>
            <p className="mt-1 text-sm text-(--color-text-secondary)">
              Her kayıttan sonra Sheet’in kendiliğinden güncellenir. Yeni faza geçince o fazın sekmesi açılır;
              biten fazın sekmesi son haliyle kalır.
            </p>
            <p role="status" className="mt-3 text-sm">{sheetStatus}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {spreadsheetId && (
                <a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`}
                  target="_blank" rel="noreferrer"
                  className="lb-press px-5 py-2.5 bg-(--color-text-primary) text-(--color-bg-primary) text-sm font-semibold rounded-lg">
                  Sheet’i aç ↗
                </a>
              )}
              {connection?.status === 'reauthorize' && (
                <button disabled={auto.busy} onClick={() => auto.connect()}
                  className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg disabled:opacity-50">
                  {auto.busy ? 'Bağlanıyor…' : 'İzni yenile'}
                </button>
              )}
            </div>
            {auto.error && <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--lb-drop)' }}>{auto.error}</p>}
          </section>
        )}

        <section className="py-5 border-b lb-rule">
          <h2 className="text-base font-semibold">Yedek</h2>
          <p className="mt-1 text-sm text-(--color-text-secondary)">
            Verin her kayıtta buluta da gider. Bu dosya, bir şey ters giderse geri dönebilmen için.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => { exportAll(); setMessage({ ok: true, text: 'Yedek indirildi.' }); }}
              className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg">
              Yedeği indir
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg">
              Yedekten yükle
            </button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImport} className="hidden" />
          </div>
          <p className="lb-label mt-2">Yüklenen yedek şu anki verinin yerine geçer; öncesinde şu anki halin ayrıca indirilir.</p>
          {message && (
            <p role="status" className="mt-3 text-sm" style={{ color: message.ok ? 'var(--lb-gain)' : 'var(--lb-drop)' }}>
              {message.text}
            </p>
          )}
        </section>

        <section className="py-5">
          <button onClick={() => setConfirmReset(true)} className="lb-press text-sm underline underline-offset-2"
            style={{ color: 'var(--lb-drop)' }}>
            Tüm veriyi sil…
          </button>
        </section>
      </div>

      <Modal
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetAll();
          setConfirmReset(false);
          setMessage({ ok: true, text: 'Tüm veriler silindi. Silmeden önceki hali yedek olarak indirildi.' });
        }}
        title="Tüm veri silinsin mi?"
        message="Tüm programlar ve antrenman kayıtları silinecek. Silmeden önce şu anki halin yedek olarak indirilir."
        confirmText="Evet, sil"
        confirmVariant="danger"
      />
    </PageContainer>
  );
}
