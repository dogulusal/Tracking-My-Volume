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
 * The selection a sync writes. One that follows the current phase moves on
 * when a new phase starts. The finished phase's tab leaves `managedTabs` in the
 * same step, so it stays in the file as that phase's record even when this
 * sync fails and a retry no longer sees the phase change. `finished` carries
 * what is needed for one last write to it.
 */
export function resolveAutoSelection(previous, currentPhase, managedTabs) {
  const following = followingSelection(currentPhase);
  const phaseChanged = previous?.followCurrentPhase && previous.phaseId !== currentPhase.id;
  if (previous && !phaseChanged) return { selection: previous, managedTabs, finished: null };
  if (!previous || !(previous.phaseId in managedTabs)) return { selection: following, managedTabs, finished: null };
  const { [previous.phaseId]: sheetId, ...rest } = managedTabs;
  return { selection: following, managedTabs: rest, finished: { selection: previous, sheetId } };
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
 * Managed tabs outside the current selection are deleted: the user changed
 * the scope and the Export screen says the new selection replaces them.
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
