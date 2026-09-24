/**
 * Offline shell for the gym floor: the phone's notes app was only ever winning
 * because it opens with no signal. Nothing here is a data store — workouts live
 * in localStorage and Supabase; this only makes sure the app itself opens.
 *
 * Bump CACHE when the logic below changes; asset filenames are content-hashed,
 * so the version is not needed for ordinary deploys.
 */
const CACHE = 'tmv-v5';

/** Every SPA route is served by the same document, so the shell has one key. */
const SHELL = new URL('./', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

/**
 * The page that triggers the install was loaded before this worker controlled
 * anything, so its script and stylesheet never passed through fetch here. Left
 * at that, the first offline launch would find the shell cached and its assets
 * missing. So read the shell and take what it references along with it.
 */
async function precache() {
  const cache = await caches.open(CACHE);
  try {
    // cache: 'reload' so installing never picks the shell out of the HTTP cache.
    const response = await fetch(new Request(SHELL, { cache: 'reload' }));
    if (!response.ok) return;
    await cache.put(SHELL, response.clone());

    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map(match => new URL(match[1], SHELL))
      .filter(url => url.origin === self.location.origin)
      .map(url => url.href);

    // One unreachable file must not fail the whole install.
    await Promise.all([...new Set(assets)].map(url => cache.add(url).catch(() => {})));
  } catch {
    // Offline at install time; the first online launch fills the cache instead.
  }
}

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Supabase and Google are somebody else's freshness to decide, not ours.
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    request.mode === 'navigate' ? shellFirst(request) : cacheFirst(request),
  );
});

/**
 * Online wins for the document, so a deploy is picked up on the next launch.
 * Offline falls back to the last good shell.
 */
async function shellFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    // A 404 here is GitHub Pages' deep-link bounce, not the app — never store it.
    if (fresh.ok) cache.put(SHELL, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    throw new Error('offline and no cached shell');
  }
}

/** Hashed asset names are immutable, so the cached copy is always the right one. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}
