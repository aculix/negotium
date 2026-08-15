// Negotium's service worker. Small on purpose: this app is one HTML file, one
// JS bundle, one stylesheet and a couple of icons.
//
// The strategy leans on a property of the build: Vite fingerprints assets by
// content, so index-CE76Mg_z.js can never change meaning. That splits cleanly
// in two:
//
//   Documents  -> network first, cache as fallback. A new deploy is picked up
//                 the moment you are online, so nobody gets welded to a stale
//                 build. Offline, the last good copy is served.
//   Everything -> cache first. Fingerprinted files are immutable, and a new
//   else         build simply asks for new filenames.
//
// Bump CACHE when the caching logic itself changes; old caches are dropped on
// activate.

const CACHE = 'negotium-v1'

self.addEventListener('install', (event) => {
  // The shell is cached on first fetch rather than precached, which keeps this
  // file free of a build-generated asset manifest.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)

  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached

    // A deep link visited offline that was never cached: fall back to the app
    // shell, which is all this app needs to boot.
    const shell = await cache.match('/index.html')
    if (shell) return shell

    throw new Error('offline and nothing cached')
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)

  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response && response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})
