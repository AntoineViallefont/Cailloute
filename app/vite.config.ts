import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { version } from "./package.json";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "offline-shell",
      generateBundle(_, bundle) {
        const photoAssets = [
          "/photo-privacy/face-detector.onnx",
          ...readdirSync(new URL("./public/photo-privacy/ort", import.meta.url))
            .filter((name) => /\.(mjs|wasm)$/.test(name))
            .map((name) => "/photo-privacy/ort/" + name),
        ];
        const photoVersion = createHash("sha256");
        photoAssets.forEach((path) => photoVersion.update(readFileSync(new URL("./public" + path, import.meta.url))));
        const assets = [
          "/",
          "/icon.png",
          "/transit-routes.json",
          "/place-groups.json",
          "/catalog-health-015.json",
          "/catalog-toilets-017.json",
          "/catalog-family-017.json",
          ...Object.keys(bundle)
            .filter((name) => /\.(js|css|woff2)$/.test(name))
            .map((name) => "/" + name),
        ];
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `
const CACHE = 'cailloute-shell-${version}';
const ASSETS = ${JSON.stringify(assets)};
const PHOTO_ASSETS = ${JSON.stringify(photoAssets)};
const PHOTO_CACHE = 'cailloute-photo-${photoVersion.digest('hex').slice(0, 16)}';
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key =>
    (key.startsWith('cailloute-shell-') && key !== CACHE) ||
    (key.startsWith('cailloute-photo-') && key !== PHOTO_CACHE)
  ).map(key => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request, {signal: AbortSignal.timeout(3000)}).catch(() => caches.open(CACHE).then(c => c.match('/'))));
  } else if (PHOTO_ASSETS.includes(url.pathname)) {
    // Sur le web, le modèle ne se télécharge qu’au premier usage photo.
    // Android conserve ces mêmes fichiers dans son application embarquée.
    e.respondWith(caches.open(PHOTO_CACHE).then(async cache => {
      const hit = await cache.match(e.request, {ignoreVary: true});
      if (hit) return hit;
      const response = await fetch(e.request);
      if (response.ok) await cache.put(e.request, response.clone());
      return response;
    }));
  } else if (url.pathname.startsWith('/transit-france/')) {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const response = await fetch(e.request);
      if (response.ok) await cache.put(e.request, response.clone());
      return response;
    }));
  } else if (ASSETS.includes(url.pathname)) {
    e.respondWith(caches.match(e.request, {ignoreVary: true}).then(r => r || fetch(e.request)));
  }
});`,
        });
      },
    },
    {
      name: "cailloute-version",
      transformIndexHtml: (html: string) =>
        html.replaceAll("__CAILLOUTE_VERSION__", version),
    },
  ],
  worker: { format: "es" },
  server: {
    host: "127.0.0.1",
    port: 5187,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  // Le prebuild nettoie dist avec reprises ; éviter le second nettoyage sans reprise de Vite.
  build: { chunkSizeWarningLimit: 1000, emptyOutDir: false },
});
