import { useContext, useMemo, type ReactNode } from 'react';
import { AppContext } from '@/context/AppContext';
import { ReadOnlyContext } from '@/context/ReadOnly';
import type { AppState } from '@/types';

const ignore = () => {};

/**
 * Everything inside reads the athlete's record instead of the signed-in
 * person's, and cannot change it: the athlete's own screens, shown to the
 * coach as they are.
 */
export function AthleteScope({ state, children }: { state: AppState; children: ReactNode }) {
  const parent = useContext(AppContext);
  const value = useMemo(() => parent && { ...parent, state, dispatch: ignore }, [parent, state]);
  if (!value) return null;
  return (
    <AppContext.Provider value={value}>
      <ReadOnlyContext.Provider value={true}>{children}</ReadOnlyContext.Provider>
    </AppContext.Provider>
  );
}
