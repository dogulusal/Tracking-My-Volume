import { useContext } from 'react';
import { AppContext } from '@/context/AppContext';
import type { Plan } from '@/types';

export function usePlans() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('usePlans must be used within AppProvider');
  const { state, dispatch } = ctx;

  const activePlan = state.plans.find(p => p.id === state.activePlanId) ?? state.plans[0] ?? null;

  const activePlanPrograms = activePlan
    ? state.programs.filter(p => activePlan.programIds.includes(p.id))
        .sort((a, b) => activePlan.programIds.indexOf(a.id) - activePlan.programIds.indexOf(b.id))
    : [];

  return {
    plans: state.plans,
    activePlanId: state.activePlanId,
    activePlan,
    activePlanPrograms,

    setActivePlan: (id: string) => dispatch({ type: 'SET_ACTIVE_PLAN', payload: id }),

    addPlan: (name: string, programIds: string[]) => {
      const now = new Date().toISOString();
      const newPlan: Plan = {
        id: crypto.randomUUID(),
        name,
        programIds,
        createdAt: now,
        updatedAt: now,
      };
      dispatch({ type: 'ADD_PLAN', payload: newPlan });
      dispatch({ type: 'SET_ACTIVE_PLAN', payload: newPlan.id });
      return newPlan;
    },

    updatePlan: (plan: Plan) => {
      dispatch({ type: 'UPDATE_PLAN', payload: { ...plan, updatedAt: new Date().toISOString() } });
    },

    deletePlan: (id: string) => {
      dispatch({ type: 'DELETE_PLAN', payload: id });
    },
  };
}
