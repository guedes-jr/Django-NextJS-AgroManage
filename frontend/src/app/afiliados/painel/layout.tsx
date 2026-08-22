"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, FileChartColumn, Handshake, LayoutDashboard, LogOut, Menu, Moon, ReceiptText, Settings, Sun, Users, X } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import styles from "./portal.module.css";

const navigation = [
  { href: "/afiliados/painel", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/afiliados/painel/indicacoes", label: "Indicações", icon: Users },
  { href: "/afiliados/painel/comissoes", label: "Comissões", icon: ReceiptText },
  { href: "/afiliados/painel/relatorios", label: "Relatórios", icon: FileChartColumn },
  { href: "/afiliados/painel/configuracoes", label: "Configurações", icon: Settings },
];

export default function AffiliatePortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState("Afiliado");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("affiliate_user") || localStorage.getItem("user");
      if (stored) queueMicrotask(() => setName(JSON.parse(stored).full_name || "Afiliado"));
    } catch { queueMicrotask(() => setName("Afiliado")); }
  }, []);

  const logout = () => {
    ["access_token", "refresh_token", "affiliate_user", "affiliate_profile", "user"].forEach((key) => localStorage.removeItem(key));
    router.replace("/login");
  };

  return <div className={styles.shell}>
    <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
      <div className={styles.brand}><span className={styles.brandIcon}><Handshake size={23} /></span><div><strong>Portal do Afiliado</strong><span>Gestão Agro</span></div><button className={styles.closeMenu} onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X /></button></div>
      <nav className={styles.navigation} aria-label="Navegação do portal"><span className={styles.navLabel}>Visão geral</span>{navigation.map((item) => { const active = item.exact ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={active ? styles.activeLink : ""}><item.icon size={19} /><span>{item.label}</span></Link>; })}</nav>
      <div className={styles.sidebarSummary}><BarChart3 size={18} /><div><strong>Acompanhe seus resultados</strong><span>Dados atualizados em tempo real.</span></div></div>
    </aside>
    {menuOpen && <button className={styles.backdrop} onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}
    <div className={styles.contentArea}><header className={styles.topbar}><button className={styles.menuButton} onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu /></button><div className={styles.welcome}><span>Bem-vindo(a),</span><strong>{name}</strong></div><div className={styles.topActions}><button className={styles.iconButton} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Alternar tema" aria-label="Alternar tema">{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button><button className={styles.logout} onClick={logout}><LogOut size={17} /><span>Sair</span></button></div></header><main className={styles.main}>{children}</main></div>
  </div>;
}
