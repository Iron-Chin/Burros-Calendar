// Burros Calendar service worker: keeps the app on the phone so it opens offline.
// The page is fetched fresh when online (falling back to the saved copy after 4 s or when
// offline); map tiles are saved as they are viewed. Data itself is cached by Firestore.
const APP = 'cc-app-v2'
const TILES = 'cc-tiles-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(APP).then((c) => c.add('./')))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(APP)
        try {
          const res = await Promise.race([fetch(req), timeout(4000)])
          if (res.ok) cache.put('./', res.clone())
          return res
        } catch {
          return (await cache.match('./')) || Response.error()
        }
      })(),
    )
    return
  }
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(TILES)
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      })(),
    )
  }
})

// Morning reminders (sent by the Burros reminders service at 8:00 on days with plans).
self.addEventListener('push', (e) => {
  let msg = { title: 'Burros Calendar', body: '' }
  try {
    msg = { ...msg, ...e.data.json() }
  } catch {
    /* plain text or nothing */
  }
  e.waitUntil(self.registration.showNotification(msg.title, { body: msg.body, tag: msg.tag || 'burros', data: { url: './' } }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (wins[0]) return wins[0].focus()
      return self.clients.openWindow('./')
    })(),
  )
})
