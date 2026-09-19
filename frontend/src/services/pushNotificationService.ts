"use client";

import notificationService from "./notificationService";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), character => character.charCodeAt(0));
}

class PushNotificationService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") return false;
    const { public_key } = await notificationService.getPushConfig();
    if (!public_key) return false;
    const registration = await navigator.serviceWorker.register("/notification-sw.js");
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key) });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
    await notificationService.savePushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
    return true;
  }

  startPolling(intervalMs = 30000, onNewNotification?: (count: number) => void): void {
    this.stopPolling();
    let lastCount = -1;
    const check = async () => {
      try {
        const { unread_count } = await notificationService.getUnreadCount();
        if (lastCount >= 0 && unread_count > lastCount) onNewNotification?.(unread_count);
        lastCount = unread_count;
      } catch (error) { console.error("Notification polling error:", error); }
    };
    void check();
    this.pollingInterval = setInterval(() => void check(), intervalMs);
  }

  stopPolling() { if (this.pollingInterval) clearInterval(this.pollingInterval); this.pollingInterval = null; }
  isSupported() { return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window; }
  getPermissionStatus(): NotificationPermission { return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied"; }
}

export const pushService = new PushNotificationService();
export default pushService;
