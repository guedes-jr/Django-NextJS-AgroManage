"use client";

import { Search, Bell, User } from "lucide-react";

export function TopBar() {
  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom px-3 py-2">
      <div className="container-fluid">
        <div className="d-flex align-items-center bg-light rounded px-3 py-2" style={{ maxWidth: '400px', flex: 1 }}>
          <Search size={18} className="text-muted me-2" />
          <input
            type="text"
            placeholder="Buscar..."
            className="border-0 bg-transparent w-100"
            style={{ outline: 'none' }}
          />
        </div>

        <div className="d-flex align-items-center gap-3">
          <button className="btn position-relative p-2">
            <Bell size={20} className="text-muted" />
            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '10px' }}>
              3
            </span>
          </button>
          
          <div className="dropdown">
            <button
              className="btn d-flex align-items-center gap-2"
              data-bs-toggle="dropdown"
            >
              <div className="rounded-circle bg-success d-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px' }}>
                <User size={18} className="text-white" />
              </div>
              <span className="d-none d-lg-inline text-dark">Admin</span>
            </button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li><a className="dropdown-item" href="/home/profile">Perfil</a></li>
              <li><a className="dropdown-item" href="/home/settings">Configurações</a></li>
              <li><hr className="dropdown-divider" /></li>
              <li><a className="dropdown-item" href="/logout">Sair</a></li>
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
}