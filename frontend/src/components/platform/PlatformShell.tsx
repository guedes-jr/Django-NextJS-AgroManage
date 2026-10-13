"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Activity, Bot, Building2, ClipboardList, CreditCard, Eye, Handshake, LayoutDashboard, LogOut, RefreshCw, ScrollText, Settings, ShieldCheck, Tags, Terminal, UserCog, Users, WalletCards, BookOpen, MessageCircle, Bell, Megaphone, ChevronDown, Menu, X, type LucideIcon } from "lucide-react";

import { clearPlatformSession, platformService, PLATFORM_STAFF } from "@/services/platformApi";
import type { PlatformStaff } from "@/types/platform";
import { ContextualBackButton } from "@/components/navigation/ContextualBackButton";

const administrators = ["platform_owner", "platform_admin"];
interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: string[];
}
const navigationGroups: { id: string; label: string; icon: LucideIcon; items: NavigationItem[] }[] = [
  { id: "customers", label: "Clientes e atendimento", icon: Building2, items: [
    { href: "/platform/organizations", label: "Organizações", icon: Building2 },
    { href: "/platform/users", label: "Usuários", icon: Users },
    { href: "/platform/demo-requests", label: "Demonstrações", icon: ClipboardList },
    { href: "/platform/support", label: "Central de suporte", icon: BookOpen, roles: administrators },
    { href: "/platform/support-access", label: "Acesso assistido", icon: Eye, roles: [...administrators, "platform_support"] },
  ] },
  { id: "commercial", label: "Comercial e financeiro", icon: WalletCards, items: [
    { href: "/platform/plans", label: "Planos e assinaturas", icon: Tags },
    { href: "/platform/finance", label: "Financeiro SaaS", icon: WalletCards },
    { href: "/platform/payment-gateways", label: "Gateways", icon: CreditCard },
    { href: "/platform/affiliates", label: "Afiliados", icon: Handshake, roles: administrators },
  ] },
  { id: "communication", label: "Comunicação", icon: MessageCircle, items: [
    { href: "/platform/marketing", label: "Propagandas", icon: Megaphone, roles: administrators },
    { href: "/platform/notifications", label: "Notificações", icon: Bell, roles: administrators },
    { href: "/platform/whatsapp-web", label: "WhatsApp Web", icon: MessageCircle, roles: administrators },
  ] },
  { id: "management", label: "Gestão da plataforma", icon: Settings, items: [
    { href: "/platform/operations", label: "Operações", icon: Activity },
    { href: "/platform/ai", label: "Inteligência artificial", icon: Bot },
    { href: "/platform/settings", label: "Configurações", icon: Settings },
    { href: "/platform/system-update", label: "Atualização do sistema", icon: RefreshCw, roles: administrators },
    { href: "/platform/team", label: "Equipe interna", icon: UserCog, roles: administrators },
    { href: "/platform/audit", label: "Auditoria", icon: ScrollText, roles: [...administrators, "platform_auditor"] },
    { href: "/platform/operations/queries", label: "Consultas aprovadas", icon: Terminal, roles: ["platform_developer"] },
    { href: "/platform/operations/sandbox", label: "Acesso JIT", icon: ShieldCheck, roles: [...administrators, "platform_developer"] },
  ] },
];

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [staff, setStaff] = useState<PlatformStaff | null>(null);
  const [checking, setChecking] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState<{ path: string; group: string | null } | null>(null);
  const groups = navigationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(staff?.role || "")),
  })).filter((group) => group.items.length);
  const activeHref = groups.flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const activeGroup = groups.find((group) => group.items.some((item) => item.href === activeHref))?.id;
  const expandedGroup = expanded?.path === pathname ? expanded.group : activeGroup;

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLButtonElement>(".platform-menu-close")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
      if (event.key !== "Tab") return;
      const controls = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>("a, button") || [])
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    const closeOnDesktop = () => {
      if (window.innerWidth > 900) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktop);
      previousFocus?.focus();
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    platformService.me()
      .then((current) => {
        setStaff(current);
        localStorage.setItem(PLATFORM_STAFF, JSON.stringify(current));
      })
      .catch(() => {
        clearPlatformSession();
        router.replace("/login");
      })
      .finally(() => setChecking(false));
  }, [router]);

  const logout = () => {
    clearPlatformSession();
    router.replace("/login");
  };

  if (checking && !staff) {
    return <div className="platform-root d-grid place-items-center"><div className="spinner-border text-success" /></div>;
  }

  return (
    <div className="platform-root">
      {mobileMenuOpen && <button className="platform-menu-backdrop" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />}
      <aside ref={sidebarRef} id="platform-navigation" className={`platform-sidebar${mobileMenuOpen ? " is-open" : ""}`}>
        <button className="platform-menu-close" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><X size={21} /></button>
        <div className="platform-brand">
          <div className="platform-brand-mark"><ShieldCheck size={23} /></div>
          <div className="platform-brand-copy">
            <div className="fw-bold">Fazenda Mais</div>
            <div className="small text-white-50">Central da plataforma</div>
          </div>
        </div>
        <nav className="platform-nav" aria-label="Navegação da plataforma">
          <Link href="/platform" className={pathname === "/platform" ? "active" : ""} aria-current={pathname === "/platform" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>
            <LayoutDashboard size={19} /><span className="nav-label">Visão geral</span>
          </Link>
          <div className="platform-nav-caption">Áreas da plataforma</div>
          {groups.map((group) => {
            const open = expandedGroup === group.id;
            return <div key={group.id} className={`platform-nav-group${activeGroup === group.id ? " has-active" : ""}`}>
              <button className="platform-nav-group-toggle" aria-expanded={open} aria-controls={`platform-group-${group.id}`} onClick={() => setExpanded({ path: pathname, group: open ? null : group.id })}>
                <group.icon size={18} /><span>{group.label}</span><ChevronDown size={16} className={open ? "is-expanded" : ""} />
              </button>
              <div id={`platform-group-${group.id}`} className="platform-nav-group-items" hidden={!open}>
                {group.items.map((item) => <Link key={item.href} href={item.href} className={activeHref === item.href ? "active" : ""} aria-current={activeHref === item.href ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>
                  <item.icon size={17} /><span className="nav-label">{item.label}</span>
                </Link>)}
              </div>
            </div>;
          })}
        </nav>
      </aside>
      <div className="platform-main">
        <header className="platform-topbar">
          <div className="d-flex align-items-center gap-3"><button className="platform-menu-toggle" aria-label="Abrir menu da plataforma" aria-expanded={mobileMenuOpen} aria-controls="platform-navigation" onClick={() => setMobileMenuOpen(true)}><Menu size={22} /></button><ContextualBackButton area="platform" /><div><strong>Backoffice</strong><span className="text-muted ms-2 small">Ambiente administrativo</span></div></div>
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
