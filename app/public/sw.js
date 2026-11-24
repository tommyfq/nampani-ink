// Nampani Ink POS service worker: shows staff notifications (Web Push),
// even when the POS tab is closed. Clicking one opens or focuses the POS.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Nampani Ink', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nampani Ink', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      requireInteraction: true,
      data: { url: data.url || '/admin/inbox' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin/inbox', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const tab of tabs) {
        if (new URL(tab.url).origin === self.location.origin) {
          await tab.focus();
          return tab.navigate(url);
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
