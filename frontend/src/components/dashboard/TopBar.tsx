"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut, ChevronDown, Bell, Menu } from "lucide-react";
import Image from "next/image";

interface UserData {
  id: number;
  email: string;
  full_name: string;
  role: string;
}

const getStoredUser = (): UserData | null => {
  if (typeof window === 'undefined') return null;
  const userData = localStorage.getItem("user");
  if (userData) {
    try {
      return JSON.parse(userData);
    } catch (e) {
      return null;
    }
  }
  return null;
};

// Map technical roles to user-friendly Portuguese labels and colors
const roleConfig: Record<string, { label: string; color: string; bg: string }> = {
  owner: { label: "Proprietário", color: "#92400e", bg: "#fef3c7" }, // Amber
  admin: { label: "Administrador", color: "#1e40af", bg: "#dbeafe" }, // Blue
  manager: { label: "Gerente", color: "#166534", bg: "#dcfce7" }, // Green
  operator: { label: "Operador", color: "#374151", bg: "#f3f4f6" }, // Grey/Zinc
  viewer: { label: "Consultor", color: "#155e75", bg: "#ecfeff" }, // Cyan
};

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
    }
    router.push("/login");
  };

  const roleAttr = roleConfig[user?.role?.toLowerCase() || "operator"] || roleConfig.operator;

  return (
    <header 
      className="d-flex justify-content-between align-items-center p-3 px-4 shadow-sm"
      style={{ background: 'var(--background)', zIndex: 10, borderBottom: '1px solid var(--border)' }}
    >
      <div className="d-flex align-items-center gap-2">
        <button 
          className="btn btn-link p-0 d-lg-none text-foreground" 
          onClick={onMenuClick}
        >
          <Menu size={24} />
        </button>
        <div className="d-none d-lg-block">
          {/* Breadcrumb placeholders or empty for page context */}
        </div>
      </div>

      {/* Central Search Bar */}
      <div className="flex-grow-1 d-flex justify-content-center px-4">
        <div className="search-input-wrapper">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input 
            type="text" 
            placeholder="Buscar por código, brinco ou lote..." 
            className="border-0 bg-transparent w-100 outline-none" 
            style={{ outline: 'none', fontSize: '0.9rem' }}
          />
        </div>
      </div>

      <div className="d-flex align-items-center gap-3">
        {/* Notifications */}
        <button className="btn btn-link text-muted-foreground p-1 position-relative hover-text-primary transition-colors">
          <Bell size={22} />
          <span 
            className="position-absolute top-0 start-100 translate-middle badge rounded-circle bg-danger border border-2 border-white"
            style={{ width: '18px', height: '18px', padding: '0', fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '6px', marginLeft: '-6px' }}
          >
            3
          </span>
        </button>

        {/* User Profile */}
        <div className="position-relative ms-2">
          <button 
            className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <div 
              className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
              style={{ width: '38px', height: '38px', background: 'oklch(0.25 0.08 145)', fontSize: '0.8rem' }}
            >
              AG
            </div>
            <div className="d-flex align-items-center gap-1 d-none d-sm-flex">
              <span className="fw-semibold text-foreground" style={{ fontSize: '0.9rem' }}>
                Admin
              </span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </div>
          </button>


          {/* Dropdown Menu */}
          {showDropdown && (
            <div 
              className="position-absolute end-0 mt-2 shadow-lg border border-border py-2"
              style={{ background: 'var(--background)', width: '200px', zIndex: 1000, borderRadius: '12px' }}
            >
              <div className="px-3 py-2 border-bottom border-border mb-1 d-sm-none">
                <span className="fw-semibold d-block text-foreground" style={{ fontSize: '0.875rem' }}>
                  {user?.full_name || "Usuário"}
                </span>
                <span 
                   className="rounded-pill fw-bold d-inline-block" 
                   style={{ 
                     fontSize: '0.65rem', 
                     backgroundColor: roleAttr.bg, 
                     color: roleAttr.color,
                     padding: '4px 12px' // Increased padding as requested
                   }}
                >
                  {roleAttr.label}
                </span>
              </div>
              <button 
                onClick={() => { router.push('/home/profile'); setShowDropdown(false); }}
                className="w-100 btn btn-link text-decoration-none text-start px-3 py-2 text-muted-foreground hover-bg-muted hover-text-foreground transition-colors d-flex align-items-center gap-2"
              >
                <User size={16} /> Meu Perfil
              </button>
              <button 
                onClick={handleLogout}
                className="w-100 btn btn-link text-decoration-none text-start px-3 py-2 mt-1 text-danger hover-bg-danger/10 transition-colors border-top border-border rounded-0 d-flex align-items-center gap-2"
              >
                <LogOut size={16} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
