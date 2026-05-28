/* ═══════════════════════════════════════════════════════════════
   SARAYA Service Worker v2026-05-27
   Strategy: Network-first for HTML, Cache-first for assets
   Offline fallback: Cached index.html
   ═══════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'saraya-v2026-05-28-neu';
const CACHE_NAME = `saraya-cache-${CACHE_VERSION}`;
const RUNTIME_CACHE = `saraya-runtime-${CACHE_VERSION}`;

// الملفات الأساسية للعمل offline
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// CDN libraries (cache-first لأنها لا تتغير)
const CDN_DOMAINS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Firebase domains (NEVER cache - always network)
const NEVER_CACHE_DOMAINS = [
  'firestore.googleapis.com',
  'firebaseio.com',
  'firebaseapp.com',
  'googleapis.com/identitytoolkit',
  'securetoken.googleapis.com'
];

// ═══ INSTALL: precache essential files ═══
self.addEventListener('install', event => {
  console.log('[SW] Installing version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Precaching essential files');
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.warn('[SW] Some files failed to precache:', err);
        });
      })
      .then(() => self.skipWaiting()) // فعّل النسخة الجديدة فوراً
  );
});

// ═══ ACTIVATE: clean old caches ═══
self.addEventListener('activate', event => {
  console.log('[SW] Activating version:', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('saraya-') && !name.includes(CACHE_VERSION))
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim()) // تحكّم في كل التابات فوراً
  );
});

// ═══ FETCH: smart routing strategy ═══
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // تجاهل non-GET requests
  if (request.method !== 'GET') return;
  
  // تجاهل Chrome extensions
  if (url.protocol === 'chrome-extension:') return;
  
  // ⚠️ Firebase requests — لا cache أبداً، فقط network
  if (NEVER_CACHE_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(fetch(request).catch(() => {
      return new Response(JSON.stringify({
        error: 'offline',
        message: 'لا يوجد اتصال بالخادم'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }
  
  // 📦 CDN libraries — cache-first (لا تتغير)
  if (CDN_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // 🌐 HTML pages — network-first (للحصول على أحدث نسخة)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // 📷 Images, CSS, JS — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ─── Cache-first strategy ───
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] Cache-first failed:', request.url);
    throw err;
  }
}

// ─── Network-first strategy (مع fallback لـ cache) ───
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cached = await caches.match(request);
    if (cached) return cached;
    
    // Fallback: عرض الصفحة الرئيسية المخزّنة
    const fallback = await caches.match('./index.html') || await caches.match('./');
    if (fallback) return fallback;
    
    throw err;
  }
}

// ─── Stale-while-revalidate strategy ───
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(RUNTIME_CACHE).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => cached); // لو فشل، أرجع المخزّن
  
  return cached || fetchPromise;
}

// ═══ MESSAGES: للتحديث الفوري من الصفحة ═══
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
});

console.log('[SW] Service Worker loaded:', CACHE_VERSION);
