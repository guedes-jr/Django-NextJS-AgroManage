"use client";

import { useEffect, useCallback } from "react";
import { useNotifications } from "./useNotifications";
import pushService from "@/services/pushNotificationService";

const POLLING_INTERVAL = 30000; // 30 segundos

export function usePushNotifications() {
  const { fetchUnreadCount } = useNotifications();

  const startPolling = useCallback(() => {
    if (pushService.isSupported()) {
      pushService.startPolling(POLLING_INTERVAL, (count) => {
        fetchUnreadCount();
      });
    }
  }, [fetchUnreadCount]);

  const stopPolling = useCallback(() => {
    pushService.stopPolling();
  }, []);

  const requestPushPermission = useCallback(async () => {
    return await pushService.requestPermission();
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    startPolling,
    stopPolling,
    requestPushPermission,
    isSupported: pushService.isSupported(),
    permissionStatus: pushService.getPermissionStatus(),
  };
}

export default usePushNotifications;