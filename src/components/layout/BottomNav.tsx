import { Link, useLocation } from 'react-router-dom';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';

const tabs = [
  { to: '/', icon: '🏠', label: 'Ana Sayfa' },
  { to: '/programs', icon: '📋', label: 'Programlar' },
  { to: '/history', icon: '📊', label: 'Geçmiş' },
  { to: '/charts', icon: '📈', label: 'Grafikler' },
];

export function BottomNav() {
  const location = useLocation();
  const isMobileDevice = useIsMobileDevice();

  if (!isMobileDevice) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-(--color-bg-card) border-t border-(--color-border) z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.to ||
            (tab.to !== '/' && location.pathname.startsWith(tab.to));
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-all ${
                isActive
                  ? 'text-(--color-accent) scale-110'
                  : 'text-(--color-text-muted) hover:text-(--color-text-primary)'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-xs font-bold">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
