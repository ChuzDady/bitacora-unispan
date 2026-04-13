/* =====================================================
   SERVICE WORKER — UNISPAN Bitácora PWA
   Compatible con GitHub Pages (subdirectorio)
   BASE_URL se resuelve dinámicamente desde self.location
   ===================================================== */

const CACHE_VERSION = 'v2';
const CACHE_NAME    = `unispan-bitacora-${CACHE_VERSION}`;

// ── Ruta base dinámica ──────────────────────────────
// En GitHub Pages:  https://chuzdady.github.io/bitacora-unispan/
// En local:         http://localhost:3000/
const BASE = new URL('./', self.location.href).href;

// ── Assets locales (URLs absolutas resueltas desde BASE) ──
const LOCAL_ASSETS = [
  BASE,                        // La raíz / start_url de la PWA
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'css/app.css',
  BASE + 'js/db.js',
  BASE + 'js/camera.js',
  BASE + 'js/signature.js',
  BASE + 'js/pdf.js',
  BASE + 'js/nc.js',
  BASE + 'js/export.js',
  BASE + 'js/app.js',
  BASE + 'assets/logo.svg',
];

// ── CDN (best-effort, fallos ignorados) ──────────────
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=Barlow:wght@300;400;500;600&display=swap'
];

/* ── INSTALL ─────────────────────────────────────────
   cache.addAll es atómico: si un asset local falla
   la instalación entera falla. Los CDN son best-effort.
   ─────────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        // Assets locales obligatorios
        cache.addAll(LOCAL_ASSETS)
          .then(() =>
            // CDN en paralelo, sin bloquear la instalación
            Promise.allSettled(
              CDN_ASSETS.map(url =>
                fetch(url, { mode: 'cors' })
                  .then(res => { if (res && res.ok) cache.put(url, res); })
                  .catch(() => { /* CDN no disponible — se omite */ })
              )
            )
          )
      )
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ────────────────────────────────────────
   Eliminar cachés de versiones anteriores.
   ─────────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_NAME)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ── FETCH ───────────────────────────────────────────
   Estrategia por tipo de recurso:

   • NAVIGATE (carga de página)  → siempre sirve index.html
     desde caché (offline-first). Si no está en caché, red.

   • Otros GET                   → Cache-first, luego red.
     Si viene de la red, actualiza caché.
   ─────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  // Ignorar métodos no-GET y extensiones del navegador
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http'))  return;

  // ── Solicitudes de navegación (carga inicial de la SPA) ──
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // 1. Intentar caché → funciona offline
      caches.match(BASE + 'index.html')
        .then(cached => {
          if (cached) return cached;
          // 2. Sin caché → red
          return fetch(BASE + 'index.html')
            .then(res => {
              if (res && res.ok) {
                caches.open(CACHE_NAME)
                  .then(c => c.put(BASE + 'index.html', res.clone()));
              }
              return res;
            });
        })
        .catch(() => caches.match(BASE + 'index.html')) // último recurso
    );
    return;
  }

  // ── Todos los demás recursos (CSS, JS, imágenes, CDN) ──
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Stale-While-Revalidate: sirve inmediato, refresca en segundo plano
        fetch(event.request)
          .then(res => {
            if (res && res.ok && res.type !== 'opaque') {
              caches.open(CACHE_NAME)
                .then(c => c.put(event.request, res.clone()));
            }
          })
          .catch(() => { /* sin red — no importa, ya se sirvió desde caché */ });

        return cached;
      }

      // No está en caché → red con almacenamiento posterior
      return fetch(event.request)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => {
          // Para imágenes: retorna respuesta vacía antes que romper la UI
          if (event.request.destination === 'image') {
            return new Response('', { status: 408 });
          }
        });
    })
  );
});

/* ── BACKGROUND SYNC (placeholder) ─────────────────── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-bitacoras') {
    event.waitUntil(Promise.resolve());
  }
});

/* ── MESSAGE HANDLER ─────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_NAME });
  }
});
