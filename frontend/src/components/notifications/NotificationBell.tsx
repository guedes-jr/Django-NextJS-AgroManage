"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import useNotifications from "@/hooks/useNotifications";
import NotificationDropdown from "./NotificationDropdown";

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount, fetchNotifications } = useNotifications();

  return (
    <div className="position-relative">
      <button
        className="btn-icon-muted p-2"
        onClick={() => setIsOpen(!isOpen)}
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
        aria-label="Notificações"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
            style={{ fontSize: "0.65rem", minWidth: "18px" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown
          onClose={() => setIsOpen(false)}
          onRefresh={fetchNotifications}
        />
      )}
    </div>
  );
}