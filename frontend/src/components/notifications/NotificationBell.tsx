"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import useNotifications from "@/hooks/useNotifications";
import NotificationDropdown from "./NotificationDropdown";

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount, fetchNotifications, operationalAlerts, fetchOperationalAlerts } = useNotifications();

  const toggleDropdown = () => {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening) { void fetchNotifications(); void fetchOperationalAlerts(); }
  };

  const count = unreadCount + operationalAlerts.length;
  return (
    <div className="position-relative">
      <button
        className={`btn-icon-muted p-2 ${operationalAlerts.length ? "pending-alerts" : ""}`}
        onClick={toggleDropdown}
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
        aria-label={`Notificações: ${count} pendentes`}
        aria-expanded={isOpen}
      >
        <Bell size={20} />
        {count > 0 && (
          <span
            className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
            style={{ fontSize: "0.65rem", minWidth: "18px" }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown onClose={() => setIsOpen(false)} />
      )}
      <style jsx>{`
        .pending-alerts { animation: alert-pulse 1.6s ease-in-out infinite; }
        @keyframes alert-pulse { 0%, 100% { color: var(--foreground); } 50% { color: #d33a35; background: #fff0ee !important; box-shadow: 0 0 0 4px #d33a3525; border-radius: 50%; } }
        @media (prefers-reduced-motion: reduce) { .pending-alerts { animation: none; color: #d33a35; } }
      `}</style>
    </div>
  );
}
