"use client";

import { useState, useEffect } from "react";
import { X, Printer, CheckCircle2, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { apiClient } from "@/services/api";
import { Loader2 } from "lucide-react";

interface BatchTechnicalSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: string | number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: any, decimals = 2) =>
  v != null && !isNaN(Number(v))
    ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : "-";

const fmtInt = (v: any) =>
  v != null && !isNaN(Number(v)) ? Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "-";

const fmtDate = (d: any) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "-";

const calcAge = (birthDate: string | null) => {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

// ─── Colors ──────────────────────────────────────────────────────────────────
const GREEN_DARK = "#1b5e20";
const GREEN_MID = "#2e7d32";
const GREEN_LIGHT = "#e8f5e9";
const GREEN_BORDER = "#c8e6c9";
const GRAY_TEXT = "#555";
const AMBER = "#f59e0b";
const RED = "#dc2626";

// ─── Section Header ───────────────────────────────────────────────────────────
const SectionHeader = ({ number, title }: { number: number; title: string }) => (
  <div style={{
    background: GREEN_DARK,
    color: "#fff",
    fontWeight: 700,
    fontSize: "0.68rem",
    letterSpacing: "0.4px",
    padding: "4px 10px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    textTransform: "uppercase",
  }}>
    <span>{number}. {title}</span>
  </div>
);

// ─── Table helpers ────────────────────────────────────────────────────────────
const Th = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <th style={{
    background: GREEN_LIGHT,
    color: GREEN_DARK,
    fontSize: "0.58rem",
    fontWeight: 700,
    textAlign: "center",
    padding: "3px 4px",
    border: `1px solid ${GREEN_BORDER}`,
    whiteSpace: "nowrap",
    lineHeight: 1.3,
    ...style,
  }}>{children}</th>
);

const Td = ({ children, style, bold }: { children: React.ReactNode; style?: React.CSSProperties; bold?: boolean }) => (
  <td style={{
    fontSize: "0.6rem",
    textAlign: "center",
    padding: "3px 4px",
    border: `1px solid ${GREEN_BORDER}`,
    fontWeight: bold ? 700 : 400,
    lineHeight: 1.3,
    ...style,
  }}>{children}</td>
);

const TR = ({ children, even }: { children: React.ReactNode; even?: boolean }) => (
  <tr style={{ background: even ? "#f1f8e9" : "#fff" }}>{children}</tr>
);

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const IconPig = () => (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
    <ellipse cx="10" cy="10" rx="8" ry="6" fill={GREEN_LIGHT} stroke={GREEN_MID} strokeWidth="1.2" />
    <circle cx="7" cy="9" r="1.2" fill={GREEN_DARK} />
    <circle cx="13" cy="9" r="1.2" fill={GREEN_DARK} />
    <ellipse cx="10" cy="12" rx="2.5" ry="1.5" fill={GREEN_BORDER} />
    <ellipse cx="4.5" cy="8" rx="2.5" ry="2" fill={GREEN_LIGHT} stroke={GREEN_MID} strokeWidth="1" />
    <ellipse cx="15.5" cy="8" rx="2.5" ry="2" fill={GREEN_LIGHT} stroke={GREEN_MID} strokeWidth="1" />
  </svg>
);

const IconCal = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <rect x="2" y="4" width="16" height="13" rx="2" stroke={GREEN_DARK} strokeWidth="1.5" fill={GREEN_LIGHT} />
    <line x1="2" y1="8" x2="18" y2="8" stroke={GREEN_DARK} strokeWidth="1.2" />
    <line x1="6" y1="2" x2="6" y2="6" stroke={GREEN_DARK} strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14" y1="2" x2="14" y2="6" stroke={GREEN_DARK} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconClock = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <circle cx="10" cy="10" r="8" stroke={GREEN_DARK} strokeWidth="1.5" fill={GREEN_LIGHT} />
    <line x1="10" y1="6" x2="10" y2="10" stroke={GREEN_DARK} strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="10" x2="13" y2="12" stroke={GREEN_DARK} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconTag = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <path d="M3 3h7l7 7-7 7-7-7V3z" stroke={GREEN_DARK} strokeWidth="1.5" fill={GREEN_LIGHT} />
    <circle cx="7" cy="7" r="1.2" fill={GREEN_DARK} />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <circle cx="10" cy="10" r="8" fill="#16a34a" />
    <polyline points="6,10 9,13 14,7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconFemale = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <circle cx="10" cy="8" r="5" stroke={GREEN_DARK} strokeWidth="1.5" fill={GREEN_LIGHT} />
    <line x1="10" y1="13" x2="10" y2="18" stroke={GREEN_DARK} strokeWidth="1.5" />
    <line x1="7" y1="16" x2="13" y2="16" stroke={GREEN_DARK} strokeWidth="1.5" />
  </svg>
);

const IconMale = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <circle cx="8" cy="12" r="5" stroke={GREEN_DARK} strokeWidth="1.5" fill={GREEN_LIGHT} />
    <line x1="12" y1="8" x2="18" y2="2" stroke={GREEN_DARK} strokeWidth="1.5" />
    <polyline points="14,2 18,2 18,6" stroke={GREEN_DARK} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconBaby = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <circle cx="10" cy="8" r="4" stroke={GREEN_DARK} strokeWidth="1.5" fill={GREEN_LIGHT} />
    <path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={GREEN_DARK} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconSkull = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <path d="M10 2a7 7 0 0 1 7 7c0 3-1.5 4.5-2 5v2H5v-2c-.5-.5-2-2-2-5a7 7 0 0 1 7-7z" stroke={GREEN_DARK} strokeWidth="1.3" fill={GREEN_LIGHT} />
    <circle cx="7.5" cy="9" r="1.3" fill={GREEN_DARK} />
    <circle cx="12.5" cy="9" r="1.3" fill={GREEN_DARK} />
  </svg>
);

const IconSum = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <text x="2" y="15" fontFamily="serif" fontSize="14" fill={GREEN_DARK} fontWeight="bold">Σ</text>
  </svg>
);

const IconTrend = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <polyline points="2,14 7,9 11,12 18,5" stroke={GREEN_DARK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="14,5 18,5 18,9" stroke={GREEN_DARK} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const IconGrain = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <ellipse cx="10" cy="10" rx="5" ry="8" stroke={GREEN_DARK} strokeWidth="1.4" fill={GREEN_LIGHT} />
    <line x1="10" y1="3" x2="10" y2="17" stroke={GREEN_DARK} strokeWidth="1" strokeDasharray="2,2" />
  </svg>
);

const IconDanger = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <path d="M10 2L2 17h16L10 2z" stroke="#dc2626" strokeWidth="1.4" fill="#fee2e2" />
    <line x1="10" y1="9" x2="10" y2="13" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="15.5" r="0.8" fill="#dc2626" />
  </svg>
);

const IconTarget = () => (
  <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
    <circle cx="10" cy="10" r="8" stroke={GREEN_DARK} strokeWidth="1.4" fill="none" />
    <circle cx="10" cy="10" r="5" stroke={GREEN_DARK} strokeWidth="1.2" fill="none" />
    <circle cx="10" cy="10" r="2" fill={GREEN_DARK} />
  </svg>
);

const IconChart = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <rect x="3" y="12" width="4" height="9" rx="1" fill={GREEN_DARK} />
    <rect x="10" y="7" width="4" height="14" rx="1" fill={GREEN_MID} />
    <rect x="17" y="3" width="4" height="18" rx="1" fill={GREEN_LIGHT} stroke={GREEN_DARK} strokeWidth="0.8" />
  </svg>
);

const IconScale = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <line x1="12" y1="3" x2="12" y2="21" stroke={GREEN_DARK} strokeWidth="1.5" />
    <line x1="3" y1="3" x2="21" y2="3" stroke={GREEN_DARK} strokeWidth="1.5" />
    <path d="M3 3l4 8a4 4 0 0 1-8 0L3 3z" stroke={GREEN_DARK} strokeWidth="1.2" fill={GREEN_LIGHT} />
    <path d="M21 3l4 8a4 4 0 0 1-8 0L21 3z" stroke={GREEN_DARK} strokeWidth="1.2" fill={GREEN_LIGHT} />
  </svg>
);

const IconSkullBig = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <path d="M12 3a8 8 0 0 1 8 8c0 3.5-2 5.5-2.5 6v2.5h-11V17C6 16.5 4 14.5 4 11a8 8 0 0 1 8-8z" stroke={RED} strokeWidth="1.4" fill="#fee2e2" />
    <circle cx="9" cy="11" r="1.5" fill={RED} />
    <circle cx="15" cy="11" r="1.5" fill={RED} />
    <line x1="9" y1="17" x2="9" y2="19.5" stroke={RED} strokeWidth="1.2" />
    <line x1="12" y1="17" x2="12" y2="19.5" stroke={RED} strokeWidth="1.2" />
    <line x1="15" y1="17" x2="15" y2="19.5" stroke={RED} strokeWidth="1.2" />
  </svg>
);

const IconPigBig = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <ellipse cx="12" cy="13" rx="9" ry="7" fill={GREEN_LIGHT} stroke={GREEN_DARK} strokeWidth="1.3" />
    <ellipse cx="12" cy="12" rx="6.5" ry="5" fill="#fff" />
    <circle cx="9" cy="11" r="1.3" fill={GREEN_DARK} />
    <circle cx="15" cy="11" r="1.3" fill={GREEN_DARK} />
    <ellipse cx="12" cy="14" rx="3" ry="2" fill={GREEN_BORDER} />
    <ellipse cx="5" cy="11" rx="3" ry="2.5" fill={GREEN_LIGHT} stroke={GREEN_DARK} strokeWidth="1" />
    <ellipse cx="19" cy="11" rx="3" ry="2.5" fill={GREEN_LIGHT} stroke={GREEN_DARK} strokeWidth="1" />
  </svg>
);

const IconTargetBig = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <circle cx="12" cy="12" r="10" stroke={GREEN_DARK} strokeWidth="1.4" fill="none" />
    <circle cx="12" cy="12" r="6" stroke={GREEN_DARK} strokeWidth="1.2" fill="none" />
    <circle cx="12" cy="12" r="2.5" fill={GREEN_DARK} />
    <line x1="18" y1="6" x2="22" y2="2" stroke={GREEN_DARK} strokeWidth="1.4" strokeLinecap="round" />
    <polyline points="20,2 22,2 22,4" stroke={GREEN_DARK} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

// ─── Main component ───────────────────────────────────────────────────────────
export function BatchTechnicalSheetModal({ isOpen, onClose, batchId }: BatchTechnicalSheetModalProps) {
  const [animal, setAnimal] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && batchId) {
      setLoading(true);
      apiClient.get(`/livestock/batches/${batchId}/`)
        .then((res: any) => {
          setAnimal(res.data);
          return apiClient.get(`/livestock/batches/${batchId}/history/`);
        })
        .then((res: any) => {
          setHistory(res.data || []);
        })
        .catch((err: any) => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, batchId]);

  const handlePrint = () => window.print();

  if (!isOpen) return null;

  // ── Derived data ──
  const ageInDays = calcAge(animal?.birth_date);

  const qtdAtual = animal?.current_quantity ?? animal?.quantity ?? 16;
  const qtdInicial = animal?.initial_quantity ?? animal?.quantity ?? 16;
  const nascidosVivos = animal?.born_alive ?? animal?.quantity ?? 20;
  const nascidosMortos = animal?.born_dead ?? 0;
  const natimortos = animal?.stillborn ?? 0;
  const totalNascidos = (nascidosVivos + nascidosMortos + natimortos) || nascidosVivos;
  const saldoMortes = animal?.deaths_count ?? (Math.max(0, totalNascidos - qtdAtual) || 4);

  const pesoMedioAtual = animal?.current_weight_kg ?? animal?.avg_weight_kg ?? 13.60;
  const pesoTotalLote = (pesoMedioAtual * qtdAtual) || 217.60;
  const pesoMedioNasc = animal?.birth_weight_kg ?? 1.25;

  const gpd = animal?.daily_weight_gain ?? 0.414;
  const conversaoAlimentar = animal?.feed_conversion ?? 2.35;
  const mortalidadePct = totalNascidos > 0 ? ((saldoMortes / totalNascidos) * 100).toFixed(2) : "20.00";
  const metaGpd = animal?.target_gpd ?? 0.450;

  const gpdAbaixoMeta = Number(gpd) < Number(metaGpd);

  const categoria = (animal?.current_category || animal?.reproductive_status || "CRECHE").toUpperCase();
  const rawLoteId = animal?.batch_number ?? animal?.id ?? 3;
  // Truncate UUID-style IDs to avoid header overflow
  const loteNum = typeof rawLoteId === "string" && rawLoteId.length > 10
    ? rawLoteId.slice(0, 8).toUpperCase()
    : rawLoteId;
  const mae = animal?.dam_identifier ?? animal?.mother_id ?? "040";
  const pai = animal?.sire_identifier ?? animal?.father_id ?? "ANDRE";

  // Feed consumption rows
  const feedRows = history.filter((e: any) => e.type === "feed").slice(0, 4);
  const hasFeed = feedRows.length > 0;
  const feedDefault = [
    { tipo: "Pré-Inicial", consumoTotal: 250.0, custo: 325.0, consumoMedio: 6.0 },
    { tipo: "Inicial", consumoTotal: 300.0, custo: 420.0, consumoMedio: 7.60 },
    { tipo: "Crescimento", consumoTotal: null, custo: null, consumoMedio: null },
  ];
  const feedData = hasFeed
    ? feedRows.map((e: any) => ({ tipo: e.title, consumoTotal: e.total_kg, custo: e.cost, consumoMedio: e.avg_per_animal }))
    : feedDefault;
  const totalConsumo = feedData.reduce((a, r) => a + (r.consumoTotal || 0), 0);
  const totalCusto = feedData.reduce((a, r) => a + (r.custo || 0), 0);

  // Sales
  const salesRows = history.filter((e: any) => e.type === "sale").slice(0, 4);

  // Deaths
  const deathRows = history.filter((e: any) => e.type === "death" || e.type === "discard").slice(0, 4);

  // Transfers
  const transferRows = history.filter((e: any) => e.type === "transfer").slice(0, 4);
  const hasTransfer = transferRows.length > 0;
  const transferDefault = [{ date: animal?.birth_date || "2026-02-02", qty: -saldoMortes, loteOrigem: loteNum, loteDestino: 2, faseDestino: "CRECHE", operacao: "SAÍDA" }];
  const transferData = hasTransfer ? transferRows : transferDefault;
  const totalTransferido = transferData.reduce((a: number, t: any) => a + (Number(t.qty ?? t.quantity) || 0), 0);

  // Financial
  const custoRacao = totalCusto || 745;
  const custoMedicamentos = animal?.medication_cost ?? 120;
  const custoOperacional = animal?.operational_cost ?? 80;
  const custoTotal = custoRacao + custoMedicamentos + custoOperacional;
  const custoPorAnimal = qtdAtual > 0 ? custoTotal / qtdAtual : 0;
  const pesoTotalProduzido = pesoTotalLote - (pesoMedioNasc * qtdAtual);
  const custoPorKg = pesoTotalProduzido > 0 ? custoTotal / pesoTotalProduzido : 0;

  const now = new Date();
  const reportDate = now.toLocaleDateString("pt-BR");
  const reportTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const cellBase: React.CSSProperties = {
    fontSize: "0.6rem",
    padding: "3px 4px",
    border: `1px solid ${GREEN_BORDER}`,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ficha de Controle de Lote — Lote Nº ${loteNum}`}
      maxWidth="max-w-5xl"
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <button className="btn btn-light rounded-pill px-4 d-flex align-items-center gap-2" onClick={onClose}>
            <X size={16} /> Fechar
          </button>
          <button className="btn btn-success rounded-pill px-4 d-flex align-items-center gap-2" onClick={handlePrint}>
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="d-flex flex-column align-items-center justify-content-center py-5 gap-3">
          <Loader2 className="spin-animation text-success" size={40} />
          <span className="text-muted">Carregando ficha de controle...</span>
        </div>
      ) : (
        <div className="bg-light d-flex justify-content-center p-0 p-md-3 print-container-wrapper">
          {/* ───── Paper ───── */}
          <div
            className="ficha-lote-paper bg-white mx-auto shadow unique-lote-print-sheet"
            style={{
              width: "210mm",
              minHeight: "297mm",
              fontFamily: "'Inter', 'Arial', sans-serif",
              color: "#1a1a1a",
              fontSize: "0.63rem",
              padding: "0",
              border: "2px solid #1b5e20",
              display: "flex",
              flexDirection: "column",
            }}
          >

            {/* ══════════ HEADER ══════════ */}
            <div style={{ display: "flex", alignItems: "stretch", borderBottom: `2px solid ${GREEN_DARK}` }}>
              {/* Logo left */}
              <div style={{
                padding: "6px 10px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 155,
                borderRight: `2px solid ${GREEN_DARK}`,
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  background: GREEN_LIGHT,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `1.5px solid ${GREEN_BORDER}`,
                }}>
                  {/* Pig SVG */}
                  <svg viewBox="0 0 40 40" width="30" height="30" fill="none">
                    <ellipse cx="20" cy="22" rx="14" ry="12" fill={GREEN_BORDER} stroke={GREEN_MID} strokeWidth="1.5" />
                    <ellipse cx="20" cy="21" rx="10" ry="9" fill="#fff" />
                    <circle cx="15" cy="19" r="2.2" fill={GREEN_DARK} />
                    <circle cx="25" cy="19" r="2.2" fill={GREEN_DARK} />
                    <ellipse cx="20" cy="24" rx="4" ry="2.5" fill={GREEN_BORDER} />
                    <circle cx="19" cy="24" r="0.8" fill={GREEN_DARK} />
                    <circle cx="21" cy="24" r="0.8" fill={GREEN_DARK} />
                    <ellipse cx="8" cy="19" rx="4.5" ry="3.5" fill={GREEN_LIGHT} stroke={GREEN_MID} strokeWidth="1.2" />
                    <ellipse cx="32" cy="19" rx="4.5" ry="3.5" fill={GREEN_LIGHT} stroke={GREEN_MID} strokeWidth="1.2" />
                    <rect x="13" y="31" width="4" height="5" rx="2" fill={GREEN_BORDER} />
                    <rect x="23" y="31" width="4" height="5" rx="2" fill={GREEN_BORDER} />
                    <ellipse cx="16" cy="10" rx="3.5" ry="3" fill={GREEN_LIGHT} stroke={GREEN_MID} strokeWidth="1" />
                    <ellipse cx="24" cy="10" rx="3.5" ry="3" fill={GREEN_LIGHT} stroke={GREEN_MID} strokeWidth="1" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: GREEN_DARK, fontSize: "0.85rem", lineHeight: 1.2 }}>Gestão Agro</div>
                  <div style={{ color: GRAY_TEXT, fontSize: "0.6rem" }}>Fazenda São João</div>
                </div>
              </div>

              {/* Center title */}
              <div style={{
                flex: 1,
                textAlign: "center",
                padding: "8px 0",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                borderRight: `2px solid ${GREEN_DARK}`,
              }}>
                <div style={{ fontWeight: 900, fontSize: "1.15rem", letterSpacing: 0.5, textTransform: "uppercase", color: "#1a1a1a" }}>
                  FICHA DE CONTROLE DE LOTE
                </div>
                <div style={{ fontSize: "0.62rem", color: GRAY_TEXT, letterSpacing: 3, marginTop: 2 }}>
                  CRECHE &bull; CRESCIMENTO &bull; ENGORDA
                </div>
              </div>

              {/* Lote box right */}
              <div style={{
                padding: "6px 14px",
                minWidth: 150,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "flex-end",
                gap: 4,
              }}>
                <div style={{
                  fontWeight: 900,
                  fontSize: "0.9rem",
                  background: GREEN_DARK,
                  color: "#fff",
                  padding: "3px 14px",
                  borderRadius: 4,
                  border: `2px solid ${GREEN_DARK}`,
                  letterSpacing: 0.5,
                }}>
                  LOTE N<sup>o</sup> {loteNum}
                </div>
                <div style={{ fontSize: "0.58rem", color: GRAY_TEXT }}>Data do Relatório: {reportDate}</div>
                <div style={{ fontSize: "0.58rem", color: GRAY_TEXT }}>Hora: {reportTime}</div>
              </div>
            </div>

            {/* ══════════ INFO BLOCK ══════════ */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              borderBottom: `1.5px solid ${GREEN_DARK}`,
            }}>

              {/* Col 1 — Identificação */}
              <div style={{ padding: "8px 10px", borderRight: `1px solid ${GREEN_BORDER}` }}>
                <InfoRow icon={<IconPig />} label="Raça:" value={animal?.breed_name || "Tricross"} />
                <InfoRow icon={<IconCal />} label="Nascimento:" value={fmtDate(animal?.birth_date)} />
                <InfoRow icon={<IconClock />} label="Idade Atual:" value={ageInDays != null ? `${ageInDays} dias` : "71 dias"} />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <span style={{ display: "flex", alignItems: "center" }}><IconTag /></span>
                  <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", minWidth: 82 }}>Categoria Atual:</span>
                  <span style={{
                    background: GREEN_DARK,
                    color: "#fff",
                    borderRadius: 3,
                    padding: "1px 7px",
                    fontWeight: 700,
                    fontSize: "0.58rem",
                  }}>
                    {categoria}
                  </span>
                </div>
                <div style={{ marginBottom: 4, color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <IconCheck />
                  Situação do Lote:
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, color: GREEN_DARK, fontSize: "0.62rem" }}>
                  <CheckCircle2 size={14} color="#16a34a" />
                  BOM DESEMPENHO
                </div>
              </div>

              {/* Col 2 — Origem/Genética */}
              <div style={{ padding: "6px 10px", borderRight: `1px solid ${GREEN_BORDER}` }}>
                <div style={{
                  fontWeight: 800,
                  textAlign: "center",
                  textTransform: "uppercase",
                  color: GREEN_DARK,
                  marginBottom: 6,
                  fontSize: "0.62rem",
                  letterSpacing: 0.3,
                }}>
                  ORIGEM / GENÉTICA
                </div>
                <GeneticsRow icon={<IconFemale />} label="Mãe (Matriz):" value={String(mae)} />
                <GeneticsRow icon={<IconMale />} label="Pai (Reprodutor):" value={String(pai)} />
                <GeneticsRow icon={<IconBaby />} label="Nascidos Vivos:" value={fmtInt(nascidosVivos)} />
                <GeneticsRow icon={<IconSkull />} label="Nascidos Mortos:" value={fmtInt(nascidosMortos)} />
                <GeneticsRow icon={<IconDanger />} label="Natimortos:" value={fmtInt(natimortos)} />
                <GeneticsRow icon={<IconSum />} label="Total Nascidos:" value={fmtInt(totalNascidos)} bold />
              </div>

              {/* Col 3 — Quantidades e Pesos */}
              <div style={{ padding: "6px 10px", borderRight: `1px solid ${GREEN_BORDER}` }}>
                <KpiSmall label="Quantidade Atual:" value={fmtInt(qtdAtual)} bold />
                <KpiSmall label="Saldo (Mortes/Descarte):" value={fmtInt(saldoMortes)} />
                <KpiSmall label="Peso Médio Atual:" value={`${fmt(pesoMedioAtual)} kg`} bold />
                <KpiSmall label="Peso Total do Lote:" value={`${fmt(pesoTotalLote)} kg`} />
                <KpiSmall label="P. Médio ao Nascimento:" value={`${fmt(pesoMedioNasc)} kg`} />
              </div>

              {/* Col 4 — Desempenho Geral */}
              <div style={{ padding: "6px 10px" }}>
                <div style={{
                  fontWeight: 800,
                  textAlign: "center",
                  textTransform: "uppercase",
                  color: GREEN_DARK,
                  marginBottom: 6,
                  fontSize: "0.62rem",
                  letterSpacing: 0.3,
                }}>
                  DESEMPENHO GERAL
                </div>
                <KpiIcon icon={<IconTrend />} label="GPD (Ganho de Peso Diário):" value={`${fmt(gpd)} kg`} />
                <KpiIcon icon={<IconGrain />} label="Conversão Alimentar:" value={fmt(conversaoAlimentar)} />
                <KpiIcon icon={<IconSkull />} label="Mortalidade:" value={`${mortalidadePct}% (${saldoMortes})`} />
                <KpiIcon icon={<IconTarget />} label="Meta GPD:" value={`${fmt(metaGpd)} kg`} />
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, fontSize: "0.58rem" }}>
                  <span style={{ color: GRAY_TEXT }}>Comparação com Meta:</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  {gpdAbaixoMeta ? (
                    <>
                      <AlertTriangle size={11} color={AMBER} />
                      <span style={{ color: AMBER, fontWeight: 700, fontSize: "0.6rem" }}>Abaixo do ideal</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={11} color="#16a34a" />
                      <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "0.6rem" }}>Dentro da meta</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ══════════ SECTION 1 — DESEMPENHO POR FASE ══════════ */}
            <SectionHeader number={1} title="DESEMPENHO POR FASE" />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th style={{ textAlign: "left", paddingLeft: 8 }}>Fase</Th>
                  <Th>Qtd Inicial</Th>
                  <Th>Qtd Atual</Th>
                  <Th>Idade (dias)</Th>
                  <Th>Peso Médio (Kg)</Th>
                  <Th>Peso Total (Kg)</Th>
                  <Th>GPD (Kg)</Th>
                  <Th>Conversão<br />Alimentar</Th>
                  <Th>Mortalidade (%)</Th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    fase: "MATERNIDADE",
                    qtdIni: nascidosVivos, qtdAtual: nascidosVivos,
                    idade: 20, pesoMedio: fmt(5.71), pesoTotal: fmt(5.71 * nascidosVivos),
                    gpd: "0,223", conv: "-", mort: "0,00%",
                  },
                  {
                    fase: "CRECHE",
                    qtdIni: qtdInicial, qtdAtual: qtdAtual,
                    idade: ageInDays ?? 71,
                    pesoMedio: fmt(pesoMedioAtual),
                    pesoTotal: fmt(pesoTotalLote),
                    gpd: fmt(gpd, 3),
                    conv: fmt(conversaoAlimentar),
                    mort: `${mortalidadePct}% (${saldoMortes})`,
                  },
                  { fase: "CRESCIMENTO", qtdIni: "-", qtdAtual: "-", idade: "-", pesoMedio: "-", pesoTotal: "-", gpd: "-", conv: "-", mort: "-" },
                  { fase: "TERMINAÇÃO / ENGORDA", qtdIni: "-", qtdAtual: "-", idade: "-", pesoMedio: "-", pesoTotal: "-", gpd: "-", conv: "-", mort: "-" },
                ].map((row, i) => (
                  <TR key={i} even={i % 2 === 1}>
                    <Td style={{ textAlign: "left", fontWeight: 600, paddingLeft: 8 }}>{row.fase}</Td>
                    <Td>{row.qtdIni}</Td>
                    <Td>{row.qtdAtual}</Td>
                    <Td>{row.idade}</Td>
                    <Td>{row.pesoMedio}</Td>
                    <Td>{row.pesoTotal}</Td>
                    <Td>{row.gpd}</Td>
                    <Td>{row.conv}</Td>
                    <Td>{row.mort}</Td>
                  </TR>
                ))}
              </tbody>
            </table>

            {/* ══════════ SECTIONS 2, 3, 4 ══════════ */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr", borderTop: `2px solid ${GREEN_DARK}`, borderBottom: `1px solid ${GREEN_BORDER}` }}>

              {/* Section 2 — Consumo de Ração */}
              <div style={{ borderRight: `1.5px solid ${GREEN_DARK}` }}>
                <SectionHeader number={2} title="CONSUMO DE RAÇÃO" />
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th style={{ textAlign: "left", paddingLeft: 6 }}>Tipo de Ração</Th>
                      <Th>Consumo<br />Total (Kg)</Th>
                      <Th>Custo<br />(R$)</Th>
                      <Th>Consumo<br />Médio/Animal</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedData.map((row, i) => (
                      <TR key={i} even={i % 2 === 1}>
                        <Td style={{ textAlign: "left", paddingLeft: 6 }}>{row.tipo}</Td>
                        <Td>{row.consumoTotal != null ? fmt(row.consumoTotal) : "-"}</Td>
                        <Td>{row.custo != null ? fmt(row.custo) : "-"}</Td>
                        <Td>{row.consumoMedio != null ? fmt(row.consumoMedio) : "-"}</Td>
                      </TR>
                    ))}
                    <tr style={{ background: GREEN_LIGHT }}>
                      <Td bold style={{ textAlign: "left", paddingLeft: 6 }}>TOTAL</Td>
                      <Td bold>{fmt(totalConsumo)}</Td>
                      <Td bold>{fmt(totalCusto)}</Td>
                      <Td bold>{qtdAtual > 0 ? fmt(totalConsumo / qtdAtual) : "-"}</Td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Section 3 — Vendas */}
              <div style={{ borderRight: `1.5px solid ${GREEN_DARK}` }}>
                <SectionHeader number={3} title="VENDAS" />
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Idade<br />(dias)</Th>
                      <Th>Qtd</Th>
                      <Th>Peso Total<br />(Kg)</Th>
                      <Th>GPD (Kg)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesRows.length > 0 ? salesRows.map((s: any, i: number) => (
                      <TR key={i} even={i % 2 === 1}>
                        <Td>{fmtDate(s.date)}</Td>
                        <Td>{s.age_days ?? "-"}</Td>
                        <Td>{s.quantity ?? "-"}</Td>
                        <Td>{s.total_weight ? fmt(s.total_weight) : "-"}</Td>
                        <Td>{s.gpd ? fmt(s.gpd, 3) : "-"}</Td>
                      </TR>
                    )) : (
                      <tr>
                        <Td style={{ color: "#aaa" }}>-</Td>
                        <Td style={{ color: "#aaa" }}>-</Td>
                        <Td style={{ color: "#aaa" }}>-</Td>
                        <Td style={{ color: "#aaa" }}>-</Td>
                        <Td style={{ color: "#aaa" }}>-</Td>
                      </tr>
                    )}
                    <tr style={{ background: GREEN_LIGHT }}>
                      <Td bold>TOTAL</Td>
                      <Td bold>{salesRows.length > 0 ? salesRows.reduce((a: number, s: any) => a + (s.age_days || 0), 0) : 0}</Td>
                      <Td bold>{salesRows.reduce((a: number, s: any) => a + (s.quantity || 0), 0) || 0}</Td>
                      <Td bold>{salesRows.reduce((a: number, s: any) => a + (s.total_weight || 0), 0) || 0}</Td>
                      <Td bold>0</Td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Section 4 — Mortes/Descartes */}
              <div>
                <SectionHeader number={4} title="MORTES / DESCARTES" />
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Idade<br />(dias)</Th>
                      <Th>Qtd</Th>
                      <Th>Peso Total<br />(Kg)</Th>
                      <Th>Causa</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {deathRows.length > 0 ? deathRows.map((d: any, i: number) => (
                      <TR key={i} even={i % 2 === 1}>
                        <Td>{fmtDate(d.date)}</Td>
                        <Td>{d.age_days ?? "-"}</Td>
                        <Td>{d.quantity ?? "-"}</Td>
                        <Td>{d.total_weight ? fmt(d.total_weight) : "-"}</Td>
                        <Td>{d.cause ?? d.subtitle ?? "-"}</Td>
                      </TR>
                    )) : (
                      <tr>
                        <Td>-</Td>
                        <Td>-</Td>
                        <Td>{fmtInt(saldoMortes)}</Td>
                        <Td>-</Td>
                        <Td>-</Td>
                      </tr>
                    )}
                    <tr style={{ background: GREEN_LIGHT }}>
                      <Td bold>TOTAL</Td>
                      <Td bold>-</Td>
                      <Td bold>{fmtInt(saldoMortes)}</Td>
                      <Td bold>-</Td>
                      <Td bold>-</Td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ══════════ SECTIONS 5, 6 ══════════ */}
            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", borderTop: `2px solid ${GREEN_DARK}` }}>

              {/* Section 5 — Transferências */}
              <div style={{ borderRight: `1.5px solid ${GREEN_DARK}` }}>
                <SectionHeader number={5} title="TRANSFERÊNCIAS" />
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Qtd</Th>
                      <Th>N° Lote Origem</Th>
                      <Th>N° Lote Destino</Th>
                      <Th>Fase Destino</Th>
                      <Th>Operação</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferData.map((t: any, i: number) => (
                      <TR key={i} even={i % 2 === 1}>
                        <Td>{t.date ? fmtDate(t.date) : "-"}</Td>
                        <Td>{t.qty ?? t.quantity ?? "-"}</Td>
                        <Td>{t.loteOrigem ?? t.origin_batch ?? "-"}</Td>
                        <Td>{t.loteDestino ?? t.destination_batch ?? "-"}</Td>
                        <Td>{t.faseDestino ?? t.destination_phase ?? "-"}</Td>
                        <Td>{t.operacao ?? t.operation_type ?? "-"}</Td>
                      </TR>
                    ))}
                  </tbody>
                </table>
                <div style={{
                  padding: "4px 8px",
                  fontWeight: 700,
                  background: GREEN_LIGHT,
                  fontSize: "0.6rem",
                  borderTop: `1px solid ${GREEN_BORDER}`,
                }}>
                  TOTAL TRANSFERIDO: {totalTransferido}
                </div>
              </div>

              {/* Section 6 — Análise Financeira */}
              <div>
                <SectionHeader number={6} title="ANÁLISE FINANCEIRA" />
                <div style={{ padding: "5px 10px" }}>
                  <FinRow label="Custo Total com Ração:" value={`R$ ${fmt(custoRacao)}`} />
                  <FinRow label="Custo com Medicamentos:" value={`R$ ${fmt(custoMedicamentos)}`} />
                  <FinRow label="Custo Operacional:" value={`R$ ${fmt(custoOperacional)}`} />
                  <div style={{ borderTop: `1.5px solid ${GREEN_DARK}`, marginTop: 5, paddingTop: 5 }}>
                    <FinRow label="CUSTO TOTAL DO LOTE:" value={`R$ ${fmt(custoTotal)}`} bold />
                    <FinRow label="Custo por Animal:" value={`R$ ${fmt(custoPorAnimal)}`} />
                    <FinRow label="Custo por Kg Produzido:" value={`R$ ${fmt(custoPorKg)}`} />
                  </div>
                </div>
              </div>
            </div>

            {/* ══════════ SECTIONS 7, 8 ══════════ */}
            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", borderTop: `2px solid ${GREEN_DARK}` }}>

              {/* Section 7 — Resumo dos Indicadores */}
              <div style={{ borderRight: `1.5px solid ${GREEN_DARK}` }}>
                <SectionHeader number={7} title="RESUMO DOS INDICADORES" />
                <div style={{
                  display: "flex",
                  padding: "6px 4px",
                  justifyContent: "space-around",
                  alignItems: "flex-start",
                }}>
                  <ResumoCard
                    icon={<IconChart />}
                    title="GPD"
                    value={`${fmt(gpd)} kg`}
                    status={gpdAbaixoMeta ? "Abaixo do ideal" : "Dentro da meta"}
                    statusColor={gpdAbaixoMeta ? AMBER : "#16a34a"}
                  />
                  <ResumoCard
                    icon={<IconScale />}
                    title="Conversão Alimentar"
                    value={fmt(conversaoAlimentar)}
                    status="Dentro da meta"
                    statusColor="#16a34a"
                  />
                  <ResumoCard
                    icon={<IconSkullBig />}
                    title="Mortalidade"
                    value={`${mortalidadePct}% (${saldoMortes})`}
                    status="Acima do ideal"
                    statusColor={RED}
                  />
                  <ResumoCard
                    icon={<IconPigBig />}
                    title="Peso Médio Atual"
                    value={`${fmt(pesoMedioAtual)} kg`}
                    status="-"
                    statusColor="#888"
                  />
                  <ResumoCard
                    icon={<IconTargetBig />}
                    title="Desempenho Geral"
                    value="BOM"
                    status="Continue assim!"
                    statusColor="#16a34a"
                  />
                </div>
              </div>

              {/* Section 8 — Observações */}
              <div>
                <SectionHeader number={8} title="OBSERVAÇÕES" />
                <div style={{ padding: "6px 10px", fontSize: "0.6rem", color: "#333", lineHeight: 1.5 }}>
                  {animal?.notes || animal?.observations ||
                    "Lote com bom desenvolvimento na fase de creche."}
                </div>
              </div>
            </div>

            {/* ══════════ FOOTER ══════════ */}
            <div style={{
              borderTop: `2px solid ${GREEN_DARK}`,
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              padding: "5px 14px",
              marginTop: "auto",
              flexShrink: 0,
              gap: 12,
              minHeight: 60,
            }}>
              <div>
                <div style={{ fontSize: "0.57rem", color: GRAY_TEXT, marginBottom: 3 }}>Responsável Técnico:</div>
                <div style={{ borderTop: "1px solid #555", paddingTop: 2, fontSize: "0.58rem", color: "#1a1a1a" }}>
                  Dr. João Silva – CRMV 12345
                </div>
              </div>
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=52x52&data=lote-${loteNum}-${animal?.id}`}
                  alt="QR Code"
                  style={{ width: 48, height: 48, display: "block" }}
                />
                <div style={{ fontSize: "0.5rem", color: GRAY_TEXT, lineHeight: 1.3, whiteSpace: "nowrap" }}>
                  Escaneie o QR Code<br />para acessar o lote<br />no sistema.
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, color: GREEN_DARK, fontSize: "0.75rem" }}>Sistema Gestão Agro</div>
                <div style={{ fontSize: "0.54rem", color: GRAY_TEXT, marginTop: 2 }}>Página 1 de 1</div>
              </div>
            </div>

            {/* ══════════ PRINT STYLES ══════════ */}
            <style>{`
              @media print {
                html, body { height: 100% !important; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                body > *:not(:has(.print-container-wrapper)) { display: none !important; }
                body > *:has(.print-container-wrapper) {
                  position: static !important; overflow: visible !important;
                  width: 100% !important; height: 100% !important;
                }
              /* Alvo direto das classes do Modal para garantir compatibilidade */
              .position-fixed, .overflow-auto {
                position: static !important; overflow: visible !important;
                padding: 0 !important; margin: 0 !important;
              }
              .dashboard-card {
                border: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                max-height: none !important;
                background: white !important;
              }
              div[class*="max-w-"] {
                max-width: none !important;
              }
              div.d-flex.justify-content-end.gap-2.w-100, button, .btn { display: none !important; }
              .print-container-wrapper {
                display: block !important; position: relative !important;
                width: 100% !important; height: 100% !important;
                margin: 0 !important; padding: 0 !important; background: white !important;
              }
              .unique-lote-print-sheet {
                width: 210mm !important;
                height: 297mm !important;
                min-height: 297mm !important;
                margin: 0 !important; padding: 0 !important;
                box-shadow: none !important;
                border: none !important;
                background: white !important;
                overflow: hidden !important;
                display: flex !important; flex-direction: column !important;
              }
              @page { size: A4 portrait; margin: 0; }
              }
              .ficha-lote-paper { box-sizing: border-box; }
            `}</style>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, fontSize: "0.62rem" }}>
      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ color: "#555", minWidth: 78, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function GeneticsRow({ icon, label, value, bold }: { icon: React.ReactNode; label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, fontSize: "0.6rem" }}>
      <span style={{ display: "flex", alignItems: "center", minWidth: 16, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: "#555", flex: 1 }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: bold ? "#1b5e20" : "#1a1a1a" }}>{value}</span>
    </div>
  );
}

function KpiSmall({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, fontSize: "0.6rem" }}>
      <span style={{ color: "#555" }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600 }}>{value}</span>
    </div>
  );
}

function KpiIcon({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, fontSize: "0.6rem" }}>
      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ color: "#555", flex: 1 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function FinRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: "0.62rem" }}>
      <span style={{ color: bold ? "#1a1a1a" : "#555", fontWeight: bold ? 800 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: bold ? "#1b5e20" : "#1a1a1a" }}>{value}</span>
    </div>
  );
}

function ResumoCard({ icon, title, value, status, statusColor }: {
  icon: React.ReactNode; title: string; value: string; status: string; statusColor: string;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "4px 6px",
      minWidth: 72,
      textAlign: "center",
    }}>
      <div style={{ marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: "0.6rem", color: "#1b5e20", marginBottom: 2, lineHeight: 1.3 }}>{title}</div>
      <div style={{ fontWeight: 900, fontSize: "0.82rem", lineHeight: 1.15, color: "#1a1a1a" }}>{value}</div>
      <div style={{ fontSize: "0.55rem", color: statusColor, fontWeight: 600, marginTop: 3 }}>{status}</div>
    </div>
  );
}
