import { useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AppContext } from '@/context/AppContext';
import { applyMigrations } from '@/data/migrations';
import { makeSampleState } from './seed';

// Set only when building a design preview; the real app never has it.
export const PREVIEW_NAME: string | undefined = import.meta.env.VITE_PREVIEW_NAME || undefined;

/**
 * A strip that says which design this is and that nothing here reaches the
 * real account. With no workouts yet, it offers sample data or the way to
 * bring a copy of the real data over.
 */
export function PreviewBar() {
  const ctx = useContext(AppContext);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // The workout page is full screen in both designs; the strip stays off it.
  if (!PREVIEW_NAME || !ctx || pathname.startsWith('/workout/')) return null;
  const empty = ctx.state.weekLogs.length === 0;

  return (
    <div className="relative z-40 bg-(--color-text-primary) text-(--color-bg-primary)">
      <p className="px-4 py-1 text-xs font-semibold text-center">
        {PREVIEW_NAME} önizlemesi · buradaki kayıtlar gerçek uygulamaya gitmez
      </p>
      {empty && (
        <div className="px-4 pb-3 text-sm">
          <p className="mb-2 text-center">
            Kendi verinle denemek için: gerçek uygulamada Dışa Aktar → Yedeği indir, burada Dışa Aktar → Yedekten yükle.
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => {
                ctx.dispatch({ type: 'IMPORT_DATA', payload: applyMigrations(makeSampleState()) });
                // Off the first-run guide (shown while empty) and onto the filled home page.
                navigate('/', { replace: true });
              }}
              className="px-4 py-2 rounded-lg bg-(--color-bg-primary) text-(--color-text-primary) font-semibold">
              Örnek veriyle doldur
            </button>
            <Link to="/export" className="px-4 py-2 rounded-lg border border-current font-semibold">Yedekten yükle</Link>
          </div>
        </div>
      )}
    </div>
  );
}
