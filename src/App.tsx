import { useState } from 'react';
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

// Inner component — must be inside AppProvider to access context hooks
function AppContent() {
  const isMobileDevice = useIsMobileDevice();
  const { configured, syncStatus } = useCloudSync();
  const [loginPromptDismissed, setLoginPromptDismissed] = useState(false);

  // Show login prompt once per session when Supabase is configured but user is signed out
  const showLoginPrompt = configured && syncStatus === 'signed_out' && !loginPromptDismissed;

  return (
    <div
      data-mobile-ui={isMobileDevice ? 'true' : 'false'}
      className={`min-h-screen bg-(--color-bg-primary) text-(--color-text-primary) ${
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
      {showLoginPrompt && (
        <LoginPromptModal onDismiss={() => setLoginPromptDismissed(true)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AppProvider>
  );
}
