"use client";

import { Search, Bell, User } from "lucide-react";

export function TopBar() {
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
        
        <div className="dropdown">
          <button
            className="btn d-flex align-items-center gap-3 p-1 pe-3 rounded-pill hover-bg-muted"
            data-bs-toggle="dropdown"
            style={{ transition: 'all 0.2s' }}
          >
            <div className="rounded-circle bg-primary d-flex align-items-center justify-content-center text-white fw-bold shadow-sm" 
                 style={{ width: '36px', height: '36px', fontSize: '0.875rem' }}>
              JS
            </div>
            <div className="text-start d-none d-lg-block">
              <div className="fw-bold text-dark small leading-none">João Silva</div>
              <div className="text-muted-foreground" style={{ fontSize: '0.65rem', fontWeight: 600 }}>Administrador</div>
            </div>
          </button>
          <ul className="dropdown-menu dropdown-menu-end shadow-elegant border-0 rounded-xl mt-2">
            <li><a className="dropdown-item px-3 py-2 rounded-lg mx-2" href="/home/profile">Meu Perfil</a></li>
            <li><a className="dropdown-item px-3 py-2 rounded-lg mx-2" href="/home/settings">Configurações</a></li>
            <li><hr className="dropdown-divider opacity-50" /></li>
            <li><a className="dropdown-item px-3 py-2 rounded-lg mx-2 text-destructive" href="/logout">Sair</a></li>
          </ul>
        </div>
      </div>
    </header>
  );
}