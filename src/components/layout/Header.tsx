import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { toggleTheme, isDarkMode } from '@/utils/theme';
import { useCloudSync } from '@/hooks/useCloudSync';
import { CloudSyncModal } from '@/components/shared/CloudSyncModal';
import { ColorThemePicker } from '@/components/shared/ColorThemePicker';
import { Icon } from '@/components/shared/Icon';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';

export function Header() {
  const isMobile = useIsMobileDevice();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();
  const [dark, setDark] = useState(isDarkMode());
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const { configured, userEmail, githubLogin, syncStatus, authError } = useCloudSync();

  useEffect(() => {
    setDark(isDarkMode());
  }, []);

  const handleToggle = () => {
    toggleTheme();
    setDark(isDarkMode());
  };

  const navLinks = [
    { to: '/', label: 'Ana Sayfa' },
    { to: '/programs', label: 'Programlar' },
    { to: '/history', label: 'Geçmiş' },
    { to: '/charts', label: 'Grafikler' },
    { to: '/export', label: 'Dışa Aktar' },
  ];

  const cloudLabel = !configured
    ? 'Bulut kapalı'
    : userEmail
      ? (syncStatus === 'syncing' || syncStatus === 'auth_loading' ? 'Senkron...' : (githubLogin ?? userEmail))
      : 'Giriş yap';
  const mobileCloudLabel = cloudLabel.length > 12 ? `${cloudLabel.slice(0, 12)}...` : cloudLabel;

  return (
    <>
      {/* Neutral chrome — no accent tint, no glow. The header is navigation,
          not a place the app has anything to say about your progress. */}
      <header className="bg-(--color-bg-card) border-b lb-rule sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            <span>Tracking</span>
            <span className="text-(--color-accent)">My</span>
            <span>Volume</span>
          </Link>

          {/* Desktop nav — current page marked by an underline, not a fill.
              Accent stays reserved for gain/drop; "where am I" is chrome. */}
          <nav className={`${isMobile ? 'hidden' : 'flex'} items-center gap-1`}>
            {navLinks.map(link => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`lb-press px-3 py-2 rounded-md text-sm border-b-2 transition-colors ${
                    isActive
                      ? 'font-semibold border-(--color-text-primary)'
                      : 'font-medium border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCloudModalOpen(true)}
              title={authError ?? undefined}
              style={syncStatus === 'error' ? { color: 'var(--lb-drop)', borderColor: 'var(--lb-drop)' } : undefined}
              className="lb-press px-3 py-2 rounded-md text-xs md:text-sm font-medium border lb-rule max-w-[120px] md:max-w-none truncate"
            >
              {syncStatus === 'error' && <span aria-hidden="true" className="mr-1">!</span>}
              <span className="md:hidden">{mobileCloudLabel}</span>
              <span className="hidden md:inline">{cloudLabel}</span>
            </button>
            <div className="relative">
            <button className="lb-press p-2.5 rounded-lg border lb-rule" aria-label="Ayarlar" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Icon name="settings" /></button>
            {settingsOpen && <>
            <button className="fixed inset-0 z-40 cursor-default" aria-label="Ayarları kapat" onClick={() => setSettingsOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-52 bg-(--color-bg-card) border lb-rule rounded-xl shadow-xl p-2 z-50 flex flex-col gap-1">
            <button
              onClick={() => { setIsColorPickerOpen(true); setSettingsOpen(false); }}
              className="lb-press p-3 rounded-md flex items-center gap-3 text-sm"
              aria-label="Renk teması"
            >
              <Icon name="palette" /> Renk teması
            </button>
            <button
              onClick={handleToggle}
              className="lb-press p-3 rounded-md flex items-center gap-3 text-sm"
              aria-label="Tema değiştir"
            >
              <Icon name={dark ? 'sun' : 'moon'} /> Tema değiştir
            </button>
            <Link to="/export" onClick={() => setSettingsOpen(false)} className="lb-press p-3 rounded-md text-sm">Dışa Aktar →</Link>
            </div></>}
            </div>
          </div>
        </div>
      </header>
      <CloudSyncModal isOpen={isCloudModalOpen} onClose={() => setIsCloudModalOpen(false)} />
      {isColorPickerOpen && <ColorThemePicker onClose={() => setIsColorPickerOpen(false)} />}
    </>
  );
}
