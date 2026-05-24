import { useContext } from 'react';
import { AppContext } from '@/context/AppContext';
import type { Program, ExerciseDefinition } from '@/types';

export function usePrograms() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('usePrograms must be used within AppProvider');
  const { state, dispatch } = ctx;

  return {
    programs: state.programs,

    getProgramById: (id: string) => state.programs.find(p => p.id === id),

    addProgram: (program: Omit<Program, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      dispatch({
        type: 'ADD_PROGRAM',
        payload: {
          ...program,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        },
      });
    },

    updateProgram: (program: Program) => {
      dispatch({
        type: 'UPDATE_PROGRAM',
        payload: { ...program, updatedAt: new Date().toISOString() },
      });
    },

    deleteProgram: (id: string) => {
      dispatch({ type: 'DELETE_PROGRAM', payload: id });
    },

    toggleExercise: (programId: string, exerciseId: string) => {
      const program = state.programs.find(p => p.id === programId);
      if (!program) return;
      const updatedExercises = program.exercises.map((e: ExerciseDefinition) =>
        e.id === exerciseId ? { ...e, isActive: !e.isActive } : e
      );
      dispatch({
        type: 'UPDATE_PROGRAM',
        payload: { ...program, exercises: updatedExercises, updatedAt: new Date().toISOString() },
      });
    },
  };
}
