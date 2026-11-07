"use client";

import Link from "next/link";
import Image from "next/image";
import { Sprout } from "lucide-react";
import { usePublicLocale } from "@/lib/publicLocale";

export function MarketingFooter({ brandSymbol = false }: { brandSymbol?: boolean }) {
  const { t } = usePublicLocale();
  return <footer className="marketing-footer">
    <div className="marketing-container footer-grid">
      <div><div className="footer-brand">{brandSymbol ? <Image src="/logo_agro_leaf.png" width={30} height={30} alt=""/> : <Sprout size={22}/>}<span aria-label="Fazenda Mais">{brandSymbol ? <>Fazenda<strong aria-hidden="true">+</strong></> : "Fazenda Mais"}</span></div><p>{t("footerTagline")}</p></div>
      <div><strong>{t("product")}</strong><Link href="/recursos">{t("resources")}</Link><Link href="/planos">{t("plans")}</Link><Link href="/demo">{t("demo")}</Link><Link href="/calculadora">{t("calculator")}</Link><Link href="/login">{t("login")}</Link></div>
      <div><strong>{t("content")}</strong><Link href="/gestao-pecuaria">{t("livestock")}</Link><Link href="/gestao-agricola">{t("agriculture")}</Link><Link href="/conteudos">{t("guides")}</Link><Link href="/contato">{t("contact")}</Link><Link href="/privacidade">{t("privacy")}</Link><Link href="/termos">{t("terms")}</Link></div>
    </div>
    <div className="marketing-container footer-bottom">© {new Date().getFullYear()} Fazenda Mais. {t("copyright")}</div>
  </footer>;
}
