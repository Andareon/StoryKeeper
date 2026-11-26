const CACHE = 'storykeeper-shell-1'
const ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './js/main.js',
  './js/router.js',
  './js/domain.js',
  './js/db/schema.js',
  './js/db/idb.js',
  './js/db/registry.js',
  './js/db/campaign.js',
  './js/db/links.js',
  './js/db/cleanup.js',
  './js/services/autosave.js',
  './js/services/search.js',
  './js/services/persist.js',
  './js/services/transfer.js',
  './js/services/seed.js',
  './js/ui/html.js',
  './js/ui/toast.js',
  './js/ui/modal.js',
  './js/ui/rows.js',
  './js/ui/tags.js',
  './js/ui/gallery.js',
  './js/ui/master.js',
  './js/ui/reorder.js',
  './js/ui/search-box.js',
  './js/ui/bits.js',
  './js/ui/relation-list.js',
  './js/ui/download.js',
  './js/views/home.js',
  './js/views/shell.js',
  './js/views/overview.js',
  './js/views/locations.js',
  './js/views/characters.js',
  './js/views/clues.js',
  './js/views/players.js',
  './js/views/journal.js',
  './js/views/notes.js',
  './js/views/settings.js',
  './js/views/session.js',
  './js/views/relations.js',
  './vendor/jszip.min.js',
  './vendor/cytoscape.min.js',
  './vendor/lucide.min.js',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
      }
      return response
    }).catch(async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      if (request.mode === 'navigate') return caches.match('./index.html')
      return new Response('Нет сети и нет копии в кэше.', { status: 503 })
    }),
  )
})
