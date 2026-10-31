"use client";

import "./dashboard.css";
import { useEffect, useState, type ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Wheat,
  Bird,
  Bot,
  CircleDollarSign,
  BadgePercent,
  Icon,
  PanelsTopLeft,
  Settings,
  Headphones,
  Sprout,
  Stethoscope,
  Warehouse,
  X,
  type LucideProps,
} from "lucide-react";
import { barn, pigHead } from "@lucide/lab";
import {canAccessOrganizationPath, type OrganizationAccess} from "@/services/organizationAccess";
import apiClient from "@/services/api";
import { BullIcon, LactationIcon } from "@/components/cattle/CattleIcons";

interface SidebarOrganization {
  name: string;
}

type SidebarIcon = ComponentType<LucideProps>;

interface SidebarItem {
  title: string;
  href: string;
  icon: SidebarIcon;
  iconTone: "emerald" | "lime" | "rose" | "amber" | "sky" | "teal" | "orange" | "gold" | "earth" | "violet" | "blue" | "cyan";
  requiresAffiliate?: boolean;
  underDevelopment?: boolean;
}

interface SidebarSection {
  label: string;
  items: SidebarItem[];
}

const PigIcon: SidebarIcon = (props) => <Icon iconNode={pigHead} {...props} />;

const BarnIcon: SidebarIcon = (props) => <Icon iconNode={barn} {...props} />;

const sidebarSections: SidebarSection[] = [
  {
    label: "Operação",
    items: [
      { title: "Dashboard", href: "/home", icon: PanelsTopLeft, iconTone: "emerald" },
      { title: "Agenda", href: "/home/agenda", icon: CalendarDays, iconTone: "blue" },
      { title: "Plantações", href: "/home/plantacoes", icon: Sprout, iconTone: "lime" },
    ],
  },
  {
    label: "Segmentos",
    items: [
      { title: "Suinocultura", href: "/home/rebanho/suinos", icon: PigIcon, iconTone: "rose" },
      { title: "Tratos bovinos", href: "/home/rebanho/bovinos/racao/tratos", icon: Wheat, iconTone: "amber" },
      { title: "Gado de corte", href: "/home/rebanho/bovinos/corte", icon: BullIcon, iconTone: "amber" },
      { title: "Pecuária leiteira", href: "/home/rebanho/bovinos/pecuaria-leiteira", icon: LactationIcon, iconTone: "cyan" },
      { title: "Aves", href: "/home/rebanho/aves", icon: Bird, iconTone: "sky", underDevelopment: true },
      { title: "Clínica veterinária", href: "/home/clinico", icon: Stethoscope, iconTone: "teal" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { title: "Estoque", href: "/home/estoque/resumo", icon: Warehouse, iconTone: "orange" },
      { title: "Financeiro", href: "/home/financeiro", icon: CircleDollarSign, iconTone: "gold" },
      { title: "Estrutura da fazenda", href: "/home/estrutura", icon: BarnIcon, iconTone: "earth" },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { title: "Assistente IA", href: "/home/assistente-ia", icon: Bot, iconTone: "violet" },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Área do afiliado", href: "/home/afiliados", icon: BadgePercent, iconTone: "cyan", requiresAffiliate: true },
    ],
  },
];

interface AppSidebarProps {
  access?: OrganizationAccess | null;
  isOpen?: boolean;
  onClose?: () => void;
}

export function AppSidebar({ isOpen, onClose, access = null }: AppSidebarProps) {
  const pathname = usePathname();
  const [organization, setOrganization] = useState<SidebarOrganization | null>(null);
  const [isAffiliate, setIsAffiliate] = useState(false);

  const isActive = (href: string) => {
    if (href === "/home") return pathname === href;
    if (href === "/home/estoque/resumo") return pathname.startsWith("/home/estoque");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  useEffect(() => {
    if (window.innerWidth < 992 && onClose) onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    let active = true;
    apiClient
      .get<SidebarOrganization>("/organizations/me/")
      .then(({ data }) => {
        if (active) setOrganization(data);
      })
      .catch(() => {
        // Keep navigation available when organization data cannot be loaded.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiClient
      .get<{ is_affiliate: boolean }>("/auth/me/")
      .then(({ data }) => {
        if (active) setIsAffiliate(data.is_affiliate === true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <aside
      id="dashboard-sidebar"
      className={`dashboard-sidebar text-white ${isOpen ? "show" : ""}`}
      aria-label="Menu principal"
    >
      <header className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">
          <Image
            src="/logo_agro_leaf.png"
            alt=""
            width={42}
            height={42}
            priority
          />
        </div>
        <div className="sidebar-brand-copy">
          <strong>Fazenda Mais</strong>
          <span title={organization?.name}>{organization?.name || "Minha organização"}</span>
        </div>
        <button
          type="button"
          className="sidebar-close d-lg-none"
          onClick={onClose}
          aria-label="Fechar menu de navegação"
        >
          <X size={22} />
        </button>
      </header>

      <div className="sidebar-nav-container">
        <nav className="sidebar-navigation" aria-label="Áreas do sistema">
          {sidebarSections.filter(section => section.items.some(item => (item.href !== "/home/rebanho/bovinos/racao/tratos" || access?.role === "feeder") && (!item.requiresAffiliate || isAffiliate) && canAccessOrganizationPath(access,item.href))).map((section) => (
            <section className="sidebar-section" key={section.label} aria-labelledby={`sidebar-${section.label}`}>
              <h2 id={`sidebar-${section.label}`}>{section.label}</h2>
              <div className="sidebar-section-items">
                {section.items.filter((item) => (item.href !== "/home/rebanho/bovinos/racao/tratos" || access?.role === "feeder") && (!item.requiresAffiliate || isAffiliate) && canAccessOrganizationPath(access,item.href)).map((item) => {
                  const active = isActive(item.href);
                  return (
                    <div key={item.href}>
                    <Link
                      href={item.href}
                      className={`sidebar-link ${active ? "active" : ""}`}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className={`sidebar-link-icon tone-${item.iconTone}`} aria-hidden="true">
                        <item.icon size={19} strokeWidth={1.8} />
                      </span>
                      <span>{item.title}</span>
                      {item.underDevelopment && (
                        <span className="sidebar-link-badge">Em breve</span>
                      )}
                    </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <footer className="sidebar-footer">
          <Link href="/home/suporte" className={`sidebar-link sidebar-settings-link ${isActive("/home/suporte") ? "active" : ""}`} onClick={onClose} aria-current={isActive("/home/suporte") ? "page" : undefined}>
            <span className="sidebar-link-icon" aria-hidden="true"><Headphones size={19} /></span><span>Suporte</span>
          </Link>
          {access?.role !== "operator" && <Link
            href="/home/settings"
            className={`sidebar-link sidebar-settings-link ${isActive("/home/settings") ? "active" : ""}`}
            onClick={onClose}
            aria-current={isActive("/home/settings") ? "page" : undefined}
          >
            <span className="sidebar-link-icon" aria-hidden="true">
              <Settings size={19} strokeWidth={isActive("/home/settings") ? 2.3 : 2} />
            </span>
            <span>Configurações</span>
          </Link>}
        </footer>
      </div>
    </aside>
  );
}
