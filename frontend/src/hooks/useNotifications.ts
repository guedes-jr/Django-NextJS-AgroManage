"use client";

import { useNotificationContext } from "@/components/notifications/NotificationProvider";

export function useNotifications() {
  return useNotificationContext();
}

export default useNotifications;
