"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, User, ChevronDown, LogOut } from "lucide-react";
import { getMediaUrl } from "@/services/api";

interface UserData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar: string | null;
}

const getStoredUser = (): UserData | null => {
  const userData = localStorage.getItem("user");
  if (userData) {
    return JSON.parse(userData);
  }
  return null;
};

export function TopBar() {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<UserData | null>(getStoredUser);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  return (
    <header className="topbar-premium">
      <div className="search-input-wrapper">
        <Search size={18} className="text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar animal, talhão, lote..."
          className="border-0 bg-transparent w-100 small fw-medium"
          style={{ outline: 'none', color: 'var(--foreground)' }}
        />
      </div>

      <div className="d-flex align-items-center gap-3">
        <button className="btn p-2 rounded-circle hover-bg-muted position-relative" style={{ transition: 'all 0.2s' }}>
          <Bell size={20} className="text-muted-foreground" />
          <span className="position-absolute top-1 start-1 d-flex align-items-center justify-content-center rounded-circle bg-destructive text-white" 
                style={{ width: '16px', height: '16px', fontSize: '10px', fontWeight: 700, border: '2px solid white' }}>
            3
          </span>
        </button>
        
        <div className="position-relative" ref={dropdownRef}>
          <button
            className="btn d-flex align-items-center gap-2 p-1 pe-3 rounded-pill hover-bg-muted"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{ transition: 'all 0.2s' }}
          >
            {user?.avatar ? (
              <img
                src={getMediaUrl(user.avatar)}
                alt={user.full_name}
                className="rounded-circle object-fit-cover"
                style={{ width: '36px', height: '36px' }}
              />
            ) : (
              <div className="rounded-circle bg-primary d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
                style={{ width: '36px', height: '36px', fontSize: '0.875rem' }}>
                {user?.full_name?.charAt(0) || "U"}
              </div>
            )}
            <div className="text-start d-none d-lg-block">
              <div className="fw-bold text-dark small leading-none">{user?.full_name || "Usuário"}</div>
              <div className="text-muted-foreground" style={{ fontSize: '0.65rem', fontWeight: 600 }}>Perfil</div>
            </div>
            <ChevronDown size={16} className="text-muted-foreground" />
          </button>
          
          {dropdownOpen && (
            <div className="position-absolute end-0 mt-2 bg-white" style={{ minWidth: '180px', zIndex: 50, borderRadius: '20px', border: '1.5px solid var(--border)', boxShadow: 'var(--card-premium-shadow)' }}>
              <button 
                className="dropdown-item px-3 py-2 w-100 text-start d-flex align-items-center gap-2 border-0 bg-transparent"
                style={{ borderBottom: '1px solid var(--border)' }}
                onClick={() => router.push("/home/profile")}
              >
                <User size={16} />
                Meu Perfil
              </button>
              <button 
                className="dropdown-item px-3 py-2 w-100 text-start d-flex align-items-center gap-2 border-0 bg-transparent text-danger"
                onClick={handleLogout}
              >
                <LogOut size={16} />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}