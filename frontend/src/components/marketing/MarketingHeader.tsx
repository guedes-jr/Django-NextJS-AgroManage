"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { usePublicLocale } from "@/lib/publicLocale";

export function MarketingHeader({ home = false }: { home?: boolean }) {
  const { t } = usePublicLocale();
  const [open, setOpen] = useState(false);
  const [clarityCta, setClarityCta] = useState(false);
  useEffect(()=>{const timer=window.setTimeout(()=>setClarityCta(localStorage.getItem("agromanage_lp_variant")==="cta_clarity"),0);return()=>window.clearTimeout(timer);},[]);
  return <header className="marketing-header">
    <div className="marketing-container header-inner">
      <Link href="/" className="marketing-brand" aria-label={t("brandHome")}>
        <Image src="/logo_agro_leaf.png" alt="" width={38} height={38} priority />
        <span>Fazenda<strong aria-hidden={home || undefined}>{home ? "+" : "Mais"}</strong></span>
      </Link>
      <button className="marketing-menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t("openMenu")}>
        {open ? <X /> : <Menu />}
      </button>
      <nav className={open ? "marketing-nav open" : "marketing-nav"}>
        <Link href="/recursos" onClick={() => setOpen(false)}>{t("resources")}</Link>
        <Link href="/planos" onClick={() => setOpen(false)}>{t("plans")}</Link>
        <Link href={home ? "/#como-funciona" : "/conteudos"} onClick={() => setOpen(false)}>{home ? t("landing.howItWorks") : t("content")}</Link>
        <Link href="/contato" onClick={() => setOpen(false)}>{t("contact")}</Link>
        <Link href="/login" className="nav-login" onClick={() => setOpen(false)}>{t("login")}</Link>
        <Link href="/contato" className="marketing-button primary small" onClick={() => setOpen(false)}>{clarityCta ? t("farmCta") : t("requestDemo")}{home && <ArrowRight size={16} aria-hidden="true"/>}</Link>
      </nav>
    </div>
  </header>;
}
