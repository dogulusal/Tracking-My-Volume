import { useEffect, useState } from 'react';

function detectMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent || '';
  const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrowViewport = window.matchMedia?.('(max-width: 900px)').matches ?? false;

  return uaMobile || (coarsePointer && narrowViewport);
}

export function useIsMobileDevice() {
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(() => detectMobileDevice());

  useEffect(() => {
    const refresh = () => setIsMobileDevice(detectMobileDevice());
    refresh();

    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
    };
  }, []);

  return isMobileDevice;
}
