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
      <header className="bg-gradient-to-b from-(--color-accent-glow) to-transparent border-b border-(--color-border) sticky top-0 z-50 backdrop-blur-sm pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="text-lg font-extrabold tracking-tight">
          <span className="text-(--color-text-primary)">Tracking</span>
          <span className="text-(--color-accent) neon-glow">My</span>
          <span className="text-(--color-text-primary)">Volume</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                location.pathname === link.to
                  ? 'bg-(--color-accent)/15 text-(--color-text-primary)'
                  : 'text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-btn-bg)'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCloudModalOpen(true)}
              className="px-3 py-2 rounded-md text-xs md:text-sm font-semibold text-(--color-text-primary) bg-(--color-btn-bg) hover:bg-(--color-btn-hover) transition-colors max-w-[120px] md:max-w-none truncate"
            >
              <span className="md:hidden">{mobileCloudLabel}</span>
              <span className="hidden md:inline">{cloudLabel}</span>
            </button>
            <button
              onClick={() => setIsColorPickerOpen(true)}
              className="p-2 rounded-md hover:bg-(--color-btn-bg) transition-colors"
              aria-label="Renk temasi"
            >
              🎨
            </button>
            <button
              onClick={handleToggle}
              className="p-2 rounded-md hover:bg-(--color-btn-bg) transition-colors text-(--color-text-primary)"
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
