import type { AccessToken } from '@/lib/googleSheets';

export const GOOGLE_SESSION_EVENT = 'google-sheets-session-changed';
export const TOKEN_SAFETY_MS = 60_000;
const tokens = new Map<string, AccessToken>();
const keyFor = (clientId: string, owner: string) => `trackingVolume_googleSession:${clientId}:${owner}`;

export function validGoogleToken(value: unknown, now = Date.now()): value is AccessToken {
  if (!value || typeof value !== 'object') return false;
  const token = value as Partial<AccessToken>;
  return typeof token.value === 'string' && token.value.length > 0 && typeof token.expiresAt === 'number'
    && Number.isFinite(token.expiresAt) && token.expiresAt - TOKEN_SAFETY_MS > now;
}

export function readGoogleSession(clientId: string, owner: string): AccessToken | null {
  const key = keyFor(clientId, owner);
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (validGoogleToken(stored)) { tokens.set(key, stored); return stored; }
  } catch { /* The in-memory session still works when storage is unavailable. */ }
  const token = tokens.get(key);
  if (validGoogleToken(token)) return token;
  tokens.delete(key);
  return null;
}

export function saveGoogleSession(token: AccessToken | null, clientId: string, owner: string): void {
  const key = keyFor(clientId, owner);
  if (token) tokens.set(key, token); else tokens.delete(key);
  try {
    if (token) sessionStorage.setItem(key, JSON.stringify(token)); else sessionStorage.removeItem(key);
  } catch { /* No credential is copied to localStorage or synced state. */ }
  window.dispatchEvent(new Event(GOOGLE_SESSION_EVENT));
}
