import type { AppState, PhaseDefinition } from '@/types';

export function normalizePhaseBoundaries(phases: PhaseDefinition[]): PhaseDefinition[] {
  if (!phases.length) throw new Error('En az bir faz gerekli.');
  const sorted = [...phases].sort((a, b) => a.startWeek - b.startWeek);
  if (sorted[0].startWeek !== 0) throw new Error('İlk faz toplam hafta 0’dan başlamalı.');
  const ids = new Set<string>();
  return sorted.map((phase, index) => {
    if (!phase.name.trim()) throw new Error('Her faza bir ad ver.');
    if (!Number.isInteger(phase.startWeek) || phase.startWeek < 0) throw new Error('Başlangıç haftası sıfır veya pozitif bir tam sayı olmalı.');
    if (ids.has(phase.id)) throw new Error('Faz kimlikleri farklı olmalı.');
    ids.add(phase.id);
    if (index > 0 && sorted[index - 1].startWeek === phase.startWeek) throw new Error('İki faz aynı haftadan başlayamaz.');
    return { ...phase, name: phase.name.trim(), endWeek: sorted[index + 1] ? sorted[index + 1].startWeek - 1 : null };
  });
}

export function nextPhaseStart(state: Pick<AppState, 'currentWeek' | 'weekLogs' | 'phases'>): number {
  return Math.max(state.currentWeek, ...state.weekLogs.map(log => log.weekNumber), ...state.phases.map(phase => phase.endWeek ?? phase.startWeek)) + 1;
}

export function startNextPhase(state: AppState, id: string, startAt: 'next' | 'current' = 'next'): AppState {
  if (state.phases.some(phase => phase.id === id)) return state;
  const startWeek = startAt === 'current' ? state.currentWeek : nextPhaseStart(state);
  // A phase must contain at least one week, and phase ranges must not overlap.
  if (state.phases.some(phase => phase.startWeek >= startWeek)) return state;
  return { ...state, currentWeek: startWeek, phases: [
    ...state.phases.map(phase => phase.endWeek === null || phase.endWeek >= startWeek ? { ...phase, endWeek: startWeek - 1 } : phase),
    { id, name: `Faz ${state.phases.length + 1}`, startWeek, endWeek: null },
  ] };
}
