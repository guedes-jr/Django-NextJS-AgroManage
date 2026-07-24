"use client";

import { useCallback, useState } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SupportAccessBanner } from "@/components/platform/SupportAccessBanner";
import { ClientAnnouncementBanner } from "@/components/platform/ClientAnnouncementBanner";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <AppSidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
      
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay d-lg-none" 
          onClick={closeSidebar}
        />
      )}

      <div className="flex-grow-1 d-flex flex-column" style={{ background: "var(--background)", minWidth: 0 }}>
        <SupportAccessBanner />
        <ClientAnnouncementBanner />
        <TopBar onMenuClick={openSidebar} isMenuOpen={isSidebarOpen} />
        <main className="flex-grow-1 p-3 p-lg-5 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
