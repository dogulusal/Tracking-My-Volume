import { createContext, useContext } from 'react';

/**
 * A coach's word on one workout of the athlete's week: on one movement of
 * it, or (no exerciseId) on the workout as a whole, like the athlete's own
 * week note. Kept by the athlete's own ids so both sides find it in the
 * same place.
 */
export interface CoachComment {
  id: string;
  programId: string;
  weekNumber: number;
  /** '' for a note on the whole workout. */
  exerciseId: string;
  exerciseName: string;
  /** The day's name, for a note on the whole workout. */
  dayName?: string;
  text: string;
  at: string;
  author: string;
}

export type NewComment = Pick<CoachComment, 'programId' | 'weekNumber' | 'exerciseId' | 'exerciseName' | 'dayName' | 'text'>;

interface CommentsValue {
  list: CoachComment[];
  /** Present only where comments can be written: the coach looking at an athlete. False when it could not be sent. */
  add?: (comment: NewComment) => Promise<boolean>;
}

export const CommentsContext = createContext<CommentsValue>({ list: [] });

export const useComments = () => useContext(CommentsContext);

export const commentsOn = (list: CoachComment[], programId: string, weekNumber: number, exerciseId: string) =>
  list.filter(comment => comment.programId === programId && comment.weekNumber === weekNumber && comment.exerciseId === exerciseId);

/** The coach's notes on a whole workout of one week. */
export const dayNotesOn = (list: CoachComment[], programId: string, weekNumber: number) => commentsOn(list, programId, weekNumber, '');
