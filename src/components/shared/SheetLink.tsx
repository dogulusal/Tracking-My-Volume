import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';

const SKIP_CONFIRM_KEY = 'tmv-sheet-skip-confirm';

const readSkip = () => {
  try { return localStorage.getItem(SKIP_CONFIRM_KEY) === '1'; } catch { return false; }
};

/**
 * Opens the user's own Google Sheet in a new tab, after a one-time "you are
 * leaving the app" confirmation. Without a connected Sheet there is nothing
 * to open, so it goes to the Export page where the Sheet is created instead.
 */
export function SheetLink({ className, children, ariaCurrent }: {
  className: string; children: ReactNode; ariaCurrent?: 'page';
}) {
  const { settings } = useGoogleSheets();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const url = settings.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(settings.spreadsheetId)}/edit`
    : null;

  const open = () => {
    if (!url) { navigate('/export'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleClick = () => {
    if (url && !readSkip()) { setDontAsk(false); setConfirming(true); return; }
    open();
  };

  const handleConfirm = () => {
    if (dontAsk) { try { localStorage.setItem(SKIP_CONFIRM_KEY, '1'); } catch { /* per-device convenience only */ } }
    setConfirming(false);
    open();
  };

  return (
    <>
      <button type="button" onClick={handleClick} aria-current={ariaCurrent} className={className}>{children}</button>
      {confirming && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirming(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="sheet-link-title"
            className="relative bg-(--color-bg-card) rounded-lg p-6 max-w-sm w-full border lb-rule shadow-xl">
            <h3 id="sheet-link-title" className="text-lg font-semibold mb-2">Google Sheet açılsın mı?</h3>
            <p className="text-(--color-text-secondary) text-sm mb-4">
              Sheet dosyan yeni sekmede, <span className="text-(--color-text-primary)">docs.google.com</span> adresinde açılacak.
            </p>
            <label className="flex items-center gap-2 text-sm mb-6">
              <input type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.target.checked)} className="w-4 h-4" />
              Bir daha sorma
            </label>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirming(false)} className="lb-press px-4 py-2 rounded-md text-sm font-medium border lb-rule">
                İptal
              </button>
              <button onClick={handleConfirm} className="lb-press px-4 py-2 rounded-md text-sm font-semibold"
                style={{ background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)' }}>
                Aç ↗
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
