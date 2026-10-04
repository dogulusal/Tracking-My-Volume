import { Link, useLocation } from 'react-router-dom';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { Icon } from '@/components/shared/Icon';
import { SheetLink } from '@/components/shared/SheetLink';
import { useCoach } from '@/coach/store';

const tabs = [
  { to: '/', icon: 'home', label: 'Bugün' },
  { to: '/programs', icon: 'programs', label: 'Programlar' },
  { to: '/history', icon: 'history', label: 'Geçmiş' },
  { to: '/charts', icon: 'chart', label: 'Grafikler' },
] as const;

/** Tabs on the page's own ground; the current one is the bright one. */
export function BottomNav() {
  const location = useLocation();
  const isMobileDevice = useIsMobileDevice();
  // A coach's athletes take the Sheet's place; the Sheet moves to the settings menu.
  const { isCoach, attentionCount } = useCoach();
  const athletesActive = location.pathname.startsWith('/sporcular');

  if (!isMobileDevice) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] bg-(--color-bg-primary) border-t border-(--color-border)">
      <div className="grid grid-cols-5 h-16">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.to || (tab.to !== '/' && location.pathname.startsWith(tab.to));
          return (
            <Link key={tab.to} to={tab.to} aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 whitespace-nowrap ${isActive ? 'text-(--color-text-primary)' : 'text-(--color-text-secondary)'}`}>
              <Icon name={tab.icon} className="w-[22px] h-[22px]" />
              <span className={`text-[12px] leading-none ${isActive ? 'font-semibold' : ''}`}>{tab.label}</span>
            </Link>
          );
        })}
        {isCoach ? (
          <Link to="/sporcular" aria-current={athletesActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-1 whitespace-nowrap ${athletesActive ? 'text-(--color-text-primary)' : 'text-(--color-text-secondary)'}`}>
            <span className="relative">
              <Icon name="people" className="w-[22px] h-[22px]" />
              {attentionCount > 0 && (
                <span aria-label={`${attentionCount} sporcu seni bekliyor`}
                  className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-[18px] text-center bg-(--lb-drop) text-(--color-bg-primary)">
                  {attentionCount}
                </span>
              )}
            </span>
            <span className={`text-[12px] leading-none ${athletesActive ? 'font-semibold' : ''}`}>Sporcular</span>
          </Link>
        ) : (
          // Leaves the app, so it never shows as the current tab.
          <SheetLink className="flex flex-col items-center justify-center gap-1 whitespace-nowrap text-(--color-text-secondary)">
            <Icon name="sheet" className="w-[22px] h-[22px]" />
            <span className="text-[12px] leading-none">Sheet</span>
          </SheetLink>
        )}
      </div>
    </nav>
  );
}
