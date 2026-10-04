import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCoach } from '@/coach/store';

/** Set only when building the coach-mode demo; the real app never has it. */
export const DEMO = import.meta.env.VITE_DEMO === 'antrenor';

/**
 * Says what this is and lets the viewer switch sides: the coach's list, or
 * the athlete who opens the invite link.
 */
export function DemoBar() {
  const coach = useCoach();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [resetting, setResetting] = useState(false);
  const athleteSide = pathname.startsWith('/katil/') || pathname === '/antrenorum';
  const link = 'underline underline-offset-2 min-h-8';
  // Full-screen pages subtract the strip, so their bottom buttons stay on screen.
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty('--demo-bar', `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--demo-bar'); };
  }, []);

  return (
    <div ref={ref} className="relative z-40 bg-(--color-text-primary) text-(--color-bg-primary)">
      <div className="max-w-5xl mx-auto px-4 py-1.5 text-[13px]">
        <p className="font-semibold">Antrenör modu demosu · sporcular örnek, hiçbir şey hesabına gitmez</p>
        {resetting ? (
          <div className="flex flex-wrap items-center gap-x-4">
            <span>Demo baştan başlasın mı?</span>
            <button className={link} onClick={() => { coach.reset(); setResetting(false); navigate('/sporcular'); }}>Evet</button>
            <button className={link} onClick={() => setResetting(false)}>Hayır</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4">
            <button className={`${link} ${athleteSide ? '' : 'font-semibold'}`} onClick={() => navigate('/sporcular')}>Antrenör gözüyle</button>
            <button className={`${link} ${athleteSide ? 'font-semibold' : ''}`} onClick={() => navigate(`/katil/${coach.invites['']}`)}>Sporcu gözüyle: davet linki</button>
            <button className={link} onClick={() => setResetting(true)}>Sıfırla</button>
          </div>
        )}
      </div>
    </div>
  );
}
