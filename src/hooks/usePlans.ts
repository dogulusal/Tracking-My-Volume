import { useMemo } from 'react';
import { programVersionAt } from '@/utils/programVersions';
import { useContext } from 'react';
import { AppContext } from '@/context/AppContext';
import type { Plan } from '@/types';

export function usePlans(atWeek?: number) {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('usePlans must be used within AppProvider');
  const { state, dispatch } = ctx;

  const week = atWeek ?? state.currentWeek;
  const scope = useMemo(() => programVersionAt(state, week), [state, week]);
  const activePlan = scope.plans.find(p => p.id === scope.activePlanId) ?? scope.plans[0] ?? null;

  const activePlanPrograms = activePlan
    ? scope.programs.filter(p => activePlan.programIds.includes(p.id))
        .sort((a, b) => activePlan.programIds.indexOf(a.id) - activePlan.programIds.indexOf(b.id))
    : [];

  return {
    plans: scope.plans,
    activePlanId: scope.activePlanId,
    activePlan,
    activePlanPrograms,

    setActivePlan: (id: string) => dispatch({ type: 'SET_ACTIVE_PLAN', atWeek: week, payload: id }),

    addPlan: (name: string, programIds: string[]) => {
      const now = new Date().toISOString();
      const newPlan: Plan = {
        id: crypto.randomUUID(),
        name,
        programIds,
        createdAt: now,
        updatedAt: now,
      };
      dispatch({ type: 'ADD_PLAN', atWeek: week, payload: newPlan });
      dispatch({ type: 'SET_ACTIVE_PLAN', atWeek: week, payload: newPlan.id });
      return newPlan;
    },

    updatePlan: (plan: Plan) => {
      dispatch({ type: 'UPDATE_PLAN', atWeek: week, payload: { ...plan, updatedAt: new Date().toISOString() } });
    },

    deletePlan: (id: string) => {
      dispatch({ type: 'DELETE_PLAN', atWeek: week, payload: id });
    },
  };
}
