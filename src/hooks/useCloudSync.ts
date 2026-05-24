import { useContext } from 'react';
import { AppContext } from '@/context/AppContext';

export function useCloudSync() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useCloudSync must be used within AppProvider');
  return ctx.cloud;
}
