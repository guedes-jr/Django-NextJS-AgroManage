"use client";

import notificationService from "./notificationService";

class PushNotificationService {
  private permission: NotificationPermission = "default";
  private pollingInterval: NodeJS.Timeout | null = null;

  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      console.log("Este navegador não suporta notificações");
      return false;
    }

    if (Notification.permission === "granted") {
      this.permission = "granted";
      return true;
    }

    if (Notification.permission !== "denied") {
      this.permission = await Notification.requestPermission();
      return this.permission === "granted";
    }

    return false;
  }

  async showNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (this.permission !== "granted") {
      const granted = await this.requestPermission();
      if (!granted) return;
    }

    const notification = new Notification(title, {
      icon: "/logo.png",
      badge: "/logo.png",
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      if (options?.data?.link) {
        window.location.href = options.data.link;
      }
    };
  }

  startPolling(intervalMs: number = 30000, onNewNotification?: (count: number) => void): void {
    if (this.pollingInterval) {
      this.stopPolling();
    }

    let lastCount = 0;

    const checkNotifications = async () => {
      try {
        const { unread_count } = await notificationService.getUnreadCount();
        
        if (unread_count > 0 && unread_count > lastCount && onNewNotification) {
          onNewNotification(unread_count);
          
          const notifications = await notificationService.getAll();
          if (notifications.length > 0) {
            const latest = notifications[0];
            this.showNotification(latest.title, {
              body: latest.message,
              data: { link: latest.link }
            });
          }
        }
        
        lastCount = unread_count;
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    checkNotifications();
    this.pollingInterval = setInterval(checkNotifications, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  isSupported(): boolean {
    return "Notification" in window;
  }

  getPermissionStatus(): NotificationPermission {
    if (!("Notification" in window)) return "denied";
    return Notification.permission;
  }
}

export const pushService = new PushNotificationService();
export default pushService;