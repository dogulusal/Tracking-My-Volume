import { useContext } from 'react';
import { AppContext } from '@/context/AppContext';
import type { WeekLog } from '@/types';

export function useWeekLogs() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useWeekLogs must be used within AppProvider');
  const { state, dispatch } = ctx;

  return {
    weekLogs: state.weekLogs,
    currentWeek: state.currentWeek,

    saveWorkout: (log: Omit<WeekLog, 'id'>) => {
      const existing = state.weekLogs.find(
        w => w.programId === log.programId && w.weekNumber === log.weekNumber
      );
      if (existing) {
        dispatch({
          type: 'UPDATE_WORKOUT',
          payload: { ...log, id: existing.id, updatedAt: new Date().toISOString() },
        });
      } else {
        dispatch({
          type: 'SAVE_WORKOUT',
          payload: { ...log, id: crypto.randomUUID(), updatedAt: new Date().toISOString() },
        });
      }
    },

    deleteWorkout: (id: string) => {
      dispatch({ type: 'DELETE_WORKOUT', payload: id });
    },

    getLogsForProgram: (programId: string) =>
      state.weekLogs
        .filter(w => w.programId === programId)
        .sort((a, b) => a.weekNumber - b.weekNumber),

    getLogForWeek: (programId: string, weekNumber: number) =>
      state.weekLogs.find(w => w.programId === programId && w.weekNumber === weekNumber),

    getPreviousLog: (programId: string, weekNumber: number) =>
      state.weekLogs
        .filter(w => w.programId === programId && w.weekNumber < weekNumber)
        .sort((a, b) => b.weekNumber - a.weekNumber)[0] || null,

    incrementWeek: () => dispatch({ type: 'INCREMENT_WEEK' }),
    setWeek: (n: number) => dispatch({ type: 'SET_WEEK', payload: n }),
    setHoliday: (programId: string, weekNumber: number) =>
      dispatch({ type: 'SET_HOLIDAY', payload: { programId, weekNumber } }),
  };
}
