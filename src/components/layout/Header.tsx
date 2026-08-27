import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { toggleTheme, isDarkMode } from '@/utils/theme';
import { useCloudSync } from '@/hooks/useCloudSync';
import { CloudSyncModal } from '@/components/shared/CloudSyncModal';
import { ColorThemePicker } from '@/components/shared/ColorThemePicker';

export function Header() {
  const location = useLocation();
  const [dark, setDark] = useState(isDarkMode());
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const { configured, userEmail, githubLogin, syncStatus } = useCloudSync();

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
    ? 'Bulut Kapali'
    : userEmail
      ? (syncStatus === 'synced' ? (githubLogin ?? userEmail) : 'Senkron...')
      : 'Login';
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
          <nav className="hidden md:flex items-center gap-1">
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
              className="lb-press px-3 py-2 rounded-md text-xs md:text-sm font-medium border lb-rule max-w-[120px] md:max-w-none truncate"
            >
              <span className="md:hidden">{mobileCloudLabel}</span>
              <span className="hidden md:inline">{cloudLabel}</span>
            </button>
            <button
              onClick={() => setIsColorPickerOpen(true)}
              className="lb-press p-2 rounded-md"
              aria-label="Renk temasi"
            >
              🎨
            </button>
            <button
              onClick={handleToggle}
              className="lb-press p-2 rounded-md"
              aria-label="Tema degistir"
            >
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>
      <CloudSyncModal isOpen={isCloudModalOpen} onClose={() => setIsCloudModalOpen(false)} />
      {isColorPickerOpen && <ColorThemePicker onClose={() => setIsColorPickerOpen(false)} />}
    </>
  );
}
