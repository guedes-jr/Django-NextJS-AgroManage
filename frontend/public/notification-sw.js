self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "Fazenda Mais", {
    body: data.body || "Você recebeu uma nova notificação.", icon: "/pwa-192x192.png", badge: "/pwa-192x192.png",
    data: { link: data.link || "/home/notifications" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const link = event.notification.data?.link || "/home/notifications";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    const current = windows.find(client => "focus" in client);
    return current ? current.focus().then(() => current.navigate(link)) : clients.openWindow(link);
  }));
});
