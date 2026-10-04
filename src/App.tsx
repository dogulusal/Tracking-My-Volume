import { BrowserRouter, MemoryRouter, Routes, Route, useLocation, useParams } from 'react-router-dom';
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
import { CoachProvider, useCoach } from '@/coach/store';
import { CommentsContext } from '@/coach/comments';
import { AthleteDayEditor } from '@/coach/AthleteProgram';
import { Library } from '@/coach/Library';
import { Athletes } from '@/coach/Athletes';
import { AthleteDetail } from '@/coach/AthleteDetail';
import { JoinCoach } from '@/coach/JoinCoach';
import { MyCoach } from '@/coach/MyCoach';
import { DEMO, DemoBar } from '@/coach/demo/DemoBar';

// A workout page belongs to one day and week: moving to another (e.g. on to
// the next week) starts it afresh instead of carrying the last one's state.
function WorkoutRoute() {
  const { programId, weekNumber } = useParams();
  return <WorkoutEntry key={`${programId}:${weekNumber}`} />;
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

  if (configured && !userId) {
    return syncStatus === 'auth_loading'
      ? <div className="logbook flex min-h-screen items-center justify-center bg-(--color-bg-primary) text-(--color-text-primary)">Oturum kontrol ediliyor…</div>
      : <LoginPromptModal />;
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
          <Route path="/sporcular/kutuphane" element={<Library />} />
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
