import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AppContext } from '@/context/AppContext';
import { useAutoSheetSync } from '@/hooks/useAutoSheetSync';
import { sheetOffer } from '@/utils/sheetOffer';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import { useCloudSync } from '@/hooks/useCloudSync';

interface SheetRenewal { renew: () => void; busy: boolean; error: string | null }
const SheetRenewalContext = createContext<SheetRenewal | null>(null);

// Someone trying the app may not want a Sheet (or Google may not let them
// connect yet). "Not now" is remembered per account on this device; the
// Export page can still connect one later.
const skipKey = (userId: string) => `sheet-setup-skipped:${userId}`;
function readSkipped(userId: string | null): boolean {
  if (!userId) return false;
  try { return localStorage.getItem(skipKey(userId)) === '1'; } catch { return false; }
}

/**
 * One-time Google consent; subsequent writes are handled by the server queue.
 * Never a gate: the app is always there, and the Sheet is offered once the
 * first workout is saved (see sheetOffer).
 */
export function SheetSetupModal({ children }: { children: ReactNode }) {
  const { userEmail, userId } = useCloudSync();
  const ctx = useContext(AppContext);
  const { pathname } = useLocation();
  const [skippedFor, setSkippedFor] = useState<string | null>(() => readSkipped(userId) ? userId : null);
  const skipped = Boolean(userId) && (skippedFor === userId || readSkipped(userId));
  const sheets = useGoogleSheets();
  const auto = useAutoSheetSync(sheets.settings.clientId, sheets.settings.spreadsheetId,
    true, spreadsheetId => sheets.setSettings({ spreadsheetId }));
  const connection = auto.status.connection;

  useEffect(() => {
    if (connection?.spreadsheet_id && !sheets.settings.spreadsheetId) {
      sheets.setSettings({ spreadsheetId: connection.spreadsheet_id });
    }
  }, [connection?.spreadsheet_id, sheets.settings.spreadsheetId]);

  const offer = sheetOffer({
    known: auto.ready && !auto.statusError,
    status: connection?.status ?? null,
    skipped,
    savedWorkouts: (ctx?.state.weekLogs ?? []).filter(log => !log.isHoliday && log.exercises.length > 0).length,
    inWorkout: pathname.startsWith('/workout/') || pathname === '/baslangic' || pathname.startsWith('/katil/'),
  });
  const skip = () => {
    if (!userId) return;
    try { localStorage.setItem(skipKey(userId), '1'); } catch { /* still skip for this visit */ }
    setSkippedFor(userId);
  };
  const existingId = connection?.spreadsheet_id ?? sheets.settings.spreadsheetId;

  return (
    <SheetRenewalContext.Provider value={offer === 'renew' ? { renew: () => auto.connect(), busy: auto.busy, error: auto.error } : null}>
      {children}
      {offer === 'offer' && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end">
          <button aria-label="Şimdi değil" className="absolute inset-0 bg-black/50 cursor-default" onClick={skip} />
          <div role="dialog" aria-modal="true" aria-labelledby="sheet-setup-title"
            className="relative w-full max-w-xl mx-auto bg-(--color-bg-card) rounded-t-[22px] px-5 pt-5 pb-[calc(24px+env(safe-area-inset-bottom))]">
            <h2 id="sheet-setup-title" className="a-display text-[34px] leading-[1.05]">Antrenmanların Google Sheet’e de yazılsın mı?</h2>
            <p className="mt-2 text-[16px] leading-snug text-(--color-text-secondary)">
              Her kayıt kendi Google Sheet dosyana da kendiliğinden aktarılır; tabloda bakabilir, paylaşabilirsin. Kayıtların zaten uygulamada ve hesabında duruyor.
            </p>
            {userEmail && <p className="mt-2 text-[14px] text-(--color-text-secondary)">
              <span className="text-(--color-text-primary)">{userEmail}</span> hesabıyla bağlanır.
            </p>}
            <div className="mt-5 flex flex-col gap-2">
              <button disabled={auto.busy} onClick={() => auto.connect(true)}
                className="h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold disabled:opacity-50">
                {auto.busy ? 'Bağlanıyor…' : 'Google ile Sheet oluştur'}
              </button>
              {existingId && <button disabled={auto.busy} onClick={() => auto.connect()}
                className="h-12 rounded-2xl bg-(--color-bg-input) text-[16px] font-medium disabled:opacity-50">
                Mevcut Sheet dosyamı bağla
              </button>}
              <button onClick={skip} className="h-12 rounded-2xl text-[16px] text-(--color-text-secondary)">Şimdi değil</button>
            </div>
            {auto.error && <p role="alert" className="mt-3 text-[14px]" style={{ color: 'var(--lb-drop)' }}>{auto.error}</p>}
            <p className="mt-3 text-[13px] leading-snug text-(--color-text-secondary)">
              Yeni dosya için yalnız bu uygulamanın oluşturduğu dosyalara erişim izni istenir. Sonra istersen Yedek sayfasından bağlayabilirsin.
            </p>
          </div>
        </div>
      )}
    </SheetRenewalContext.Provider>
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
