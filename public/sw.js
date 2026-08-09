// Service Worker for PhamaCount Web - MobileSAM 模型快取策略

const CACHE_NAME = 'pharmacount-v1';
const MODEL_CACHE = 'mobile-sam-models-v1';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

const MODEL_ASSETS = [
  '/models/mobile_sam_encoder.onnx',
  '/models/mobile_sam_decoder.onnx',
  '/wasm/ort-wasm.wasm',
  '/wasm/ort-wasm-simd.wasm',
];

// 安裝時快取靜態資源與模型檔案
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(MODEL_CACHE).then((cache) => cache.addAll(MODEL_ASSETS)),
    ])
  );
  self.skipWaiting();
});

// 啟用時清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== MODEL_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 攔截請求
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 模型與 WASM 檔案：Cache First 策略（離線優先）
  if (url.pathname.startsWith('/models/') || url.pathname.startsWith('/wasm/')) {
    event.respondWith(
      caches.match(event.request, { cacheName: MODEL_CACHE }).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(MODEL_CACHE).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 靜態資源：Stale While Revalidate
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.startsWith(asset))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 其他：Network First（API 請求等）
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// 推播通知支援（未來擴展）
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
      })
    );
  }
});