// ParkingRabbit service worker — Web Push receiver + basic offline shell.
//
// Push payload contract (sent by /api/inbound when the council replies):
//   { title: string, body: string, url?: string, tag?: string }
//
// Clicking a notification focuses an existing tab if any, otherwise opens
// the supplied URL (defaults to the app's /app/inbox).

self.addEventListener("install", () => {
  // Activate the new worker immediately; we don't pre-cache anything yet.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "ParkingRabbit", body: event.data.text() };
  }
  const title = payload.title || "ParkingRabbit";
  const options = {
    body: payload.body || "You have an update from the council.",
    icon: "/logo.svg",
    badge: "/logo.svg",
    tag: payload.tag,
    data: { url: payload.url || "/app/inbox" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app/inbox";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((all) => {
        for (const c of all) {
          if (c.url.includes(url) && "focus" in c) return c.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
