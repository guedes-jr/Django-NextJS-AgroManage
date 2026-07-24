"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Building2, Eye, LayoutDashboard, LogOut, ScrollText, Settings, ShieldCheck, Tags, Terminal, UserCog, Users, WalletCards } from "lucide-react";

import { clearPlatformSession, platformService, PLATFORM_STAFF } from "@/services/platformApi";
import type { PlatformStaff } from "@/types/platform";

const navigation = [
  { href: "/platform", label: "Visão geral", icon: LayoutDashboard },
  { href: "/platform/organizations", label: "Organizações", icon: Building2 },
  { href: "/platform/users", label: "Usuários", icon: Users },
  { href: "/platform/plans", label: "Planos e assinaturas", icon: Tags },
  { href: "/platform/finance", label: "Financeiro SaaS", icon: WalletCards },
  { href: "/platform/operations", label: "Operações", icon: Activity },
  { href: "/platform/settings", label: "Configurações", icon: Settings },
];

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [staff, setStaff] = useState<PlatformStaff | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    platformService.me()
      .then((current) => {
        setStaff(current);
        localStorage.setItem(PLATFORM_STAFF, JSON.stringify(current));
      })
      .catch(() => {
        clearPlatformSession();
        router.replace("/platform/login");
      })
      .finally(() => setChecking(false));
  }, [router]);

  const logout = () => {
    clearPlatformSession();
    router.replace("/platform/login");
  };

  if (checking && !staff) {
    return <div className="platform-root d-grid place-items-center"><div className="spinner-border text-success" /></div>;
  }

  return (
    <div className="platform-root">
      <aside className="platform-sidebar">
        <div className="platform-brand">
          <div className="platform-brand-mark"><ShieldCheck size={23} /></div>
          <div className="platform-brand-copy">
            <div className="fw-bold">AgroManage</div>
            <div className="small text-white-50">Central da plataforma</div>
          </div>
        </div>
        <nav className="platform-nav">
          {navigation.map((item) => {
            const active = item.href === "/platform" ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={active ? "active" : ""}><item.icon size={19} /><span className="nav-label">{item.label}</span></Link>;
          })}
          {["platform_owner", "platform_admin"].includes(staff?.role || "") && (
            <Link href="/platform/team" className={pathname.startsWith("/platform/team") ? "active" : ""}>
              <UserCog size={19} /><span className="nav-label">Equipe interna</span>
            </Link>
          )}
          {["platform_owner", "platform_admin", "platform_auditor"].includes(staff?.role || "") && (
            <Link href="/platform/audit" className={pathname.startsWith("/platform/audit") ? "active" : ""}>
              <ScrollText size={19} /><span className="nav-label">Auditoria</span>
            </Link>
          )}
          {["platform_owner", "platform_admin", "platform_support"].includes(staff?.role || "") && (
            <Link href="/platform/support-access" className={pathname.startsWith("/platform/support-access") ? "active" : ""}>
              <Eye size={19} /><span className="nav-label">Acesso assistido</span>
            </Link>
          )}
          {staff?.role === "platform_developer" && (
            <Link href="/platform/operations/queries" className={pathname.startsWith("/platform/operations/queries") ? "active" : ""}>
              <Terminal size={19} /><span className="nav-label">Consultas aprovadas</span>
            </Link>
          )}
          {["platform_owner", "platform_admin", "platform_developer"].includes(staff?.role || "") && (
            <Link href="/platform/operations/sandbox" className={pathname.startsWith("/platform/operations/sandbox") ? "active" : ""}>
              <ShieldCheck size={19} /><span className="nav-label">Acesso JIT</span>
            </Link>
          )}
        </nav>
      </aside>
      <div className="platform-main">
        <header className="platform-topbar">
          <div><strong>Backoffice</strong><span className="text-muted ms-2 small">Ambiente administrativo</span></div>
          <div className="d-flex align-items-center gap-3">
            <div className="text-end d-none d-sm-block"><div className="small fw-bold">{staff?.full_name}</div><div className="text-muted" style={{fontSize:12}}>{staff?.role_display}</div></div>
            <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2" onClick={logout}><LogOut size={15} /> Sair</button>
          </div>
        </header>
        <main className="platform-content">{children}</main>
      </div>
    </div>
  );
}
