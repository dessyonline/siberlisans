/* Web Push service worker — receives push, shows notification, opens URL on click. */
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "SiberLisans", body: "" };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {
    if (event.data) data = { title: "SiberLisans", body: event.data.text() };
  }
  const title = data.title || "SiberLisans";
  const options = {
    body: data.body || "",
    icon: data.icon || "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) return c.navigate(url).then(() => c.focus());
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
