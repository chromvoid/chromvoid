// Service Worker: defensive same-origin image caching.

const IMAGE_CACHE = 'kp-image-cache-v2'
const IMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const IMAGE_MAX_ENTRIES = 1000

const OBSOLETE_CACHES = [
  'pm-image-cache-v1',
  'pm-favicon-cache-v1',
  'kp-favicon-cache-v2',
  'kp-favicon-meta-v2',
]

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim()

      await Promise.all(
        OBSOLETE_CACHES.map((name) => {
          try {
            return caches.delete(name)
          } catch {
            return false
          }
        }),
      )

      await cleanupSameOriginImageCache()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  const isImageDestination = request.destination === 'image'
  const isImageExt = /\.(?:png|jpe?g|gif|webp|svg|ico|bmp|avif|apng)(?:\?|#|$)/i.test(url.pathname)
  if (!isImageDestination && !isImageExt) return
  if (url.origin !== self.location.origin) return

  event.respondWith(handleSameOriginImageRequest(request))
})

async function handleSameOriginImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE)
  const cached = await cache.match(request)

  if (cached) {
    const cachedAt = new Date(cached.headers.get('sw-cache-date') || 0).getTime()
    if (Date.now() - cachedAt < IMAGE_TTL_MS) {
      return cached
    }
    await cache.delete(request)
  }

  try {
    const networkResponse = await fetch(request)
    if (!networkResponse || !networkResponse.ok) {
      return networkResponse
    }

    const contentType = networkResponse.headers.get('content-type') || ''
    if (contentType && !contentType.startsWith('image/')) {
      return networkResponse
    }

    const responseToCache = networkResponse.clone()
    const toCache = new Response(responseToCache.body, {
      status: responseToCache.status,
      statusText: responseToCache.statusText,
      headers: new Headers(responseToCache.headers),
    })
    toCache.headers.set('sw-cache-date', new Date().toISOString())

    await cache.put(request, toCache)
    await enforceSameOriginImageLimit()

    return networkResponse
  } catch {
    if (cached) return cached
    return new Response('', {status: 504, statusText: 'Gateway Timeout'})
  }
}

async function cleanupSameOriginImageCache() {
  const cache = await caches.open(IMAGE_CACHE)
  const keys = await cache.keys()
  const now = Date.now()

  await Promise.all(
    keys.map(async (req) => {
      const res = await cache.match(req)
      if (!res) return
      const ts = new Date(res.headers.get('sw-cache-date') || 0).getTime()
      if (now - ts > IMAGE_TTL_MS) {
        await cache.delete(req)
      }
    }),
  )
}

async function enforceSameOriginImageLimit() {
  const cache = await caches.open(IMAGE_CACHE)
  const keys = await cache.keys()
  if (keys.length <= IMAGE_MAX_ENTRIES) return

  const entries = await Promise.all(
    keys.map(async (req) => {
      const res = await cache.match(req)
      const ts = res ? new Date(res.headers.get('sw-cache-date') || 0).getTime() : 0
      return {req, ts}
    }),
  )

  entries.sort((a, b) => a.ts - b.ts)
  const toDelete = entries.slice(0, entries.length - IMAGE_MAX_ENTRIES)
  await Promise.all(toDelete.map((e) => cache.delete(e.req)))
}
