"use client";

import { usePathname } from "next/navigation";
import { getOrganizationAccess, canAccessOrganizationPath, type OrganizationAccess } from "@/services/organizationAccess";
import Link from "next/link";
import { OrganizationAccessContext } from "@/components/auth/OrganizationAccessContext";
import { useCallback, useEffect, useState } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SupportAccessBanner } from "@/components/platform/SupportAccessBanner";
import { ClientAnnouncementBanner } from "@/components/platform/ClientAnnouncementBanner";
import { NotificationProvider } from "@/components/notifications";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [access,setAccess] = useState<OrganizationAccess | null>(null);
  const [accessLoading,setAccessLoading] = useState(true);
  const [accessError,setAccessError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      getOrganizationAccess().then(value => {
        if (active) { setAccess(value); setAccessError(false); }
      }).catch(() => {
        if (active) { setAccess(null); setAccessError(true); }
      }).finally(() => { if (active) setAccessLoading(false); });
    };
    refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSidebar();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeSidebar, isSidebarOpen]);

  return (
    <OrganizationAccessContext.Provider value={access}><NotificationProvider><div className="d-flex" style={{ minHeight: "100vh" }}>
      <AppSidebar access={access} isOpen={isSidebarOpen} onClose={closeSidebar} />
      
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
          {accessLoading ? <p role="status">Verificando acesso…</p> : accessError ? <div className="alert alert-danger">Não foi possível verificar suas permissões. Recarregue a página.</div> : canAccessOrganizationPath(access,pathname) ? children : <div className="alert alert-info"><h1 className="h5">Área não autorizada</h1><p>Solicite ao administrador a liberação desta área para seu usuário.</p><Link href="/home" className="btn btn-success">Voltar à dashboard</Link></div>}
        </main>
      </div>
    </div></NotificationProvider></OrganizationAccessContext.Provider>
  );
}
