self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'NexusFin', body: 'Nueva notificación' };
  }

  const title = data.title || 'NexusFin';
  const options = {
    body: data.body || 'Nueva alerta',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: data.data || {}
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      if (windowClients.length > 0) {
        return windowClients[0].focus();
      }
      return clients.openWindow('/alerts');
    })
  );
});
