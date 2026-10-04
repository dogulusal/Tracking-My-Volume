import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { toggleTheme, isDarkMode } from '@/utils/theme';
import { useCloudSync } from '@/hooks/useCloudSync';
import { CloudSyncModal } from '@/components/shared/CloudSyncModal';
import { Icon } from '@/components/shared/Icon';
import { SheetLink } from '@/components/shared/SheetLink';
import { InstallAppButton } from '@/components/shared/InstallAppButton';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { AppTour } from '@/components/shared/AppTour';
import { useCoach } from '@/coach/store';

/**
 * Out of the way: on the phone only the account and settings button, each
 * page leads with its own big title. The desktop keeps its links.
 */
export function Header() {
  const isMobile = useIsMobileDevice();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();
  const [dark, setDark] = useState(isDarkMode());
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const { configured, userEmail, syncStatus } = useCloudSync();
  const { isCoach, attentionCount } = useCoach();

  const handleToggle = () => {
    toggleTheme();
    setDark(isDarkMode());
  };

  // Antrenör for everyone: the coach's page is where one starts being a coach.
  const navLinks = [
    { to: '/', label: 'Bugün' },
    { to: '/programs', label: 'Programlar' },
    { to: '/history', label: 'Geçmiş' },
    { to: '/charts', label: 'Grafikler' },
    { to: '/sporcular', label: 'Antrenör' },
  ];

  const account = !configured ? 'Bulut kapalı' : userEmail ?? 'Giriş yap';

  return (
    <>
      <header className="sticky top-0 z-50 pt-[env(safe-area-inset-top)] bg-(--color-bg-primary)">
        <div className="max-w-5xl mx-auto px-2 h-12 flex items-center justify-between gap-3">
          {isMobile ? <span /> : (
            <nav className="flex items-center gap-1 pl-2">
              <Link to="/" className="a-display mr-4 text-[22px]">Volume</Link>
              {navLinks.map(link => (
                <Link key={link.to} to={link.to}
                  className={`px-3 py-2 rounded-lg text-[15px] ${location.pathname === link.to || (link.to === '/sporcular' && location.pathname.startsWith('/sporcular')) ? 'font-semibold' : 'text-(--color-text-secondary)'}`}>
                  {link.label}
                  {link.to === '/sporcular' && attentionCount > 0 && (
                    <span aria-label={`, ${attentionCount} kişi ara verdi ya da başlamadı`}
                      className="ml-1.5 inline-block min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-[18px] text-center align-[2px] bg-(--lb-drop) text-(--color-bg-primary)">
                      {attentionCount}
                    </span>
                  )}
                </Link>
              ))}
              <SheetLink className="px-3 py-2 rounded-lg text-[15px] text-(--color-text-secondary)">Sheet</SheetLink>
            </nav>
          )}
          <div className="relative">
            <button aria-label="Hesap ve ayarlar" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}
              className="relative w-11 h-11 flex items-center justify-center">
              <span className="w-9 h-9 rounded-full bg-(--color-bg-input) flex items-center justify-center">
                <Icon name="settings" className="w-[18px] h-[18px]" />
              </span>
              {syncStatus === 'error' && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-(--lb-drop)" />}
            </button>
            {settingsOpen && <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label="Menüyü kapat" onClick={() => setSettingsOpen(false)} />
              <div className="absolute right-2 top-full mt-1 w-60 a-card p-1.5 shadow-2xl z-50 flex flex-col">
                <button onClick={() => { setIsCloudModalOpen(true); setSettingsOpen(false); }}
                  className="px-3 min-h-12 rounded-xl text-left text-[16px] flex flex-col justify-center">
                  <span>Hesap</span>
                  <span className="text-[13px] text-(--color-text-secondary) truncate">{account}</span>
                </button>
                <button onClick={handleToggle} className="px-3 min-h-12 rounded-xl text-left text-[16px] flex items-center justify-between">
                  {dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
                  <Icon name={dark ? 'sun' : 'moon'} className="w-5 h-5 text-(--color-text-secondary)" />
                </button>
                <Link to="/antrenorum" onClick={() => setSettingsOpen(false)} className="px-3 min-h-12 rounded-xl text-[16px] flex items-center">Antrenörüm</Link>
                {/* On the phone the coach's tab bar has Antrenör where the Sheet was;
                    until then the coach's page is reached from here. */}
                {isMobile && (isCoach
                  ? <SheetLink className="px-3 min-h-12 rounded-xl text-left text-[16px]">Google Sheet</SheetLink>
                  : <Link to="/sporcular" onClick={() => setSettingsOpen(false)} className="px-3 min-h-12 rounded-xl text-[16px] flex items-center">Antrenör sayfası</Link>)}
                <Link to="/export" onClick={() => setSettingsOpen(false)} className="px-3 min-h-12 rounded-xl text-[16px] flex items-center">Yedek ve dışa aktarma</Link>
                <button onClick={() => { setTourOpen(true); setSettingsOpen(false); }} className="px-3 min-h-12 rounded-xl text-left text-[16px]">Uygulama turu</button>
                <InstallAppButton className="px-3 min-h-12 rounded-xl text-left text-[16px]" />
              </div>
            </>}
          </div>
        </div>
      </header>
      <CloudSyncModal isOpen={isCloudModalOpen} onClose={() => setIsCloudModalOpen(false)} />
      {tourOpen && <AppTour onClose={() => setTourOpen(false)} />}
    </>
  );
}
