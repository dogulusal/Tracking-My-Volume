import { createContext, useContext } from 'react';

/**
 * A coach's comment on one movement of one workout, kept by the athlete's
 * own ids so both sides find it on the same cell.
 */
export interface CoachComment {
  id: string;
  programId: string;
  weekNumber: number;
  exerciseId: string;
  exerciseName: string;
  text: string;
  at: string;
  author: string;
}

export type NewComment = Pick<CoachComment, 'programId' | 'weekNumber' | 'exerciseId' | 'exerciseName' | 'text'>;

interface CommentsValue {
  list: CoachComment[];
  /** Present only where comments can be written: the coach looking at an athlete. */
  add?: (comment: NewComment) => void;
}

export const CommentsContext = createContext<CommentsValue>({ list: [] });

export const useComments = () => useContext(CommentsContext);

export const commentsOn = (list: CoachComment[], programId: string, weekNumber: number, exerciseId: string) =>
  list.filter(comment => comment.programId === programId && comment.weekNumber === weekNumber && comment.exerciseId === exerciseId);
