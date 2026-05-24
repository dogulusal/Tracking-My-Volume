import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { toggleTheme, isDarkMode } from '@/utils/theme';
import { useCloudSync } from '@/hooks/useCloudSync';
import { CloudSyncModal } from '@/components/shared/CloudSyncModal';

export function Header() {
  const location = useLocation();
  const [dark, setDark] = useState(isDarkMode());
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const { configured, userEmail, syncStatus } = useCloudSync();

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
      ? (syncStatus === 'synced' ? 'Bulut Acik' : 'Senkron')
      : 'Bulut Giris';

  return (
    <>
      <header className="bg-gradient-to-b from-[rgba(16,185,129,0.08)] to-transparent border-b border-(--color-border) sticky top-0 z-50 backdrop-blur-sm">
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
              className="px-3 py-2 rounded-md text-xs md:text-sm font-semibold text-(--color-text-primary) bg-(--color-btn-bg) hover:bg-(--color-btn-hover) transition-colors"
            >
              {cloudLabel}
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
    </>
  );
}
