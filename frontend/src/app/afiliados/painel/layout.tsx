"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, FileChartColumn, Handshake, LayoutDashboard, LogOut, Menu, Moon, ReceiptText, Settings, Sun, Users, X } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import styles from "./portal.module.css";
import { usePublicLocale } from "@/lib/publicLocale";


export default function AffiliatePortalLayout({ children }: { children: React.ReactNode }) {
  return <AffiliatePortalContent>{children}</AffiliatePortalContent>;
}

function AffiliatePortalContent({ children }: { children: React.ReactNode }) {
  const { t } = usePublicLocale();
const navigation = [
  { href: "/afiliados/painel", label: t("sidebar.dashboard"), icon: LayoutDashboard, exact: true },
  { href: "/afiliados/painel/indicacoes", label: t("affiliate.referrals"), icon: Users },
  { href: "/afiliados/painel/comissoes", label: t("affiliate.commissions"), icon: ReceiptText },
  { href: "/afiliados/painel/relatorios", label: t("swine.home.module.reports"), icon: FileChartColumn },
  { href: "/afiliados/painel/configuracoes", label: t("settings.title"), icon: Settings },
];

  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState("Afiliado");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("affiliate_user") || localStorage.getItem("user");
      if (stored) queueMicrotask(() => setName(JSON.parse(stored).full_name || "Afiliado"));
    } catch { queueMicrotask(() => setName("Afiliado")); }
  }, []);

  const logout = () => {
    ["access_token", "refresh_token", "affiliate_user", "affiliate_profile", "user"].forEach((key) => localStorage.removeItem(key));
    router.replace("/login");
  };

  return <div className={`app-workspace ${styles.shell}`}>
    <aside className={`workspace-fixed-sidebar ${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
      <div className={styles.brand}><span className={styles.brandIcon}><Handshake size={23} /></span><div><strong>{t("workspace.affiliatePortal")}</strong><span>Fazenda Mais</span></div><button className={styles.closeMenu} onClick={() => setMenuOpen(false)} aria-label={t("workspace.closeMenu")}><X /></button></div>
      <nav className={styles.navigation} aria-label={t("workspace.portalNavigation")}><span className={styles.navLabel}>{t("swine.tabOverview")}</span>{navigation.map((item) => { const active = item.exact ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={active ? styles.activeLink : ""}><item.icon size={19} /><span>{item.label}</span></Link>; })}</nav>
      <div className={styles.sidebarSummary}><BarChart3 size={18} /><div><strong>{t("workspace.trackYourResults")}</strong><span>{t("workspace.dataUpdatedInRealTime")}</span></div></div>
    </aside>
    {menuOpen && <button className={styles.backdrop} onClick={() => setMenuOpen(false)} aria-label={t("workspace.closeMenu")} />}
    <div className={`workspace-fixed-offset ${styles.contentArea}`}><header className={`workspace-topbar ${styles.topbar}`}><button className={styles.menuButton} onClick={() => setMenuOpen(true)} aria-label={t("openMenu")}><Menu /></button><div className={styles.welcome}><span>{t("workspace.welcome")}</span><strong>{name}</strong></div><div className={styles.topActions}><button className={styles.iconButton} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={t("workspace.toggleTheme")} aria-label={t("workspace.toggleTheme")}>{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button><button className={styles.logout} onClick={logout}><LogOut size={17} /><span>{t("topbar.logout")}</span></button></div></header><main className={`workspace-content ${styles.main}`}>{children}</main></div>
  </div>;
}
