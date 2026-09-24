/**
 * The OAuth client id this deployment authenticates with.
 *
 * Not a secret: every browser app ships its client id in plain sight, and
 * Google only honours it for the JavaScript origins registered against it
 * (localhost:5173, localhost:4173, dogulusal.github.io). The client secret
 * that Google hands out beside it is deliberately absent — the token flow
 * this app uses never needs one, so there is nothing here to leak.
 *
 * It lives in code rather than in settings so the app works on a new phone
 * without retyping it. Anything entered in the app's own settings still wins,
 * which is what keeps a different deployment from having to edit this file.
 */
export const DEFAULT_GOOGLE_CLIENT_ID =
  '432627893483-84u8g500n7ae4dafdqcjb9e41co34plm.apps.googleusercontent.com';

export const DEFAULT_SPREADSHEET_ID = '1MXfG_JvxsdwLcFdzSJnoiVC4mJpYYyYZ32gKrEsc4Fs';
