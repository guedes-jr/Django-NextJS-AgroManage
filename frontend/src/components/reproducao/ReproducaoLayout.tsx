"use client";

import { useState, type ReactNode, type CSSProperties } from "react";
import Image from "next/image";
import { ChevronRight, Grid2X2, List, Loader2 } from "lucide-react";
import "./reproducao.css";
import { useOrganizationLocale } from "@/lib/locale";

export type ReproductionPhase = { id: string; label: string; count?: number; icon: ReactNode; image?: string; summary?: string; accent?: string; color?: string };

export function ReproducaoHeader({ subtitle, children }: { subtitle: string; children?: ReactNode }) {
  const { t } = useOrganizationLocale();
  return <div className="repro-header mb-5 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3"><div>
    <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>{t("reproduction.moduleTitle")}</h1>
    <p className="mb-0 text-muted-foreground fw-medium">{subtitle}</p>
  </div>{children}</div>;
}

export function ReproducaoPhaseCards({ phases, onSelect }: { phases: ReproductionPhase[]; onSelect: (id: string) => void }) {
  const [compactView, setCompactView] = useState(false);
  const { language, t } = useOrganizationLocale();
  return <section className="repro-phase-section"><div className="repro-section-heading"><div>
    <h2>{t("reproduction.phasesTitle")}</h2><p>{t("reproduction.phasesDescription")}</p>
  </div><div className="repro-view-toggle" aria-label={t("reproduction.cardsView")}>
    <button className={!compactView ? "active" : ""} onClick={() => setCompactView(false)} aria-label={t("reproduction.largeCards")}><Grid2X2 size={17}/></button>
    <button className={compactView ? "active" : ""} onClick={() => setCompactView(true)} aria-label={t("reproduction.compactList")}><List size={17}/></button>
  </div></div><div className={`repro-phase-grid ${compactView ? "is-compact" : ""}`}>{phases.map(phase => <button key={phase.id} className="repro-phase-card" onClick={() => onSelect(phase.id)} style={{ "--phase-accent": phase.accent, "--phase-soft": phase.color } as CSSProperties}>
    <div className="repro-phase-photo">{phase.image ? <Image src={phase.image} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 25vw" /> : <span className="repro-phase-placeholder" style={{ color: phase.accent }}>{phase.icon}</span>}</div>
    <div className="repro-phase-body"><div className="repro-phase-copy"><h3>{phase.label}</h3><strong>{phase.count?.toLocaleString(language) ?? "—"} <span>{phase.count === 1 ? t("reproduction.record") : t("reproduction.records")}</span></strong><p><i />{phase.summary ?? t("reproduction.openPhaseRecords")}</p></div><span className="repro-phase-enter">{t("reproduction.enter")} <ChevronRight size={17}/></span></div>
  </button>)}</div></section>;
}

export function ReproducaoPhaseTabs({ phases, selected, onSelect, loading = {} }: { phases: ReproductionPhase[]; selected: string; onSelect: (id: string) => void; loading?: Record<string, boolean> }) {
  const { t } = useOrganizationLocale();
  if (selected === "dashboard") return null;
  return <ul className="repro-phase-tabs mb-4" aria-label={t("reproduction.phaseTabs")} style={{ scrollbarWidth: "none", msOverflowStyle: "none", borderBottom: "none" }}>{phases.map(phase => {
    const active = selected === phase.id;
    return <li className="nav-item" key={phase.id} style={{ flexShrink: 0 }}><button className={`repro-phase-tab ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => onSelect(phase.id)}><span className="repro-phase-tab-icon">{phase.icon}</span>{phase.label}{phase.count !== undefined && <span className={`badge rounded-pill ms-1 repro-phase-count ${active ? "is-active" : ""}`} style={{ fontSize: ".6rem", fontWeight: 700 }}>{phase.count}</span>}{loading[phase.id] && !active && <Loader2 size={12} className="ms-1 text-muted spin-animation" />}</button></li>;
  })}</ul>;
}
