import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppState, WeekLog } from '@/types';

export type CloudWrite = 'written' | 'conflict' | { error: string };

/**
 * Saves `data` over the cloud copy read at `readAt` and over no other: two
 * devices that read the same copy no longer both write, the second silently
 * replacing the first's workout. If another save came in between, nothing is
 * written ('conflict'); the caller reads again and merges. With no row read
 * the row is created, and one created meanwhile is a conflict too.
 */
export async function writeOverRead(client: SupabaseClient, userId: string, data: AppState, now: string, readAt: string | null): Promise<CloudWrite> {
  const table = client.from('user_states');
  const { data: rows, error } = readAt
    ? await table.update({ data, updated_at: now }).eq('user_id', userId).eq('updated_at', readAt).select('user_id')
    : await table.insert({ user_id: userId, data, updated_at: now }).select('user_id');
  // 23505: the row another device created after this one found none.
  if (error) return error.code === '23505' ? 'conflict' : { error: error.message };
  return rows?.length ? 'written' : 'conflict';
}

/**
 * What this device knows about its last round trip with the cloud. It lives in
 * localStorage, not in memory, because the case it exists for — a workout saved
 * at the gym with no signal — usually ends with the OS killing the app before
 * the upload ever succeeds.
 */
export interface SyncMeta {
  userId: string;
  /** updated_at of the cloud row this device's data was last in step with. */
  cloudUpdatedAt: string | null;
  /** Time of the latest local edit not yet in the cloud; null when there is none. */
  localEditAt: string | null;
}

export type SyncPlan = 'adopt' | 'push' | 'merge';

const sameInstant = (a: string | null, b: string | null) =>
  a !== null && b !== null && Date.parse(a) === Date.parse(b);

/**
 * adopt: nothing local is waiting — the cloud copy wins, as it always did.
 * push:  local edits sit on top of the cloud copy this device last saw.
 * merge: local edits and a newer cloud write from another device both exist.
 */
export function planSync(meta: SyncMeta | null, userId: string, cloudUpdatedAt: string | null, hasCloudState: boolean): SyncPlan {
  if (!meta || meta.userId !== userId || !meta.localEditAt) return 'adopt';
  if (!hasCloudState || sameInstant(cloudUpdatedAt, meta.cloudUpdatedAt)) return 'push';
  return 'merge';
}

const logKey = (log: WeekLog) => `${log.programId}\u0000${log.weekNumber}`;
const editedAt = (log: WeekLog) => Date.parse(log.updatedAt) || 0;

/**
 * Workouts are merged per program and week, newest save winning, so neither
 * device loses a logged session. Everything else comes from whichever side was
 * edited last. A log deleted on one device but still present on the other
 * survives: an extra row is recoverable, a lost workout is not.
 */
export function mergeStates(local: AppState, cloud: AppState, localEditAt: string, cloudUpdatedAt: string): AppState {
  const localIsNewer = Date.parse(localEditAt) >= Date.parse(cloudUpdatedAt);
  const base = localIsNewer ? local : cloud;
  const other = localIsNewer ? cloud : local;
  const logs = new Map(base.weekLogs.map(log => [logKey(log), log]));
  for (const log of other.weekLogs) {
    const kept = logs.get(logKey(log));
    if (!kept || editedAt(log) > editedAt(kept)) logs.set(logKey(log), log);
  }
  // Measurements likewise, per day: a weight taken offline is not lost to a
  // newer save from another device. The same day on both sides keeps base's.
  const days = new Map((base.bodyMeasurements ?? []).map(entry => [entry.date, entry]));
  for (const entry of other.bodyMeasurements ?? []) if (!days.has(entry.date)) days.set(entry.date, entry);
  const bodyMeasurements = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { ...base, weekLogs: [...logs.values()], ...(bodyMeasurements.length ? { bodyMeasurements } : {}) };
}
