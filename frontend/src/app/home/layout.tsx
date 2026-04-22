"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <AppSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay d-lg-none" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex-grow-1 d-flex flex-column" style={{ background: "var(--background)", minWidth: 0 }}>
        <TopBar onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-grow-1 p-3 p-lg-5 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
