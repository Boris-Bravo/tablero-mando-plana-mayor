/* sw.js — Service Worker: permite abrir la app sin internet (los datos en vivo sí requieren conexión). */
const CACHE = "tmpm-v4";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/styles.css",
  "./assets/js/app.js",
  "./assets/js/ui.js",
  "./assets/js/db.js",
  "./assets/js/auth.js",
  "./assets/js/config.js",
  "./assets/js/resumen.js",
  "./assets/js/export-word.js",
  "./assets/js/modulos/documentacion.js",
  "./assets/js/modulos/partes.js",
  "./assets/js/modulos/radiograma.js",
  "./assets/js/modulos/calendario.js",
  "./assets/js/modulos/coordinacion.js",
  "./assets/js/modulos/memorandums.js",
  "./assets/js/modulos/efectivos.js",
  "./assets/js/modulos/vacaciones.js",
  "./assets/js/modulos/faltas.js",
  "./assets/js/modulos/inteligencia.js",
  "./assets/js/modulos/logistica.js",
  "./assets/js/modulos/civica.js",
  "./assets/js/modulos/secciones.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/ejercito.png",
  "./assets/icons/eceme.png",
  "./assets/img/fondo-desierto.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Estrategia "red primero": intenta la versión actualizada; si no hay internet,
// usa la copia en caché. Esto solo cubre el "cascarón" de la app — los datos
// compartidos (Supabase) necesitan conexión, esta app no funciona offline.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === "basic") {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
      }
      return res;
    }).catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
  );
});
