// Offline: once the app has loaded, it keeps working with no connection, as the project brief
// promises. Every request goes to the network first, so a change to the map shows at once when
// online; only when the network fails does the last copy answer.
//
// On a network that is there but crawling (school Wi-Fi at lunch), the app's page waits PAGE_WAIT
// for it and then opens from the saved copy instead, and so does everything that page loads:
// the PAGE decides, once, for all its files.
//
// Two things went wrong before and must not come back:
// * a cached copy answering a SLOW network (it once did, after 4 s) lets each file race on its
//   own, so an old map.js can load beside a new main.js and the app does not start; so a copy
//   answers a single file only when its request FAILED, and a slow one only for a page that
//   itself came from the copy (whose late answer from the network is then not stored either);
// * every page was stored as the app's page, so opening qr.html replaced the offline map with the
//   label sheet; so only the app's own address is the app, and any other page is kept as itself.
//
// It controls only pages under app/ (its own folder), so the shipped app at the site root is
// untouched. Bump CACHE whenever the files below change, so a phone that installs the new copy
// installs all of it at once.

const CACHE = 'cismap-v97';
const PAGE_WAIT = 4000;   // ms

// i18n.js LANGUAGES with a file of their own
const LANG_FILES = ['fr', 'zh-Hant', 'ko', 'ja', 'es', 'pt-BR', 'hi', 'ta', 'ms', 'id', 'vi', 'th', 'de', 'fil'].map(id => `lang/${id}.json`);

// pages (clients) that opened from the saved copy: the rest of what they load comes from it too
const fromCopy = new Set();

const SHELL = [
  './', 'index.html', 'app.css', 'main.js', 'map.js', 'floors.js', 'search.js', 'directions.js', 'i18n.js', 'qr.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-180.png', 'icons/favicon.svg',
  'fonts/hanken-grotesk-latin.woff2', 'fonts/hanken-grotesk-latin-ext.woff2',
  '../routing/engine.mjs',
  '../data/floors_evac.json', '../data/routing/graph_evac.json', '../data/directory_evac.json', '../data/toilets_evac.json',
  '../data/footprints_evac.json', '../data/zones_evac.json',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL.map(u => new Request(u, { cache: 'no-cache' })));
    // the floors themselves, from the floors index
    const index = await (await fetch('../data/floors_evac.json', { cache: 'no-cache' })).json();
    await c.addAll(index.floors.map(f => new Request('../' + f.data, { cache: 'no-cache' })));
    // the other languages' words (app/lang/<id>.json, each fetched when chosen): kept too, so a language
    // can be changed with no connection; one not there yet is skipped, not a failed install
    await Promise.all(LANG_FILES.map(u => c.add(new Request(u, { cache: 'no-cache' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // this site only (the font is bundled now)
  if (url.origin !== location.origin) return;
  e.respondWith(answer(e, req, url));
});

async function answer(e, req, url) {
  const cache = await caches.open(CACHE);
  const page = req.mode === 'navigate';
  const scope = new URL(self.registration.scope);
  // the app's page is one copy, whatever trip its link carries; any other page is itself
  const app = page && (url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html');
  const key = app ? new URL('index.html', scope).href : page ? url.origin + url.pathname : req;
  // a page that opened from the saved copy keeps to it
  if (!page && e.clientId && fromCopy.has(e.clientId)) {
    const kept = await cache.match(key);
    if (kept) return kept;
  }
  // ask the server every time (a 304 when nothing changed): left to the browser's own cache, an
  // old file can arrive beside new ones for minutes after a change
  const net = page ? fetch(url.href, { cache: 'no-cache' })
    : url.origin === location.origin ? fetch(req, { cache: 'no-cache' }) : fetch(req);
  // the app's page, with a copy saved and a browser that says which page this request makes:
  // waits so long for the network, then opens from the copy
  const saved = app && e.resultingClientId ? await cache.match(key) : null;
  if (saved) {
    const res = await Promise.race([net.catch(() => null), new Promise(r => setTimeout(r, PAGE_WAIT, null))]);
    if (res && res.ok) { cache.put(key, res.clone()).catch(() => {}); return res; }
    fromCopy.add(e.resultingClientId);
    net.catch(() => {});
    return saved;
  }
  try {
    const res = await net;
    if ((res.ok || res.type === 'opaque') && !fromCopy.has(e.clientId)) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch {
    return (await cache.match(key)) || Response.error();
  }
}
