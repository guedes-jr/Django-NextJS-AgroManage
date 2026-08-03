"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  return <header className="marketing-header">
    <div className="marketing-container header-inner">
      <Link href="/" className="marketing-brand" aria-label="AgroManage - início">
        <Image src="/logo_primary.png" alt="" width={38} height={38} priority />
        <span>Agro<strong>Manage</strong></span>
      </Link>
      <button className="marketing-menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Abrir menu">
        {open ? <X /> : <Menu />}
      </button>
      <nav className={open ? "marketing-nav open" : "marketing-nav"}>
        <Link href="/recursos" onClick={() => setOpen(false)}>Recursos</Link>
        <Link href="/planos" onClick={() => setOpen(false)}>Planos</Link>
        <Link href="/contato" onClick={() => setOpen(false)}>Contato</Link>
        <Link href="/login" className="nav-login" onClick={() => setOpen(false)}>Entrar</Link>
        <Link href="/contato" className="marketing-button primary small" onClick={() => setOpen(false)}>Solicitar demonstração</Link>
      </nav>
    </div>
  </header>;
}
