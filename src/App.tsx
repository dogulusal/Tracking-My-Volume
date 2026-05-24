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

export default function App() {
  const isMobileDevice = useIsMobileDevice();

  return (
    <AppProvider>
      <BrowserRouter>
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
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
