/**
 * Loads Google Identity Services for the one-time Sheet consent. The browser
 * only obtains an authorization code; the sync worker exchanges it and keeps
 * the grant, so nothing Google issues is stored here.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Access to a spreadsheet the user already owns and linked to the sync. */
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
/** New accounts only need access to files this app creates. */
export const APP_CREATED_SHEETS_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** Bind a new Sheet grant to the account used for app sign-in. */
export const SHEETS_ACCOUNT_SCOPE = 'openid https://www.googleapis.com/auth/userinfo.email';

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initCodeClient: (config: {
        client_id: string;
        scope: string;
        login_hint?: string;
        ux_mode: 'popup';
        callback: (response: { code?: string; error?: string }) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }) => { requestCode: () => void };
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

let gisPromise: Promise<GoogleIdentityServices> | null = null;

/** Loads the Google script once and resolves when window.google is usable. */
export function loadGis(): Promise<GoogleIdentityServices> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('Google kimlik kütüphanesi yüklendi ama beklenen arayüz yok.'));
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', () => {
      gisPromise = null;
      reject(new Error('Google kimlik kütüphanesi yüklenemedi (internet bağlantısı?).'));
    });
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return gisPromise;
}
