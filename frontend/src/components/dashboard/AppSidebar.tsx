"use client";

import "./dashboard.css";
import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bird,
  CircleDollarSign,
  Handshake,
  Icon,
  LayoutDashboard,
  PackageOpen,
  Sparkles,
  Settings,
  Sprout,
  Stethoscope,
  UsersRound,
  Wheat,
  X,
  type LucideProps,
} from "lucide-react";
import { barn, cowHead, pigHead } from "@lucide/lab";
import apiClient from "@/services/api";

interface SidebarOrganization {
  name: string;
  subscription: null | {
    plan_name: string;
    status: string;
    current_period_ends_at: string | null;
    discount_type: "percentage" | "fixed_amount" | "";
    discount_value: string;
    discount_ends_at: string | null;
    has_active_discount: boolean;
  };
}

type SidebarIcon = ComponentType<LucideProps>;

interface SidebarItem {
  title: string;
  href: string;
  icon: SidebarIcon;
  requiresAffiliate?: boolean;
  underDevelopment?: boolean;
}

interface SidebarSection {
  label: string;
  items: SidebarItem[];
}

const PigIcon: SidebarIcon = (props) => <Icon iconNode={pigHead} {...props} />;
const CowIcon: SidebarIcon = (props) => <Icon iconNode={cowHead} {...props} />;
const BarnIcon: SidebarIcon = (props) => <Icon iconNode={barn} {...props} />;

const sidebarSections: SidebarSection[] = [
  {
    label: "Operação",
    items: [
      { title: "Dashboard", href: "/home", icon: LayoutDashboard },
      { title: "Plantações", href: "/home/plantacoes", icon: Wheat },
    ],
  },
  {
    label: "Rebanhos",
    items: [
      { title: "Suínos", href: "/home/rebanho/suinos", icon: PigIcon },
      { title: "Bovinos", href: "/home/rebanho/bovinos", icon: CowIcon, underDevelopment: true },
      { title: "Aves", href: "/home/rebanho/aves", icon: Bird, underDevelopment: true },
      { title: "Clínica veterinária", href: "/home/clinico", icon: Stethoscope },
    ],
  },
  {
    label: "Gestão",
    items: [
      { title: "Estoque", href: "/home/estoque/resumo", icon: PackageOpen },
      { title: "Financeiro", href: "/home/financeiro", icon: CircleDollarSign },
      { title: "Estrutura da fazenda", href: "/home/estrutura", icon: BarnIcon },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { title: "Assistente IA", href: "/home/assistente-ia", icon: Sparkles },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Equipe e usuários", href: "/home/usuarios", icon: UsersRound },
      { title: "Área do afiliado", href: "/home/afiliados", icon: Handshake, requiresAffiliate: true },
    ],
  },
];

const subscriptionStatus: Record<string, string> = {
  active: "Assinatura ativa",
  trialing: "Período de avaliação",
  past_due: "Pagamento pendente",
  suspended: "Assinatura suspensa",
  canceled: "Assinatura cancelada",
  cancelled: "Assinatura cancelada",
};

interface AppSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
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
        // The menu remains usable when organization or billing data is unavailable.
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

  const plan = organization?.subscription;
  const planStatus = plan?.current_period_ends_at
    ? `Válido até ${new Date(plan.current_period_ends_at).toLocaleDateString("pt-BR")}`
    : plan?.status
      ? subscriptionStatus[plan.status] || "Consulte sua assinatura"
      : "Consulte sua assinatura";

  return (
    <aside
      id="dashboard-sidebar"
      className={`dashboard-sidebar text-white ${isOpen ? "show" : ""}`}
      aria-label="Menu principal"
    >
      <header className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">
          <Sprout size={27} strokeWidth={2.1} />
        </div>
        <div className="sidebar-brand-copy">
          <strong>Gestão Agro</strong>
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
          {sidebarSections.map((section) => (
            <section className="sidebar-section" key={section.label} aria-labelledby={`sidebar-${section.label}`}>
              <h2 id={`sidebar-${section.label}`}>{section.label}</h2>
              <div className="sidebar-section-items">
                {section.items.filter((item) => !item.requiresAffiliate || isAffiliate).map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`sidebar-link ${active ? "active" : ""}`}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="sidebar-link-icon" aria-hidden="true">
                        <item.icon size={22} strokeWidth={active ? 2.25 : 1.9} />
                      </span>
                      <span>{item.title}</span>
                      {item.underDevelopment && (
                        <span className="sidebar-link-badge">Em breve</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </div>

      <footer className="sidebar-footer">
        <div className="premium-badge-card">
          <div className="sidebar-plan-heading">
            <div className="badge-icon-yellow" aria-hidden="true">★</div>
            <strong>Plano {plan?.plan_name || "não informado"}</strong>
          </div>
          <span>{planStatus}</span>
          {plan?.has_active_discount && (
            <small>
              {plan.discount_type === "percentage"
                ? `${Number(plan.discount_value).toLocaleString("pt-BR")}% de desconto`
                : `${Number(plan.discount_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto`}
              {plan.discount_ends_at
                ? ` até ${new Date(plan.discount_ends_at).toLocaleDateString("pt-BR")}`
                : " permanente"}
            </small>
          )}
        </div>

        <Link
          href="/home/settings"
          className={`sidebar-link sidebar-settings-link ${isActive("/home/settings") ? "active" : ""}`}
          onClick={onClose}
          aria-current={isActive("/home/settings") ? "page" : undefined}
        >
          <span className="sidebar-link-icon" aria-hidden="true">
            <Settings size={22} strokeWidth={isActive("/home/settings") ? 2.25 : 1.9} />
          </span>
          <span>Configurações</span>
        </Link>
      </footer>
    </aside>
  );
}
