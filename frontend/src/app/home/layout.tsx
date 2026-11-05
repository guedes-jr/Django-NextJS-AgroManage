"use client";

import { usePathname, useRouter } from "next/navigation";
import { getOrganizationAccess, canAccessOrganizationPath, type OrganizationAccess } from "@/services/organizationAccess";
import Link from "next/link";
import { OrganizationAccessContext } from "@/components/auth/OrganizationAccessContext";
import { useCallback, useEffect, useState } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SupportAccessBanner } from "@/components/platform/SupportAccessBanner";
import { ClientAnnouncementBanner } from "@/components/platform/ClientAnnouncementBanner";
import { NotificationProvider } from "@/components/notifications";
import CampaignAlertBanner from "@/components/notifications/CampaignAlertBanner";
import { OrganizationLocaleProvider, useOrganizationLocale } from "@/lib/locale";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrganizationLocaleProvider><HomeLayoutContent>{children}</HomeLayoutContent></OrganizationLocaleProvider>;
}

function HomeLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useOrganizationLocale();
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
  useEffect(() => {
    if (access?.role === "feeder" && pathname === "/home" && access.livestock_species?.includes("bovinos")) router.replace("/home/seguimento/gado-de-corte/racao/tratos");
  }, [access, pathname, router]);
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
    <OrganizationAccessContext.Provider value={access}><NotificationProvider><div className="app-workspace d-flex" style={{ minHeight: "100vh" }}>
      <AppSidebar access={access} isOpen={isSidebarOpen} onClose={closeSidebar} />
      
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay d-lg-none" 
          onClick={closeSidebar}
        />
      )}

      <div className="workspace-body flex-grow-1 d-flex flex-column" style={{ background: "var(--background)", minWidth: 0 }}>
        <SupportAccessBanner />
        <ClientAnnouncementBanner />
        <TopBar onMenuClick={openSidebar} isMenuOpen={isSidebarOpen} />
        <main className="workspace-content flex-grow-1 overflow-auto">
          {!accessLoading && !accessError && <CampaignAlertBanner />}
          {accessLoading ? <p role="status">{t("layout.verifyingAccess")}</p> : accessError ? <div className="alert alert-danger" role="alert">{t("layout.permissionsError")}</div> : canAccessOrganizationPath(access,pathname) ? children : <div className="alert alert-info"><h1 className="h5">{t("layout.unauthorizedTitle")}</h1><p>{t("layout.unauthorizedDescription")}</p><Link href="/home" className="btn btn-success">{t("layout.backToDashboard")}</Link></div>}
        </main>
      </div>
    </div></NotificationProvider></OrganizationAccessContext.Provider>
  );
}
