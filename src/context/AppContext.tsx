import { createContext, useReducer, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AppState, AppAction } from '@/types';
import { appReducer, initialState } from './appReducer';
import { applyMigrations, CURRENT_DATA_VERSION } from '@/data/migrations';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { authRedirectUrl } from '@/utils/authRedirect';

const STORAGE_KEY = 'workout-tracker';
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
    githubLogin: string | null;
    syncStatus: CloudSyncStatus;
    lastSyncedAt: string | null;
    authError: string | null;
    signInWithGithub: () => Promise<{ ok: boolean; message: string }>;
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

  const localRevisionRef = useRef(0);
  const pendingLocalChangesRef = useRef(false);
  const [state, reducerDispatch] = useReducer(appReducer, undefined, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppState;
        if (isLikelyAppState(parsed)) {
          cleanOrphanDrafts([...parsed.programs, ...(parsed.programVersions ?? []).flatMap(v => v.programs)]);
          // Run migrations if data is from an older version
          return applyMigrations(parsed);
        }
      }
    } catch {
      // corrupted data — start fresh
    }
    // Personal PDF history is available through the explicit import action.
    return { ...initialState, dataVersion: CURRENT_DATA_VERSION };
  });

  const dispatch = useCallback((action: AppAction) => {
    localRevisionRef.current++;
    pendingLocalChangesRef.current = true;
    reducerDispatch(action);
  }, []);
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

    if (pendingLocalChangesRef.current && hydratedUserIdRef.current === user.id) {
      return { ok: false, message: 'Yerel değişiklikler buluta kaydediliyor.' };
    }
    const revisionAtStart = localRevisionRef.current;
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

    // A read started before a local edit must never undo that edit.
    if (revisionAtStart !== localRevisionRef.current) {
      return { ok: false, message: 'Yerel değişiklikler korunuyor.' };
    }
    const cloudState = data?.data;
    if (isLikelyAppState(cloudState)) {
      const migrated = applyMigrations(cloudState);
      if (JSON.stringify(migrated) !== JSON.stringify(latestStateRef.current)) {
        suppressNextUploadRef.current = true;
        reducerDispatch({ type: 'IMPORT_DATA', payload: migrated });
      }
    }

    pendingLocalChangesRef.current = false;
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
      const revisionBeingSaved = localRevisionRef.current;
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

      if (localRevisionRef.current === revisionBeingSaved) pendingLocalChangesRef.current = false;
      setLastSyncedAt(now);
      lastCloudTimestampRef.current = now;
      setSyncStatus('synced');
      setAuthError(null);
    }, CLOUD_SYNC_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [state, authLoading, user?.id]);

  const signInWithGithub = async (): Promise<{ ok: boolean; message: string }> => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) {
      return { ok: false, message: 'Supabase baglantisi henuz ayarlanmadi.' };
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: authRedirectUrl(window.location.origin, import.meta.env.BASE_URL),
      },
    });

    if (error) {
      setAuthError(error.message);
      return { ok: false, message: `GitHub girisi baslatilamadi: ${error.message}` };
    }

    setAuthError(null);
    return { ok: true, message: 'GitHub girisi icin yonlendiriliyorsun.' };
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
          githubLogin: (user?.user_metadata?.user_name as string | undefined) ?? null,
          syncStatus,
          lastSyncedAt,
          authError,
          signInWithGithub,
          signOut,
          refreshFromCloud: fetchCloudState,
        },
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
