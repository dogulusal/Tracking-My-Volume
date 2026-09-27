import { createContext, useReducer, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { isAuthRetryableFetchError, type User } from '@supabase/supabase-js';
import type { AppState, AppAction } from '@/types';
import { appReducer, initialState } from './appReducer';
import { applyMigrations, CURRENT_DATA_VERSION } from '@/data/migrations';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { authRedirectUrl } from '@/utils/authRedirect';
import { mergeStates, planSync, type SyncMeta } from '@/utils/cloudSync';

const STORAGE_KEY = 'workout-tracker';
const LOCAL_OWNER_KEY = 'workout-tracker-owner';
const LOCAL_OWNER_EMAIL_KEY = 'workout-tracker-owner-email';
const SYNC_META_KEY = 'workout-tracker-sync-meta';
const GUEST_BACKUP_KEY = 'workout-tracker-guest-backup';
const CLOUD_SYNC_DEBOUNCE_MS = 1200;
const PERIODIC_SYNC_MS = 45000;
const FOREGROUND_SYNC_THROTTLE_MS = 1500;
// How long a first cloud read may hang on a weak signal before this device's
// own copy is shown instead.
const LOCAL_FALLBACK_MS = 4000;
const OFFLINE_MESSAGE = 'Bağlantı yok. Değişiklikler bu cihazda saklanıyor, bağlantı gelince gönderilecek.';

type CloudSyncStatus = 'disabled' | 'auth_loading' | 'signed_out' | 'syncing' | 'synced' | 'error';
type SyncResult = { ok: boolean; message: string };

export interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  cloud: {
    configured: boolean;
    userEmail: string | null;
    userId: string | null;
    hydrated: boolean;
    githubLogin: string | null;
    syncStatus: CloudSyncStatus;
    lastSyncedAt: string | null;
    authError: string | null;
    signInWithGithub: () => Promise<{ ok: boolean; message: string }>;
    signInWithGoogle: () => Promise<{ ok: boolean; message: string }>;
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

function readSyncMeta(): SyncMeta | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? 'null') as SyncMeta | null;
    return parsed && typeof parsed.userId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeSyncMeta(meta: SyncMeta | null) {
  if (meta) localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  else localStorage.removeItem(SYNC_META_KEY);
}

function loadLocalState(): AppState {
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
  return { ...initialState, dataVersion: CURRENT_DATA_VERSION };
}

// Every local dispatch carries a revision, even one the app reducer ignores, so
// the sync can tell whether the state it is about to send includes every edit.
interface Tracked { state: AppState; revision: number }
function trackedReducer(current: Tracked, update: { action: AppAction; revision: number }): Tracked {
  const state = appReducer(current.state, update.action);
  const revision = Math.max(current.revision, update.revision);
  return state === current.state && revision === current.revision ? current : { state, revision };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Set when the stored session cannot be refreshed for lack of signal. The
  // device still knows whose data it holds, so the app opens on that data and
  // the session refreshes by itself once there is a connection.
  const [offlineUserId, setOfflineUserId] = useState<string | null>(null);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(isSupabaseConfigured ? 'auth_loading' : 'disabled');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(isSupabaseConfigured);
  const lastCloudTimestampRef = useRef<string | null>(null);
  const lastForegroundPullRef = useRef(0);
  const localRevisionRef = useRef(0);
  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSyncRef = useRef<(() => Promise<SyncResult>) | null>(null);

  const identity = user?.id ?? offlineUserId;
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const [tracked, trackedDispatch] = useReducer(trackedReducer, undefined, () => ({ state: loadLocalState(), revision: 0 }));
  const state = tracked.state;
  const latestRef = useRef<Tracked>(tracked);

  useEffect(() => {
    latestRef.current = tracked;
  }, [tracked]);

  // Auto-save to localStorage on every state change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  /** Cloud data applied locally is not a local edit and is never sent back. */
  const applyRemote = useCallback((action: AppAction) => {
    trackedDispatch({ action, revision: 0 });
  }, []);

  const dispatch = useCallback((action: AppAction) => {
    const revision = ++localRevisionRef.current;
    const owner = identityRef.current;
    if (isSupabaseConfigured && owner) {
      // Written before anything else so the edit is known to be unsent even if
      // the app is killed before the upload finishes.
      const meta = readSyncMeta();
      writeSyncMeta({
        userId: owner,
        cloudUpdatedAt: meta?.userId === owner ? meta.cloudUpdatedAt : null,
        localEditAt: new Date().toISOString(),
      });
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        syncTimerRef.current = null;
        void runSyncRef.current?.();
      }, CLOUD_SYNC_DEBOUNCE_MS);
    }
    trackedDispatch({ action, revision });
  }, []);

  const syncFailed = useCallback((userId: string, message: string): SyncResult => {
    const offline = !navigator.onLine || /fetch|network/i.test(message);
    setAuthError(offline ? OFFLINE_MESSAGE : message);
    setSyncStatus('error');
    // Signal or no signal, this device's own copy is still the user's to work with.
    if (localStorage.getItem(LOCAL_OWNER_KEY) === userId) setHydratedUserId(userId);
    return { ok: false, message: offline ? OFFLINE_MESSAGE : `Bulutla eşitlenemedi: ${message}` };
  }, []);

  const syncSucceeded = useCallback((current: User, cloudAt: string | null, pendingEditAt: string | null, message: string): SyncResult => {
    localStorage.setItem(LOCAL_OWNER_KEY, current.id);
    if (current.email) localStorage.setItem(LOCAL_OWNER_EMAIL_KEY, current.email);
    writeSyncMeta({ userId: current.id, cloudUpdatedAt: cloudAt, localEditAt: pendingEditAt });
    lastCloudTimestampRef.current = cloudAt;
    setLastSyncedAt(cloudAt);
    setHydratedUserId(current.id);
    setSyncStatus('synced');
    setAuthError(null);
    return { ok: true, message };
  }, []);

  const syncOnce = useCallback(async (current: User): Promise<SyncResult> => {
    const client = supabase!;
    const revisionAtStart = localRevisionRef.current;
    setSyncStatus('syncing');
    const { data, error } = await client
      .from('user_states')
      .select('data, updated_at')
      .eq('user_id', current.id)
      .maybeSingle();
    if (error) return syncFailed(current.id, error.message);

    const rawCloudState: unknown = data?.data;
    const cloudState = isLikelyAppState(rawCloudState) ? applyMigrations(rawCloudState) : null;
    const remoteAt: string | null = data?.updated_at ?? null;
    const meta = readSyncMeta();
    const plan = planSync(meta, current.id, remoteAt, Boolean(cloudState));

    if (plan === 'adopt') {
      // A read started before a local edit must never undo that edit.
      if (revisionAtStart !== localRevisionRef.current) return { ok: false, message: 'Yerel değişiklikler korunuyor.' };
      if (cloudState) {
        if (JSON.stringify(cloudState) !== JSON.stringify(latestRef.current.state)) {
          applyRemote({ type: 'IMPORT_DATA', payload: cloudState });
        }
      } else if (localStorage.getItem(LOCAL_OWNER_KEY) !== current.id) {
        // A new account must never inherit the previous account's local workout data.
        if (!localStorage.getItem(LOCAL_OWNER_KEY)) {
          localStorage.setItem(GUEST_BACKUP_KEY, JSON.stringify(latestRef.current.state));
        }
        applyRemote({ type: 'RESET_DATA' });
      }
      return syncSucceeded(current, remoteAt, null, 'Buluttan en güncel veri alındı.');
    }

    // The copy sent must contain every edit made so far; if one has not
    // rendered yet, the sync it scheduled will send it.
    if (latestRef.current.revision !== localRevisionRef.current) {
      return { ok: false, message: 'Yerel değişiklikler korunuyor.' };
    }
    const { revision } = latestRef.current;
    let toSave = latestRef.current.state;
    if (plan === 'merge' && cloudState && meta?.localEditAt) {
      toSave = mergeStates(toSave, cloudState, meta.localEditAt, remoteAt ?? meta.localEditAt);
      applyRemote({ type: 'IMPORT_DATA', payload: toSave });
    }
    const now = new Date().toISOString();
    const { error: saveError } = await client
      .from('user_states')
      .upsert({ user_id: current.id, data: toSave, updated_at: now }, { onConflict: 'user_id' });
    if (saveError) return syncFailed(current.id, saveError.message);

    const pendingEditAt = localRevisionRef.current === revision ? null : readSyncMeta()?.localEditAt ?? now;
    return syncSucceeded(current, now, pendingEditAt, plan === 'merge'
      ? 'Bu cihazdaki ve buluttaki değişiklikler birleştirildi.'
      : 'Bu cihazdaki değişiklikler buluta gönderildi.');
  }, [applyRemote, syncFailed, syncSucceeded]);

  /** One sync at a time; a request arriving mid-sync runs once more afterwards. */
  const runSync = useCallback(async (): Promise<SyncResult> => {
    if (!isSupabaseConfigured || !supabase) return { ok: false, message: 'Supabase bağlantısı ayarlı değil.' };
    if (!user) return { ok: false, message: identityRef.current ? OFFLINE_MESSAGE : 'Bulut verisi için önce giriş yapmalısın.' };
    if (syncingRef.current) {
      syncAgainRef.current = true;
      return { ok: false, message: 'Senkron sürüyor.' };
    }
    syncingRef.current = true;
    try {
      let result: SyncResult;
      do {
        syncAgainRef.current = false;
        result = await syncOnce(user);
      } while (syncAgainRef.current);
      return result;
    } finally {
      syncingRef.current = false;
    }
  }, [user, syncOnce]);
  runSyncRef.current = runSync;

  useEffect(() => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) {
      setSyncStatus('disabled');
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    const owner = localStorage.getItem(LOCAL_OWNER_KEY);
    // Without signal, refreshing an expired session retries with backoff for
    // about 25 s. The gym should not wait for that when this device already
    // holds the account's data.
    const offlineFallback = owner ? setTimeout(() => {
      if (!mounted) return;
      setOfflineUserId(owner);
      setAuthError(OFFLINE_MESSAGE);
      setSyncStatus('error');
    }, navigator.onLine ? LOCAL_FALLBACK_MS : 0) : null;

    client.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (offlineFallback) clearTimeout(offlineFallback);
      const offline = !data.session && error && isAuthRetryableFetchError(error) && owner;
      setOfflineUserId(offline ? owner : null);
      if (offline) {
        setAuthError(OFFLINE_MESSAGE);
        setSyncStatus('error');
      } else if (error) {
        setAuthError(error.message);
        setSyncStatus('error');
      }
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
      if (!data.session?.user && !error) setSyncStatus('signed_out');
    });

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      // getSession() above settles the first state. This event would report
      // "no session" offline for a session that is still stored and valid.
      if (event === 'INITIAL_SESSION') return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
      setOfflineUserId(null);
      if (!session?.user) {
        setHydratedUserId(null);
        setSyncStatus('signed_out');
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Open on this device's own copy when the cloud cannot answer: at once
  // without a session to ask with, after a short wait on a weak signal.
  useEffect(() => {
    if (!identity || hydratedUserId === identity) return;
    if (localStorage.getItem(LOCAL_OWNER_KEY) !== identity) return;
    if (!user) {
      setHydratedUserId(identity);
      return;
    }
    const timer = setTimeout(() => setHydratedUserId(identity), LOCAL_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [identity, user, hydratedUserId]);

  useEffect(() => {
    if (!isSupabaseConfigured || authLoading) return;
    if (!user) {
      if (!offlineUserId) setSyncStatus('signed_out');
      return;
    }
    void runSync();
  }, [authLoading, user, offlineUserId, runSync]);

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
          const last = lastCloudTimestampRef.current;
          if (incoming && last && Date.parse(incoming) <= Date.parse(last)) return;
          void runSync();
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [authLoading, user, runSync]);

  // Coming back to the app, or back into signal, is when an unsent workout
  // most likely gets its chance.
  useEffect(() => {
    const client = supabase;
    if (!isSupabaseConfigured || !client || authLoading || !identity) return;

    const wake = () => {
      if (user) void runSync();
      // An expired session refreshes here and reports back through onAuthStateChange.
      else void client.auth.getSession();
    };
    const runForegroundPull = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastForegroundPullRef.current < FOREGROUND_SYNC_THROTTLE_MS) return;
      lastForegroundPullRef.current = now;
      wake();
    };

    window.addEventListener('focus', runForegroundPull);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', runForegroundPull);
    return () => {
      window.removeEventListener('focus', runForegroundPull);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', runForegroundPull);
    };
  }, [authLoading, identity, user, runSync]);

  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || !user) return;
    const timer = setInterval(() => {
      void runSync();
    }, PERIODIC_SYNC_MS);
    return () => clearInterval(timer);
  }, [authLoading, user, runSync]);

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

  const signInWithGoogle = async (): Promise<{ ok: boolean; message: string }> => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) return { ok: false, message: 'Supabase bağlantısı ayarlı değil.' };
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl(window.location.origin, import.meta.env.BASE_URL) },
    });
    if (error) {
      setAuthError(error.message);
      return { ok: false, message: `Google girişi başlatılamadı: ${error.message}` };
    }
    setAuthError(null);
    return { ok: true, message: 'Google girişine yönlendiriliyorsun.' };
  };

  const signOut = async () => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) return;
    // Signing out clears this device's copy, so unsent workouts go up first —
    // or the sign-out waits for a connection.
    if (readSyncMeta()?.localEditAt && user) await runSync();
    if (readSyncMeta()?.localEditAt) {
      setAuthError('Buluta gönderilmemiş değişiklikler var. Çıkarsan bu cihazdaki değişiklikler silinir; bağlantı gelince tekrar dene.');
      return;
    }
    await client.auth.signOut();
    localStorage.removeItem(LOCAL_OWNER_KEY);
    localStorage.removeItem(LOCAL_OWNER_EMAIL_KEY);
    writeSyncMeta(null);
    applyRemote({ type: 'RESET_DATA' });
    setUser(null);
    setOfflineUserId(null);
    setHydratedUserId(null);
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
          userEmail: user?.email ?? (offlineUserId ? localStorage.getItem(LOCAL_OWNER_EMAIL_KEY) : null),
          userId: identity,
          hydrated: Boolean(identity && hydratedUserId === identity),
          githubLogin: (user?.user_metadata?.user_name as string | undefined) ?? null,
          syncStatus,
          lastSyncedAt,
          authError,
          signInWithGithub,
          signInWithGoogle,
          signOut,
          refreshFromCloud: runSync,
        },
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
