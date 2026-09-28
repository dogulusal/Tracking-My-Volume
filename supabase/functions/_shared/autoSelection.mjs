// Decisions of the automatic Sheet worker that need no network, kept here so
// Node's regression tests can run them.

/**
 * The scope a new connection and each new phase start with: the whole current
 * phase from its H0, the reference every later week is compared against.
 * Starting at the latest logged week left H0 empty whenever the Sheet was
 * connected mid-phase or the first sync of a phase ran after its second week.
 */
export function followingSelection(currentPhase) {
  return { phaseId: currentPhase.id, programId: null, weekMode: 'all',
    weekNumber: currentPhase.startWeek, followCurrentPhase: true };
}

/**
 * The saved selection a sync uses. One that follows the current phase moves
 * on when a new phase starts. The finished phase keeps its tab as one of the
 * phase tabs (phaseSelections), so nothing leaves the managed tabs here and a
 * retried sync cannot lose it.
 */
export function resolveAutoSelection(previous, currentPhase) {
  const phaseChanged = previous?.followCurrentPhase && previous.phaseId !== currentPhase.id;
  return previous && !phaseChanged ? previous : followingSelection(currentPhase);
}

/**
 * The tabs a sync writes: one per phase that has reached its H0, each with
 * the whole phase, so finished phases stay complete and take later edits to
 * their weeks. The saved selection still decides the tab of the phase it names.
 */
export function phaseSelections(state, selection) {
  return [...(state.phases ?? [])]
    .filter(phase => phase.startWeek <= (state.currentWeek ?? 0))
    .sort((a, b) => a.startWeek - b.startWeek)
    .map(phase => phase.id === selection?.phaseId ? selection
      : { phaseId: phase.id, programId: null, weekMode: 'all', weekNumber: phase.startWeek, followCurrentPhase: false });
}

/**
 * Whether a scope saved on the Export screen moves on with the next phase.
 * "All weeks" of the current phase follows too: it is the whole phase from H0,
 * and without this the tab stayed on the old phase after a new one started.
 */
export function followsCurrentPhase(phaseId, currentPhaseId, weekMode, programId) {
  return phaseId === currentPhaseId && weekMode !== 'one' && !programId;
}

/**
 * Managed tabs of phases that are no longer written are deleted: the phase
 * was removed or merged in the phase settings.
 */
export function dropStaleManagedTabs(managedTabs, keptPhaseIds) {
  /** @type {Record<string, number>} */
  const kept = {};
  /** @type {number[]} */
  const remove = [];
  for (const [phaseId, sheetId] of Object.entries(managedTabs)) {
    if (keptPhaseIds.has(phaseId)) kept[phaseId] = sheetId;
    else remove.push(sheetId);
  }
  return { managedTabs: kept, remove };
}
