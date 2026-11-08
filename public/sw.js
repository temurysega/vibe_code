// Retire the former application's worker at its original URL.
// Keep this endpoint available for visitors returning with an offline copy.
// There is deliberately no fetch handler: requests go directly to the server.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('zk-')).map((key) => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    // Open tabs must leave the old document as well as release its worker.
    await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => {})));
  })());
});
