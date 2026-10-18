/**
 * PagePulse Web Push Service Worker
 * Handles real-time background push events and notification click navigation.
 */

// Safe URL validator ensuring notification clicks cannot open untrusted or external URLs
function sanitizeDestinationUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return '/monitors';
  }

  const trimmed = rawUrl.trim();

  // Allow safe relative paths
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, self.location.origin);
    if (parsed.origin === self.location.origin) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {}

  return '/monitors';
}

// Lifecycle events
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Incoming push notification event
self.addEventListener('push', (event) => {
  let payload = {};

  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (err) {
    try {
      payload = { body: event.data.text() };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || 'PagePulse — Change detected';
  const targetUrl = sanitizeDestinationUrl(payload.data?.url);

  const options = {
    body: payload.body || 'A meaningful alteration was detected on your monitored target.',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
    tag: payload.tag || 'pagepulse-change',
    renotify: payload.renotify !== false,
    requireInteraction: payload.importance === 'high',
    data: {
      url: targetUrl,
      monitorId: payload.data?.monitorId || null,
      changeId: payload.data?.changeId || null,
      importance: payload.data?.importance || 'medium',
      timestamp: payload.data?.timestamp || new Date().toISOString()
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// User clicked on notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetPath = sanitizeDestinationUrl(event.notification.data?.url);
  const targetFullUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a PagePulse tab is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && client.url !== targetFullUrl) {
            return client.navigate(targetFullUrl);
          }
          return;
        }
      }

      // If no window is open, open a new window to the compare or monitors page
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetFullUrl);
      }
    })
  );
});
