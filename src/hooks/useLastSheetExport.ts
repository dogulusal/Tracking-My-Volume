import { useCallback, useState } from 'react';

/**
 * Remembers how far the sheet has been brought up to date, so the next export
 * can start where the last one stopped instead of being worked out by hand
 * every time. Both ways out — copying to the clipboard and writing over the
 * API — count as having sent that week.
 */
const KEY = 'trackingVolume_lastSheetExport';

interface LastExport {
  week: number | null;
  at: string | null;
}

const empty: LastExport = { week: null, at: null };

function read(): LastExport {
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return empty;
    const parsed = JSON.parse(saved) as Partial<LastExport>;
    return {
      week: typeof parsed.week === 'number' ? parsed.week : null,
      at: typeof parsed.at === 'string' ? parsed.at : null,
    };
  } catch {
    return empty;
  }
}

export function useLastSheetExport() {
  const [last, setLast] = useState<LastExport>(read);

  const record = useCallback((week: number) => {
    setLast(prev => {
      // Only ever moves forward: re-sending an old range is a correction, not
      // a statement that the sheet has gone backwards.
      const next = { week: Math.max(week, prev.week ?? week), at: new Date().toISOString() };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage refused; the value still holds for this session.
      }
      return next;
    });
  }, []);

  return { lastExport: last, recordExport: record };
}
