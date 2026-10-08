import { useContext, useMemo, type ReactNode } from 'react';
import { AppContext } from '@/context/AppContext';
import { ReadOnlyContext } from '@/context/ReadOnly';
import type { AppAction, AppState } from '@/types';
import { CommentsContext, type CoachComment, type NewComment } from './comments';

const ignore = () => {};

/**
 * Everything inside reads the athlete's record instead of the signed-in
 * person's: the athlete's own screens, shown to the coach as they are.
 * Read-only unless `dispatch` is given, which then receives every change
 * instead of the record (the coach's program edits, sent later as one update).
 */
export function AthleteScope({ state, children, dispatch, comments }: {
  state: AppState;
  children: ReactNode;
  dispatch?: (action: AppAction) => void;
  comments?: { list: CoachComment[]; add: (comment: NewComment) => Promise<boolean> };
}) {
  const parent = useContext(AppContext);
  const value = useMemo(() => parent && { ...parent, state, dispatch: dispatch ?? ignore }, [parent, state, dispatch]);
  const commentValue = useMemo(() => comments ?? { list: [] }, [comments]);
  if (!value) return null;
  return (
    <AppContext.Provider value={value}>
      <ReadOnlyContext.Provider value={!dispatch}>
        <CommentsContext.Provider value={commentValue}>{children}</CommentsContext.Provider>
      </ReadOnlyContext.Provider>
    </AppContext.Provider>
  );
}
