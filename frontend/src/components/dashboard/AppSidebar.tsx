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
  LogOut,
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
    <div className="d-flex flex-column flex-shrink-0 bg-dark text-white" style={{ width: '260px', minHeight: '100vh' }}>
      <div className="border-bottom border-secondary p-3">
        <div className="d-flex align-items-center">
          <div className="bg-warning rounded d-flex align-items-center justify-content-center me-3" style={{ width: '40px', height: '40px' }}>
            <Sprout size={20} className="text-dark" />
          </div>
          <div>
            <div className="fw-bold mb-0">AgroManage</div>
            <small className="text-muted">Gestão Agropecuária</small>
          </div>
        </div>
      </div>

      <div className="flex-grow-1 py-2 overflow-auto">
        <div className="px-3 mb-2 text-uppercase text-muted small fw-semibold">
          Operação
        </div>
        <nav className="nav flex-column">
          {menuItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className={`nav-link px-3 py-2 rounded mx-2 mb-1 ${
                isActive(item.href)
                  ? "bg-success text-white"
                  : "text-white-50"
              }`}
            >
              <item.icon size={18} className="me-2" />
              <span>{item.title}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-top border-secondary p-2">
        <nav className="nav flex-column">
          <Link
            href="/home/settings"
            className="nav-link px-3 py-2 rounded mx-2 mb-1 text-white-50"
          >
            <Settings size={18} className="me-2" />
            <span>Configurações</span>
          </Link>
          <Link
            href="/logout"
            className="nav-link px-3 py-2 rounded mx-2 mb-1 text-white-50"
          >
            <LogOut size={18} className="me-2" />
            <span>Sair</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}