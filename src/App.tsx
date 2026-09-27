import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { useCloudSync } from '@/hooks/useCloudSync';
import { LoginPromptModal } from '@/components/shared/LoginPromptModal';
import { SheetSetupModal } from '@/components/shared/SheetSetupModal';

// Inner component — must be inside AppProvider to access context hooks
function AppContent() {
  const isMobileDevice = useIsMobileDevice();
  const { configured, syncStatus, userId, hydrated, authError, refreshFromCloud, signOut } = useCloudSync();

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

  return (
    <div
      data-mobile-ui={isMobileDevice ? 'true' : 'false'}
      className={`logbook min-h-screen bg-(--color-bg-primary) text-(--color-text-primary) ${
        isMobileDevice ? 'mobile-device-ui' : ''
      }`}
    >
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/programs" element={<ProgramSelect />} />
          <Route path="/programs/edit" element={<ProgramEditor />} />
          <Route path="/programs/edit/:id" element={<ProgramEditor />} />
          <Route path="/workout/:programId/week/:weekNumber" element={<WorkoutEntry />} />
          <Route path="/history" element={<History />} />
          <Route path="/charts" element={<Charts />} />
          <Route path="/export" element={<Export />} />
        </Routes>
      </main>
      <BottomNav />
      {configured && <SheetSetupModal />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      {/* basename must match vite's `base` — on GitHub Pages the app is served
          from /Tracking-My-Volume/, so without it no route ever matches. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AppContent />
      </BrowserRouter>
    </AppProvider>
  );
}
