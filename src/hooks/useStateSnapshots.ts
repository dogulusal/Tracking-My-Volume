import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type StateSnapshot = { id: number; taken_at: string; workouts: number; reason: 'daily' | 'shrink' };

/**
 * The cloud's restore points of this user's data (supabase migration
 * user_state_snapshots), newest first. null until loaded, and when the
 * table is not there to read, so the page can leave the list out.
 */
export function useStateSnapshots(enabled: boolean) {
  const [snapshots, setSnapshots] = useState<StateSnapshot[] | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !enabled) return;
    const { data, error } = await supabase
      .from('user_state_snapshots')
      .select('id, taken_at, workouts, reason')
      .order('taken_at', { ascending: false })
      .limit(40);
    setSnapshots(error ? null : (data as StateSnapshot[]));
  }, [enabled]);

  useEffect(() => { void reload(); }, [reload]);

  // The data is only fetched for the copy being restored: each is the whole
  // state, a few hundred kilobytes.
  const fetchData = useCallback(async (id: number): Promise<unknown> => {
    if (!supabase) throw new Error('Bulut bağlı değil.');
    const { data, error } = await supabase.from('user_state_snapshots').select('data').eq('id', id).single();
    if (error) throw new Error(error.message);
    return (data as { data: unknown }).data;
  }, []);

  return { snapshots, reload, fetchData };
}
