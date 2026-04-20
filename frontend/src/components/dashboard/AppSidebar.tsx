"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sprout,
  LayoutDashboard,
  Beef,
  Wheat,
  Wallet,
  Package,
  Users,
  Settings,
} from "lucide-react";

const menuItems = [
  { title: "Dashboard", href: "/home", icon: LayoutDashboard },
  { title: "Rebanho", href: "/home/rebanho", icon: Beef },
  { title: "Lavoura", href: "/home/lavoura", icon: Wheat },
  { title: "Financeiro", href: "/home/financeiro", icon: Wallet },
  { title: "Estoque", href: "/home/estoque", icon: Package },
  { title: "Usuários", href: "/home/usuarios", icon: Users },
];

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/home" ? pathname === href : pathname.startsWith(href);

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

      <div className="flex-grow-1 overflow-auto">
        <div className="px-4 mb-3 text-uppercase text-white/30 small fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>
          Operação
        </div>
        <nav className="nav flex-column gap-1">
          {menuItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}
            >
              <item.icon size={20} strokeWidth={isActive(item.href) ? 2.5 : 2} />
              <span>{item.title}</span>
            </Link>
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