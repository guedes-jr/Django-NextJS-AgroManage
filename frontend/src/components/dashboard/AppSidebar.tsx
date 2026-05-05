"use client";

import "./dashboard.css";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sprout,
  LayoutDashboard,
  Beef,
  Wallet,
  Package,
  Users,
  Settings,
  ChevronDown,
  ChevronUp,
  BarChart3,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface SubItem {
  title: string;
  href: string;
}

interface ChildGroup {
  title: string;
  href: string;
  badge?: string;
  subItems?: SubItem[];
}

interface MenuItem {
  title: string;
  href: string;
  icon: any; /* eslint-disable-line */ 
  children?: ChildGroup[];
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", href: "/home", icon: LayoutDashboard },
  { 
    title: "Rebanho", 
    href: "/home/rebanho", 
    icon: Beef,
    children: [
      { 
        title: "Suínos", 
        href: "/home/rebanho/suinos",
        subItems: [
          { title: "Cadastro", href: "/home/rebanho/suinos/cadastro" },
          { title: "Ração", href: "/home/rebanho/suinos/racao" },
          { title: "Reprodução", href: "/home/rebanho/suinos/reproducao" },
        ]
      },
      { 
        title: "Aves", 
        href: "/home/rebanho/aves",
        subItems: [
          { title: "Cadastro", href: "/home/rebanho/aves/cadastro" },
          { title: "Ração", href: "/home/rebanho/aves/racao" },
          { title: "Reprodução", href: "/home/rebanho/aves/reproducao" },
        ]
      },
      { 
        title: "Bovinos", 
        href: "/home/rebanho/bovinos",
        subItems: [
          { title: "Cadastro", href: "/home/rebanho/bovinos/cadastro" },
          { title: "Ração", href: "/home/rebanho/bovinos/racao" },
          { title: "Reprodução", href: "/home/rebanho/bovinos/reproducao" },
        ]
      },
    ]
  },
  { title: "Financeiro", href: "/home/financeiro", icon: Wallet },
  { 
    title: "Estoque", 
    href: "/home/estoque", 
    icon: Package,
    children: [
      { title: "Resumo", href: "/home/estoque/resumo" },
      { title: "Produtos", href: "/home/estoque/produtos" },
      { title: "Movimentações", href: "/home/estoque/movimentacoes" },
      { title: "Fornecedores", href: "/home/estoque/fornecedores" },
      { title: "Alertas", href: "/home/estoque/alertas" },
    ]
  },
  { 
    title: "Relatórios", 
    href: "/home/relatorios", 
    icon: BarChart3,
    children: [
      { title: "Geral", href: "/home/relatorios/geral" },
      { title: "Estoque", href: "/home/relatorios/estoque" },
      { title: "Financeiro", href: "/home/relatorios/financeiro" },
      { title: "Rebanho", href: "/home/relatorios/rebanho" },
    ]
  },
];


interface AppSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  useEffect(() => {
    // Close sidebar on mobile when route changes
    if (window.innerWidth < 992 && onClose) {
      onClose();
    }

    // Automatically expand parent menu if a child is active
    const activeParent = menuItems.find(item =>
      item.children?.some(child =>
        pathname.startsWith(child.href)
      )
    );
    if (activeParent && !expandedMenus.includes(activeParent.title)) {
      setExpandedMenus([activeParent.title]);
    }

    // Automatically expand species group if a sub-item is active
    menuItems.forEach(item => {
      item.children?.forEach(child => {
        if (child.subItems?.some(sub => pathname.startsWith(sub.href))) {
          if (!expandedGroups.includes(child.href)) {
            setExpandedGroups(prev => [...prev, child.href]);
          }
        }
      });
    });
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/home" ? pathname === href : pathname.startsWith(href);

  const toggleExpand = (title: string) => {
    setExpandedMenus(prev =>
      prev.includes(title)
        ? [] // If clicking the same open one, close it
        : [title] // Opening a new one closes all others
    );
  };

  const toggleGroup = (href: string) => {
    setExpandedGroups(prev =>
      prev.includes(href)
        ? prev.filter(g => g !== href)
        : [...prev, href]
    );
  };

  return (
    <div className={`dashboard-sidebar d-flex flex-column text-white ${isOpen ? "show" : ""}`}>
      <div className="p-4 mb-4 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-3">
          <div 
            className="rounded-xl d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: 42, height: 42, background: 'rgba(255, 255, 255, 0.1)' }}
          >
            <Sprout size={24} className="text-white" />
          </div>
          <div>
            <div className="fw-black fs-5 lh-1 mb-1 text-white" style={{ letterSpacing: '-0.02em' }}>
              Gestão Agro
            </div>
            <div className="text-white/40" style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Fazenda São João
            </div>
          </div>
        </div>

        <button 
          className="btn btn-link p-0 d-lg-none text-white/60 hover-text-white transition-colors" 
          onClick={onClose}
        >
          <X size={24} />
        </button>
      </div>

      <div className="flex-grow-1 sidebar-nav-container">
        <div className="px-4 mb-3 text-uppercase text-white/30 small fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '0.08em' }}>
          OPERAÇÃO
        </div>
        <nav className="nav flex-column gap-1">
          {menuItems.map((item) => (
            <div key={item.title}>
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleExpand(item.title)}
                    className={`sidebar-link w-100 border-0 bg-transparent text-start ${isActive(item.href) ? "active" : ""}`}
                  >
                    <item.icon size={20} strokeWidth={isActive(item.href) ? 2.5 : 2} />
                    <span className="flex-grow-1">{item.title}</span>
                    {expandedMenus.includes(item.title) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <AnimatePresence>
                    {expandedMenus.includes(item.title) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="sidebar-submenu"
                        style={{ overflow: "hidden" }}
                      >
                        {item.children.map((child) => (
                          child.subItems ? (
                            <div key={child.href}>
                              <button
                                onClick={() => toggleGroup(child.href)}
                                className={`submenu-link w-100 border-0 bg-transparent text-start ${isActive(child.href) ? "active" : ""}`}
                              >
                                <span className="flex-grow-1">{child.title}</span>
                                {expandedGroups.includes(child.href)
                                  ? <ChevronUp size={13} />
                                  : <ChevronDown size={13} />
                                }
                              </button>
                              <AnimatePresence>
                                {expandedGroups.includes(child.href) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: "easeInOut" }}
                                    className="sidebar-subsubmenu"
                                    style={{ overflow: "hidden" }}
                                  >
                                    {child.subItems.map((sub) => (
                                      <Link
                                        key={sub.href}
                                        href={sub.href}
                                        className={`subsubmenu-link ${pathname === sub.href ? "active" : ""}`}
                                      >
                                        <span className="subsubmenu-dot" />
                                        {sub.title}
                                      </Link>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ) : (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`submenu-link ${pathname === child.href ? "active" : ""}`}
                            >
                              <span className="flex-grow-1">{child.title}</span>
                              {child.badge && (
                                <span 
                                  className="badge bg-primary text-white border-0 fw-black" 
                                  style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--primary)' }}
                                >
                                  {child.badge}
                                </span>
                              )}
                            </Link>
                          )
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <Link
                  href={item.href}
                  className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}
                >
                  <item.icon size={20} strokeWidth={isActive(item.href) ? 2.5 : 2} />
                  <span>{item.title}</span>
                </Link>
              )}
            </div>
          ))}
        </nav>
      </div>

      <div className="p-3 mt-auto">
        <div className="premium-badge-card p-3 mb-3 mx-2">
            <div className="d-flex align-items-center gap-2 mb-2">
                <div className="badge-icon-yellow">
                    <span className="small fw-bold text-dark">★</span>
                </div>
                <div className="fw-bold small text-white">Plano Premium</div>
            </div>
            <div className="text-white/50 fw-medium" style={{ fontSize: '0.7rem' }}>
                Válido até 20/08/2025
            </div>
        </div>

        <nav className="nav flex-column gap-1">
          <Link
            href="/home/settings"
            className={`sidebar-link ${isActive("/home/settings") ? "active" : ""}`}
          >
            <Settings size={20} strokeWidth={isActive("/home/settings") ? 2.5 : 2} />
            <span>Configurações</span>
          </Link>
        </nav>
      </div>

    </div>
  );
}