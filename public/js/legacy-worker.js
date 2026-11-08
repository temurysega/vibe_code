// A hard refresh can load the new page while an old worker remains registered.
// Update that registration without installing a worker for new visitors.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      const worker = registration.active || registration.waiting || registration.installing;
      if (worker && new URL(worker.scriptURL).pathname === '/sw.js') {
        registration.update().catch(() => {});
      }
    }
  }).catch(() => {});
}
