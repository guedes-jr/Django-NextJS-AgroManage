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
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface MenuItem {
  title: string;
  href: string;
  icon: any; /* eslint-disable-line */ 
  children?: { title: string; href: string }[];
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", href: "/home", icon: LayoutDashboard },
  { 
    title: "Rebanho", 
    href: "/home/rebanho", 
    icon: Beef,
    children: [
      { title: "Animais", href: "/home/rebanho/animais" },
    ]
  },
  { title: "Financeiro", href: "/home/financeiro", icon: Wallet },
  { title: "Estoque", href: "/home/estoque", icon: Package },
  { title: "Usuários", href: "/home/usuarios", icon: Users },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  useEffect(() => {
    // Automatically expand parent if a child is active
    menuItems.forEach(item => {
      if (item.children?.some(child => pathname.startsWith(child.href))) {
        if (!expandedMenus.includes(item.title)) {
          setExpandedMenus(prev => [...prev, item.title]);
        }
      }
    });
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/home" ? pathname === href : pathname.startsWith(href);

  const toggleExpand = (title: string) => {
    setExpandedMenus(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  return (
    <div className="dashboard-sidebar d-flex flex-column text-white">
      <div className="p-4 mb-3">
        <div className="d-flex align-items-center gap-3">
          <div className="bg-white/10 rounded-xl d-flex align-items-center justify-content-center p-2 shadow-sm">
            <Sprout size={24} className="text-white" />
          </div>
          <div>
            <div className="fw-black fs-5 mb-0" style={{ letterSpacing: '-0.02em' }}>
              Gestão <span style={{ color: 'var(--gold)' }}>Agro</span>
            </div>
            <div className="text-white/40" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Fazenda São João
            </div>
          </div>
        </div>
      </div>

      <div className="flex-grow-1 sidebar-nav-container">
        <div className="px-4 mb-3 text-uppercase text-white/30 small fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>
          Operação
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
                          <Link
                            key={child.title}
                            href={child.href}
                            className={`submenu-link ${pathname === child.href ? "active" : ""}`}
                          >
                            {child.title}
                          </Link>
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

      <div className="p-3 mt-auto border-top border-white/5">
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