"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

type ParentRoute = { href: string; label: string };

function homeParent(pathname: string): ParentRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "home" || parts.length < 3) return null;
  if (parts[1] === "rebanho" && parts[2]) {
    const speciesRoot = `/home/rebanho/${parts[2]}`;
    return pathname === speciesRoot ? null : { href: speciesRoot, label: `Voltar para ${parts[2]}` };
  }
  if (parts[1] === "estoque" && pathname !== "/home/estoque/resumo") return { href: "/home/estoque/resumo", label: "Voltar para Estoque" };
  if (parts[1] === "plantacoes") {
    if (parts.length >= 4) return { href: `/home/plantacoes/${parts[2]}`, label: "Voltar para a plantação" };
    if (parts.length === 3) return { href: "/home/plantacoes", label: "Voltar para Plantações" };
  }
  if (parts[1] === "clinico") return { href: "/home/clinico", label: "Voltar para Clínico" };
  if (parts[1] === "relatorios") return { href: "/home/relatorios", label: "Voltar para Relatórios" };
  if (parts[1] === "estrutura") return { href: "/home/estrutura", label: "Voltar para Estrutura" };
  return { href: "/home", label: "Voltar ao início" };
}

function platformParent(pathname: string): ParentRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "platform" || parts.length < 3) return null;
  if (parts[1] === "operations") return { href: "/platform/operations", label: "Voltar para Operações" };
  const labels: Record<string, string> = { organizations: "Organizações", users: "Usuários", team: "Equipe", audit: "Auditoria", finance: "Financeiro", settings: "Configurações" };
  return { href: `/platform/${parts[1]}`, label: `Voltar para ${labels[parts[1]] || "a seção"}` };
}

export function ContextualBackButton({ area }: { area: "home" | "platform" }) {
  const pathname = usePathname();
  const router = useRouter();
  const parent = area === "platform" ? platformParent(pathname) : homeParent(pathname);
  if (!parent || parent.href === pathname) return null;
  return <button type="button" className="contextual-back-button" onClick={() => router.push(parent.href)} aria-label={parent.label} title={parent.label}><ArrowLeft size={18} /><span>{parent.label}</span></button>;
}
