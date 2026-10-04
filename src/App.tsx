import { useEffect, useState } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Routes, Route, useLocation, useParams } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { Dashboard } from '@/pages/Dashboard';
import { ProgramSelect } from '@/pages/ProgramSelect';
import { ProgramEditor } from '@/pages/ProgramEditor';
import { WorkoutEntry } from '@/pages/WorkoutEntry';
import { History } from '@/pages/History';
import { Charts } from '@/pages/Charts';
import { Export } from '@/pages/Export';
import { Onboarding } from '@/pages/Onboarding';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { useCloudSync } from '@/hooks/useCloudSync';
import { LoginPromptModal } from '@/components/shared/LoginPromptModal';
import { SheetRenewalNotice, SheetSetupModal } from '@/components/shared/SheetSetupModal';
import { CoachProvider, DEMO, useCoach } from '@/coach/store';
import { CommentsContext } from '@/coach/comments';
import { AthleteDayEditor } from '@/coach/AthleteProgram';
import { Athletes } from '@/coach/Athletes';
import { AthleteDetail } from '@/coach/AthleteDetail';
import { JoinCoach } from '@/coach/JoinCoach';
import { MyCoach } from '@/coach/MyCoach';
import { DemoBar } from '@/coach/demo/DemoBar';

// A workout page belongs to one day and week: moving to another (e.g. on to
// the next week) starts it afresh instead of carrying the last one's state.
function WorkoutRoute() {
  const { programId, weekNumber } = useParams();
  return <WorkoutEntry key={`${programId}:${weekNumber}`} />;
}

// An invite link opened before signing in: kept through Google's sign-in,
// which always comes back to the start page, and opened after it. Kept for a
// day; a link opened and left unanswered does not come back weeks later.
const PENDING_INVITE_KEY = 'tmv-bekleyen-davet';
const PENDING_INVITE_MS = 86400000;
const inviteCodeIn = (pathname: string) => pathname.match(/^\/katil\/([A-Za-z0-9]{4,16})\/?$/)?.[1] ?? null;
function readPendingInvite(): string | null {
  try {
    const [code, at] = (localStorage.getItem(PENDING_INVITE_KEY) ?? '').split('|');
    return code && Date.now() - Number(at) < PENDING_INVITE_MS ? code : null;
  } catch {
    return null;
  }
}

// Inner component — must be inside AppProvider to access context hooks
function AppContent() {
  const isMobileDevice = useIsMobileDevice();
  const { configured, syncStatus, userId, hydrated, authError, refreshFromCloud, signOut } = useCloudSync();
  // The workout page is full screen: its own bar, no tabs.
  const { pathname } = useLocation();
  // The person's own screens show what their coaches wrote; an athlete's
  // screens inside the coach's pages get the coach's side instead.
  const { inbox } = useCoach();
  // The invite answer is full screen too: one question, nothing else to tap.
  const inWorkout = pathname.startsWith('/workout/') || pathname === '/baslangic' || pathname.startsWith('/katil/');
  const [pendingInvite, setPendingInvite] = useState(readPendingInvite);
  const signedOutAtInvite = configured && !userId ? inviteCodeIn(pathname) : null;
  useEffect(() => {
    if (!signedOutAtInvite) return;
    try { localStorage.setItem(PENDING_INVITE_KEY, `${signedOutAtInvite}|${Date.now()}`); } catch { /* the link can be opened again */ }
    setPendingInvite(signedOutAtInvite);
  }, [signedOutAtInvite]);
  // Arrived at the invite, signed in: nothing left to keep.
  const atInvite = pathname.startsWith('/katil/');
  useEffect(() => {
    if (!atInvite || !userId || !pendingInvite) return;
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* read again only within a day */ }
    setPendingInvite(null);
  }, [atInvite, userId, pendingInvite]);

  if (configured && !userId) {
    return syncStatus === 'auth_loading'
      ? <div className="logbook flex min-h-screen items-center justify-center bg-(--color-bg-primary) text-(--color-text-primary)">Oturum kontrol ediliyor…</div>
      : <LoginPromptModal invited={Boolean(signedOutAtInvite)} />;
  }
  if (configured && !hydrated) {
    return <div className="logbook flex min-h-screen items-center justify-center bg-(--color-bg-primary) p-5 text-(--color-text-primary)">
      <div className="text-center">
        <p>{syncStatus === 'error' ? 'Bulut verilerin yüklenemedi.' : 'Verilerin yükleniyor…'}</p>
        {authError && <p role="alert" className="mt-2 text-sm text-amber-300">{authError}</p>}
        {syncStatus === 'error' && <div className="mt-4 flex justify-center gap-4 text-sm underline">
          <button onClick={() => void refreshFromCloud()}>Yeniden dene</button>
          <button onClick={() => void signOut()}>Hesaptan çık</button>
        </div>}
      </div>
    </div>;
  }

  // Before any page: the start page's own redirects (a new person goes to set
  // up a program) must not run first and carry them away from the invite.
  if (pendingInvite && !atInvite) return <Navigate to={`/katil/${pendingInvite}`} replace />;

  const app = (
    <div
      data-mobile-ui={isMobileDevice ? 'true' : 'false'}
      className={`logbook min-h-screen bg-(--color-bg-primary) text-(--color-text-primary) ${
        isMobileDevice ? 'mobile-device-ui' : ''
      }`}
    >
      {DEMO && !pathname.startsWith('/workout/') && <DemoBar />}
      {!inWorkout && <Header />}
      {/* No tab bar on the workout page, so no room kept for it either. */}
      <main className={inWorkout ? 'pb-[env(safe-area-inset-bottom)]!' : undefined}>
        {configured && <SheetRenewalNotice />}
        <CommentsContext.Provider value={{ list: inbox.comments }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/programs" element={<ProgramSelect />} />
          <Route path="/programs/edit" element={<ProgramEditor />} />
          <Route path="/programs/edit/:id" element={<ProgramEditor />} />
          <Route path="/workout/:programId/week/:weekNumber" element={<WorkoutRoute />} />
          <Route path="/history" element={<History />} />
          <Route path="/charts" element={<Charts />} />
          <Route path="/export" element={<Export />} />
          <Route path="/baslangic" element={<Onboarding />} />
          <Route path="/sporcular" element={<Athletes />} />
          <Route path="/sporcular/:id" element={<AthleteDetail />} />
          <Route path="/katil/:code" element={<JoinCoach />} />
          <Route path="/sporcular/:id/gun" element={<AthleteDayEditor />} />
          <Route path="/sporcular/:id/gun/:programId" element={<AthleteDayEditor />} />
          <Route path="/antrenorum" element={<MyCoach />} />
        </Routes>
        </CommentsContext.Provider>
      </main>
      {!inWorkout && <BottomNav />}
    </div>
  );
  return configured ? <SheetSetupModal>{app}</SheetSetupModal> : app;
}

export default function App() {
  return (
    <AppProvider>
      <CoachProvider>
        {DEMO ? (
          // The demo runs as a page inside claude.ai, whose address it cannot
          // own: routes live in memory and it opens on the coach's list.
          <MemoryRouter initialEntries={['/sporcular']}>
            <AppContent />
          </MemoryRouter>
        ) : (
          // basename must match vite's `base` — on GitHub Pages the app is served
          // from /Tracking-My-Volume/, so without it no route ever matches.
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <AppContent />
          </BrowserRouter>
        )}
      </CoachProvider>
    </AppProvider>
  );
}
