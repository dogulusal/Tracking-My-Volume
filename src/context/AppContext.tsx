import { createContext, useReducer, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AppState, AppAction } from '@/types';
import { appReducer, initialState } from './appReducer';
import { generatePdfImportData } from '@/data/pdfImportData';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const STORAGE_KEY = 'workout-tracker';
// Increment this when data structure changes that need migration
const CURRENT_DATA_VERSION = 5;
const CLOUD_SYNC_DEBOUNCE_MS = 1200;
const PERIODIC_SYNC_MS = 45000;
const FOREGROUND_SYNC_THROTTLE_MS = 1500;

type CloudSyncStatus = 'disabled' | 'auth_loading' | 'signed_out' | 'syncing' | 'synced' | 'error';

export interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  cloud: {
    configured: boolean;
    userEmail: string | null;
    syncStatus: CloudSyncStatus;
    lastSyncedAt: string | null;
    authError: string | null;
    signInWithGoogle: () => Promise<{ ok: boolean; message: string }>;
    signInWithEmail: (email: string) => Promise<{ ok: boolean; message: string }>;
    signOut: () => Promise<void>;
    refreshFromCloud: () => Promise<{ ok: boolean; message: string }>;
  };
}

export const AppContext = createContext<AppContextValue | null>(null);

function cleanOrphanDrafts(programs: AppState['programs']) {
  const validIds = programs.map(p => p.id);
  Object.keys(localStorage)
    .filter(k => k.startsWith('draft-'))
    .filter(k => !validIds.some(id => k.includes(id)))
    .forEach(k => localStorage.removeItem(k));
}

// Apply data migrations when loading old localStorage data
function applyMigrations(state: AppState): AppState {
  const version = state.dataVersion ?? 1;
  if (version >= CURRENT_DATA_VERSION) return state;

  let s = { ...state, weekLogs: [...state.weekLogs] };

  if (version < 2) {
    // v2: Fix upper1 week 10 → holiday "bayram"; move note to week 11
    s.weekLogs = s.weekLogs.map(log => {
      if (log.programId === 'upper1' && log.weekNumber === 10) {
        return { ...log, exercises: [], isHoliday: true, notes: 'bayram' };
      }
      if (log.programId === 'upper1' && log.weekNumber === 11) {
        return {
          ...log,
          notes: log.notes || 'long ve tricepsleri solla başla önce ve long bicepsi de değiş',
        };
      }
      return log;
    });
  }

  if (version < 3) {
    // v3: Add full Lower1 week 19 data; fix week 18 (H3) hack_squat typo
    const lower1W18 = s.weekLogs.find(log => log.programId === 'lower1' && log.weekNumber === 18);
    if (lower1W18) {
      // Fix week 18 hack_squat to use correct weight prefix in second set
      const fixed18 = lower1W18.exercises.map(ex => ex.exerciseId === 'l1_hack_squat'
        ? { ...ex, sets: ex.sets.map((st, i) => i === 1 ? { ...st, weight: 75 } : st) }
        : ex
      );
      s.weekLogs = s.weekLogs.map(log =>
        log.programId === 'lower1' && log.weekNumber === 18 ? { ...lower1W18, exercises: fixed18 } : log
      );
    }

    const lower1W19 = s.weekLogs.find(log => log.programId === 'lower1' && log.weekNumber === 19);
    const w19Exercises = [
      { exerciseId: 'l1_adduction', exerciseName: 'Adduction Machine', sets: [{ weight: 25, reps: 13, intensity: 'failure' as const }, { weight: 25, reps: 11, intensity: 'failure' as const }] },
      { exerciseId: 'l1_leg_ext',  exerciseName: 'Leg Extension',      sets: [{ weight: 11.25, reps: 10, intensity: 'failure' as const }] },
      { exerciseId: 'l1_leg_curl', exerciseName: 'Leg Curl',           sets: [{ weight: 77.5, reps: 9, intensity: 'failure' as const }, { weight: 77.5, reps: 8, intensity: 'failure' as const }] },
      { exerciseId: 'l1_hack_squat', exerciseName: 'Hack Squat',       sets: [{ weight: 75, reps: 9, intensity: 'failure' as const }, { weight: 75, reps: 10, intensity: 'rir1' as const }] },
      { exerciseId: 'l1_kalf',     exerciseName: 'Kalf',               sets: [{ weight: 110, reps: 15, intensity: 'failure' as const }, { weight: 110, reps: 12, intensity: 'failure' as const }] },
    ];
    if (lower1W19) {
      s.weekLogs = s.weekLogs.map(log =>
        log.programId === 'lower1' && log.weekNumber === 19
          ? { ...lower1W19, exercises: w19Exercises, notes: lower1W19.notes || 'leg extensionda 1.25 daha ekle' }
          : log
      );
    } else {
      s.weekLogs.push({
        id: `lower1_w19`,
        weekNumber: 19,
        programId: 'lower1',
        date: '2025-01-26',
        exercises: w19Exercises,
        notes: 'leg extensionda 1.25 daha ekle',
        isHoliday: false,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (version < 4) {
    // v4: Introduce Plan layer — group all existing programs into a default plan
    if (!s.plans || s.plans.length === 0) {
      const now = new Date().toISOString();
      const defaultPlan: import('@/types').Plan = {
        id: crypto.randomUUID(),
        name: 'Varsayılan Plan',
        programIds: s.programs.map(p => p.id),
        createdAt: now,
        updatedAt: now,
      };
      s = { ...s, plans: [defaultPlan], activePlanId: defaultPlan.id };
    }
  }

  if (version < 5) {
    // v5: Add phases array if missing
    if (!s.phases || s.phases.length === 0) {
      s = {
        ...s,
        phases: [
          { id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: 14 },
          { id: 'phase-2', name: 'Faz 2', startWeek: 15, endWeek: null },
        ],
      };
    }
  }

  return { ...s, dataVersion: CURRENT_DATA_VERSION };
}

function isLikelyAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppState>;
  return Array.isArray(candidate.programs)
    && Array.isArray(candidate.weekLogs)
    && typeof candidate.currentWeek === 'number';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(isSupabaseConfigured ? 'auth_loading' : 'disabled');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(isSupabaseConfigured);
  const hydratedUserIdRef = useRef<string | null>(null);
  const suppressNextUploadRef = useRef(false);
  const lastCloudTimestampRef = useRef<string | null>(null);
  const lastForegroundPullRef = useRef(0);

  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppState;
        if (parsed.programs && parsed.programs.length > 0) {
          cleanOrphanDrafts(parsed.programs);
          // Run migrations if data is from an older version
          return applyMigrations(parsed);
        }
      }
    } catch {
      // corrupted data — start fresh
    }
    // No saved data → load PDF data as starting point (one-time only)
    try {
      const freshData = generatePdfImportData();
      const now = new Date().toISOString();
      const defaultPlan: import('@/types').Plan = {
        id: crypto.randomUUID(),
        name: 'Varsayılan Plan',
        programIds: freshData.programs.map(p => p.id),
        createdAt: now,
        updatedAt: now,
      };
      return { ...freshData, plans: [defaultPlan], activePlanId: defaultPlan.id, phases: initialState.phases, dataVersion: CURRENT_DATA_VERSION };
    } catch {
      return initialState;
    }
  });

  const latestStateRef = useRef<AppState>(state);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  // Auto-save to localStorage on every state change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const fetchCloudState = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) {
      return { ok: false, message: 'Supabase baglantisi ayarli degil.' };
    }
    if (!user) {
      return { ok: false, message: 'Bulut verisi icin once giris yapmalisin.' };
    }

    setSyncStatus('syncing');
    const { data, error } = await client
      .from('user_states')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      setAuthError(error.message);
      setSyncStatus('error');
      return { ok: false, message: `Bulut okunamadi: ${error.message}` };
    }

    const cloudState = data?.data;
    if (isLikelyAppState(cloudState)) {
      const migrated = applyMigrations(cloudState);
      if (JSON.stringify(migrated) !== JSON.stringify(latestStateRef.current)) {
        suppressNextUploadRef.current = true;
        dispatch({ type: 'IMPORT_DATA', payload: migrated });
      }
    }

    hydratedUserIdRef.current = user.id;
    const remoteUpdatedAt = data?.updated_at ?? null;
    setLastSyncedAt(remoteUpdatedAt);
    lastCloudTimestampRef.current = remoteUpdatedAt;
    setSyncStatus('synced');
    setAuthError(null);
    return { ok: true, message: 'Buluttan en guncel veri alindi.' };
  }, [user]);

  useEffect(() => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) {
      setSyncStatus('disabled');
      setAuthLoading(false);
      return;
    }

    let mounted = true;

    client.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setAuthError(error.message);
        setSyncStatus('error');
      }
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
      if (!data.session?.user && !error) setSyncStatus('signed_out');
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (!session?.user) {
        hydratedUserIdRef.current = null;
        setSyncStatus('signed_out');
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!isSupabaseConfigured || !client || authLoading) return;
    if (!user) {
      setSyncStatus('signed_out');
      return;
    }

    void fetchCloudState();
  }, [authLoading, user, fetchCloudState]);

  useEffect(() => {
    const client = supabase;
    if (!isSupabaseConfigured || !client || authLoading || !user) return;

    const channel = client
      .channel(`user-state-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_states',
          filter: `user_id=eq.${user.id}`,
        },
        payload => {
          const incoming = (payload.new as { updated_at?: string } | null)?.updated_at;
          if (incoming && lastCloudTimestampRef.current && incoming <= lastCloudTimestampRef.current) {
            return;
          }
          void fetchCloudState();
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [authLoading, user, fetchCloudState]);

  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || !user) return;

    const runForegroundPull = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastForegroundPullRef.current < FOREGROUND_SYNC_THROTTLE_MS) return;
      lastForegroundPullRef.current = now;
      void fetchCloudState();
    };

    window.addEventListener('focus', runForegroundPull);
    document.addEventListener('visibilitychange', runForegroundPull);
    return () => {
      window.removeEventListener('focus', runForegroundPull);
      document.removeEventListener('visibilitychange', runForegroundPull);
    };
  }, [authLoading, user, fetchCloudState]);

  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || !user) return;
    const timer = setInterval(() => {
      void fetchCloudState();
    }, PERIODIC_SYNC_MS);
    return () => clearInterval(timer);
  }, [authLoading, user, fetchCloudState]);

  useEffect(() => {
    const client = supabase;
    if (!isSupabaseConfigured || !client || authLoading || !user) return;
    if (hydratedUserIdRef.current !== user.id) return;

    if (suppressNextUploadRef.current) {
      suppressNextUploadRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      setSyncStatus('syncing');
      const now = new Date().toISOString();
      const { error } = await client
        .from('user_states')
        .upsert(
          { user_id: user.id, data: state, updated_at: now },
          { onConflict: 'user_id' }
        );

      if (error) {
        setAuthError(error.message);
        setSyncStatus('error');
        return;
      }

      setLastSyncedAt(now);
      lastCloudTimestampRef.current = now;
      setSyncStatus('synced');
      setAuthError(null);
    }, CLOUD_SYNC_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [state, authLoading, user?.id]);

  const signInWithGoogle = async (): Promise<{ ok: boolean; message: string }> => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) {
      return { ok: false, message: 'Supabase baglantisi henuz ayarlanmadi.' };
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
      },
    });

    if (error) {
      setAuthError(error.message);
      return { ok: false, message: `Google girisi baslatilamadi: ${error.message}` };
    }

    setAuthError(null);
    return { ok: true, message: 'Google girisi icin yonlendiriliyorsun.' };
  };

  const signInWithEmail = async (email: string): Promise<{ ok: boolean; message: string }> => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) {
      return { ok: false, message: 'Supabase baglantisi henuz ayarlanmadi.' };
    }
    if (!email) {
      return { ok: false, message: 'Lutfen gecerli bir e-posta gir.' };
    }

    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href,
      },
    });

    if (error) {
      setAuthError(error.message);
      return { ok: false, message: `Giris linki gonderilemedi: ${error.message}` };
    }

    setAuthError(null);
    return { ok: true, message: 'Giris linki e-postana gonderildi.' };
  };

  const signOut = async () => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) return;
    await client.auth.signOut();
    setUser(null);
    setLastSyncedAt(null);
    lastCloudTimestampRef.current = null;
    setSyncStatus('signed_out');
  };

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        cloud: {
          configured: isSupabaseConfigured,
          userEmail: user?.email ?? null,
          syncStatus,
          lastSyncedAt,
          authError,
          signInWithGoogle,
          signInWithEmail,
          signOut,
          refreshFromCloud: fetchCloudState,
        },
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
