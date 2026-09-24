import { Link, useLocation } from 'react-router-dom';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { Icon } from '@/components/shared/Icon';

const tabs = [
  { to: '/', icon: 'home', label: 'Ana Sayfa' },
  { to: '/programs', icon: 'programs', label: 'Programlar' },
  { to: '/history', icon: 'history', label: 'Geçmiş' },
  { to: '/charts', icon: 'chart', label: 'Grafikler' },
] as const;

export function BottomNav() {
  const location = useLocation();
  const isMobileDevice = useIsMobileDevice();

  if (!isMobileDevice) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-(--color-bg-card) border-t lb-rule z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.to ||
            (tab.to !== '/' && location.pathname.startsWith(tab.to));
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={isActive ? 'page' : undefined}
              className={`lb-press flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg ${
                isActive ? 'text-(--color-text-primary)' : 'text-(--color-text-secondary)'
              }`}
            >
              <Icon name={tab.icon} />
              <span className={`text-xs ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
              {/* Small rule instead of an accent fill — "where am I" is
                  navigation state, not a gain/drop signal. */}
              <span
                aria-hidden="true"
                className="h-0.5 w-4 rounded-full mt-0.5"
                style={{ backgroundColor: isActive ? 'currentColor' : 'transparent' }}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
