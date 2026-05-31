"use client";

import { useState, useEffect } from "react";
import { X, Printer, Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { apiClient } from "@/services/api";

interface AnimalTechnicalSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  animalId: string | number;
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────
const fmt = (v: any, decimals = 2) =>
  v != null && !isNaN(Number(v))
    ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : "-";

const fmtInt = (v: any) =>
  v != null && !isNaN(Number(v)) ? Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "-";

const fmtDate = (d: any) => {
  if (!d) return "-";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [year, month, day] = d.split("-");
    return `${day}/${month}/${year}`;
  }
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return d;
  return dateObj.toLocaleDateString("pt-BR");
};

const calcAge = (birthDate: string | null) => {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years > 0) {
    if (months > 0) return `${years} ano${years > 1 ? "s" : ""} e ${months} mê${months > 1 ? "ses" : "s"}`;
    return `${years} ano${years > 1 ? "s" : ""}`;
  }
  return `${months} mê${months > 1 ? "ses" : "s"}`;
};

const fmtOrigin = (origin: string) => {
  if (!origin) return "Nascida na Granja";
  const mapping: Record<string, string> = {
    purchased: "Compra Externa",
    born: "Nascido na Granja",
    donated: "Doação / Outro",
  };
  return mapping[origin.toLowerCase()] || origin;
};

const fmtReproductiveStatus = (status: string) => {
  if (!status) return "ATIVA";
  const mapping: Record<string, string> = {
    vazia: "VAZIA",
    em_preparo: "EM PREPARO",
    pronta: "PRONTA P/ SERVIÇO",
    coberta: "COBERTA (AGUARDANDO DG)",
    gestante: "PRENHE / GESTANTE",
    lactante: "LACTANTE / MATERNIDADE",
    descanso: "EM DESCANSO",
    ativa: "ATIVA",
    aguardando_cobertura: "AGUARDANDO COBERTURA",
  };
  return mapping[status.toLowerCase()] || status.toUpperCase();
};

// ─── Colors ──────────────────────────────────────────────────────────────────
const GREEN_DARK = "#1b5e20";
const GREEN_MID = "#2e7d32";
const GREEN_LIGHT = "#e8f5e9";
const GREEN_BORDER = "#c8e6c9";
const GRAY_TEXT = "#555";

// ─── Shared UI Components ─────────────────────────────────────────────────────
const SectionHeader = ({ number, title }: { number: number; title: string }) => (
  <div style={{
    background: GREEN_DARK,
    color: "#fff",
    fontWeight: 800,
    fontSize: "0.75rem",
    letterSpacing: "0.5px",
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    textTransform: "uppercase",
    borderTop: `1px solid #fff`,
    borderBottom: `1px solid #fff`,
  }}>
    <span style={{ fontSize: "1rem" }}>{number === 1 && "🆔"}
      {number === 2 && "📊"}
      {number === 3 && "📅"}
      {number === 4 && "💉"}
      {number === 5 && "💊"}
      {number === 6 && "💬"}
      {number === 7 && "📈"}
    </span> 
    <span>{number}. {title}</span>
  </div>
);

interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode;
}
const Th = ({ children, style, ...props }: ThProps) => (
  <th
    {...props}
    style={{
      color: GREEN_DARK,
      fontSize: "0.58rem",
      fontWeight: 800,
      textAlign: "center",
      padding: "6px 4px",
      borderBottom: `2px solid ${GREEN_DARK}`,
      borderRight: `1px solid ${GREEN_BORDER}`,
      whiteSpace: "pre-wrap",
      lineHeight: 1.2,
      background: GREEN_LIGHT,
      ...style,
    }}
  >{children}</th>
);

interface TdProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode;
  bold?: boolean;
}
const Td = ({ children, style, bold, ...props }: TdProps) => (
  <td
    {...props}
    style={{
      fontSize: "0.6rem",
      textAlign: "center",
      padding: "4px 4px",
      borderBottom: `1px solid ${GREEN_BORDER}`,
      borderRight: `1px solid ${GREEN_BORDER}`,
      fontWeight: bold ? 700 : 400,
      lineHeight: 1.3,
      ...style,
    }}
  >{children}</td>
);

interface TrProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children?: React.ReactNode;
  even?: boolean;
}
const TR = ({ children, even, style, ...props }: TrProps) => (
  <tr
    {...props}
    style={{ background: even ? "#f1f8f1" : "#fff", ...style }}
  >{children}</tr>
);

// ─── Matriz Template ─────────────────────────────────────────────────────────
function MatrizTemplate({ animal, history, reportDate, reportTime }: any) {
  const ageString = calcAge(animal?.birth_date);
  const cycles = animal?.reproductive_cycles || [];
  
  // History calculations
  const partos = history.filter((e: any) => e.type === "birth");
  const coberturas = history.filter((e: any) => e.type === "mating");
  const desmamesCount = cycles.filter((c: any) => c.weaning_date).length;
  const prenhezes = history.filter((e: any) => e.type === "pregnancy");
  
  const numPartos = partos.length;
  const numCoberturas = coberturas.length;
  const numPrenhezes = prenhezes.length;
  const numDesmames = desmamesCount;
  
  // Average farrowing interval in days
  let avgInterval = "-";
  if (partos.length > 1) {
    const dates = partos
      .map((p: any) => new Date(p.details?.birth_date || p.date))
      .filter((d: any) => !isNaN(d.getTime()))
      .sort((a: any, b: any) => a - b);
    let totalDays = 0;
    for (let i = 1; i < dates.length; i++) {
      totalDays += Math.round((dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24));
    }
    avgInterval = `${Math.round(totalDays / (dates.length - 1))} dias`;
  }
  
  const nascidosVivos = partos.reduce((acc: number, p: any) => acc + (p.details?.live_born || 0), 0);
  const produtividade = numPartos > 0 ? (nascidosVivos / numPartos).toFixed(1) : "0";
  const taxaPrenhez = numCoberturas > 0 ? ((numPrenhezes / numCoberturas) * 100).toFixed(1) : "0";

  // Dynamic cycle table rows
  const histRow = cycles.map((c: any) => ({
    n: c.cycle_number,
    dataCob: fmtDate(c.mating_date) || "-",
    tipo: c.mating_type_display || c.mating_type || "-",
    rep: c.sire_identifier || c.sire_info || "-",
    dataConf: c.pregnancy_confirmed ? "Confirmada" : (c.pregnancy_status === "failed" ? "Falhou" : "-"),
    diasGest: c.gestation_days || "-",
    dataParto: fmtDate(c.birth_date) || "-",
    totalNasc: c.total_born !== null ? c.total_born : "-",
    vivos: c.live_born !== null ? c.live_born : "-",
    mortos: c.stillborn !== null ? c.stillborn : "-",
    natimortos: c.mummified !== null ? c.mummified : "-",
    dataDesm: fmtDate(c.weaning_date) || "-",
    desmamados: c.weaned_quantity !== null ? c.weaned_quantity : "-",
    diasLact: c.lactation_days || "-",
    retCio: fmtDate(c.heat_return_date) || "-",
    obs: c.notes || "-"
  }));

  // Dynamic Vaccinations
  const vacinas = history
    .filter((e: any) => e.type === "vaccination")
    .map((v: any) => ({
      vacina: v.details?.vaccine_name || v.title.replace("Vacinação: ", ""),
      data: fmtDate(v.details?.application_date || v.date),
      prox: fmtDate(v.details?.next_dose_date) || "-",
      obs: v.details?.notes || v.subtitle || "-"
    }));

  // Dynamic Treatments / Medical records
  const tratamentos = history
    .filter((e: any) => e.type === "health")
    .map((h: any) => ({
      prod: h.details?.description || h.subtitle || "",
      motivo: h.details?.treatment_type_display || h.title.replace("Clínico: ", "") || "Tratamento",
      data: fmtDate(h.details?.application_date || h.date),
      dose: h.details?.notes || "-",
      resp: h.details?.veterinary || "Vet"
    }));

  return (
    <>
      {/* ══════════ HEADER ══════════ */}
      <div style={{ display: "flex", alignItems: "stretch", borderBottom: `2px solid ${GREEN_DARK}`, paddingBottom: 10, marginBottom: 15 }}>
        {/* Logo left */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 155 }}>
          <div style={{ width: 45, height: 45, background: GREEN_DARK, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "1.5rem" }}>🐷</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: GREEN_DARK, fontSize: "0.9rem", lineHeight: 1.2 }}>Gestão Agro</div>
            <div style={{ color: GRAY_TEXT, fontSize: "0.6rem" }}>Fazenda São João</div>
          </div>
        </div>

        {/* Center title */}
        <div style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontWeight: 900, fontSize: "1.3rem", color: GREEN_DARK, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            FICHA TÉCNICA <span style={{ color: GRAY_TEXT }}>–</span> MATRIZ
          </div>
          <div style={{ fontWeight: 700, fontSize: "0.75rem", color: "#1a1a1a", marginTop: 4 }}>CONTROLE DA FASE REPRODUTIVA</div>
          <div style={{ fontSize: "0.55rem", color: GREEN_DARK, fontWeight: 700, letterSpacing: 1, marginTop: 4 }}>
            MARRÃ • GESTAÇÃO • MATERNIDADE • PÓS-DESMAME / ESPERANDO COBERTURA
          </div>
        </div>

        {/* Info box right */}
        <div style={{ minWidth: 160, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ background: GREEN_DARK, color: "#fff", padding: "6px 12px", width: "100%", textAlign: "center", fontWeight: 800, fontSize: "1.1rem", letterSpacing: 1 }}>
            MATRIZ Nº {animal?.identifier || "..."}
          </div>
          <div style={{ fontSize: "0.55rem", color: GRAY_TEXT, marginTop: 4, width: "100%", textAlign: "right", paddingRight: 4 }}>
            Data do Relatório: {reportDate}<br/>Hora: {reportTime}
          </div>
        </div>
      </div>

      {/* ══════════ SEC 1 & 2 ══════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `2px solid ${GREEN_DARK}` }}>
        {/* Identificação */}
        <div style={{ borderRight: `2px solid ${GREEN_DARK}` }}>
          <SectionHeader number={1} title="IDENTIFICAÇÃO" />
          <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "130px 1fr", rowGap: 8, fontSize: "0.65rem", alignItems: "center" }}>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🧑‍🌾 Nome / Número:</span> <b>{animal?.identifier || "-"}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🏷️ Brinco:</span> <b>{animal?.identifier || "-"}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🧬 Raça / Linhagem:</span> <b>{animal?.breed_name || "Mestiça"}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>📅 Data de Nascimento:</span> <b>{fmtDate(animal?.birth_date)}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>⏱️ Idade:</span> <b>{ageString || "-"}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>📉 Categoria Atual:</span> 
              <span style={{ background: "#d1e7dd", color: "#0f5132", padding: "2px 8px", borderRadius: 4, fontWeight: 700, width: "fit-content" }}>{(animal?.category || "Matriz").toUpperCase()}</span>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🩺 Situação:</span> 
              <span style={{ background: "#d1e7dd", color: "#0f5132", padding: "2px 8px", borderRadius: 4, fontWeight: 700, width: "fit-content" }}>{fmtReproductiveStatus(animal?.reproductive_status)}</span>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>✅ Status:</span> 
              <span style={{ background: animal?.status === "active" ? "#1b5e20" : "#74c0fc", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700, width: "fit-content", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={12}/> {animal?.status === "active" ? "ATIVA" : "INATIVA"}
              </span>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🏢 Entrada na Granja:</span> <b>{fmtDate(animal?.entry_date)}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🌍 Origem:</span> <b>{fmtOrigin(animal?.batch_origin)}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>📝 Observações:</span> <b>{animal?.notes || "-"}</b>
          </div>
        </div>

        {/* Resumo Reprodutivo */}
        <div>
          <SectionHeader number={2} title="RESUMO REPRODUTIVO" />
          <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>🐷 Nº de Partos</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{numPartos}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>🕒 Int. Médio Parto</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{avgInterval}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>📅 Nº de Coberturas</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{numCoberturas}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>📈 Produtividade</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{produtividade}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>➕ Nº de Prenhezes</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{numPrenhezes}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>🎯 Taxa de Prenhez</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{taxaPrenhez}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>🐖 Nº de Desmames</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{numDesmames}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>✔️ Situação Reprod.</span>
              <span style={{ background: "#d1e7dd", color: "#0f5132", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: "0.65rem" }}>NORMAL</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ SEC 3 - Histórico ══════════ */}
      <div style={{ borderBottom: `2px solid ${GREEN_DARK}` }}>
        <SectionHeader number={3} title="HISTÓRICO REPRODUTIVO" />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th style={{ borderBottom: "none" }}></Th>
              <Th colSpan={2} style={{ borderBottom: `2px solid ${GREEN_DARK}` }}>Cobertura / IA</Th>
              <Th colSpan={3} style={{ borderBottom: `2px solid ${GREEN_DARK}` }}>Parto</Th>
              <Th colSpan={4} style={{ borderBottom: `2px solid ${GREEN_DARK}` }}>Desmame / Retorno</Th>
              <Th style={{ borderBottom: "none" }}></Th>
            </tr>
            <tr>
              <Th>Nº</Th>
              <Th>Data</Th>
              <Th>Macho<br/>(Tipo)</Th>
              <Th>Data<br/>Parto</Th>
              <Th>Dias<br/>Gest.</Th>
              <Th>Nascidos<br/>(V / M / N)</Th>
              <Th>Data<br/>Desmame</Th>
              <Th>Qtd.<br/>Desm.</Th>
              <Th>Dias<br/>Lact.</Th>
              <Th>Data<br/>Ret. Cio</Th>
              <Th>Observações</Th>
            </tr>
          </thead>
          <tbody>
            {histRow.length === 0 ? (
              <TR>
                <Td colSpan={11} style={{ color: GRAY_TEXT, fontStyle: "italic", padding: "10px" }}>Nenhum histórico reprodutivo registrado</Td>
              </TR>
            ) : (
              histRow.map((r: any, i: number) => (
                <TR key={i} even={i % 2 !== 0}>
                  <Td bold>{r.n}</Td>
                  <Td>{r.dataCob}</Td>
                  <Td>{r.rep} ({r.tipo})</Td>
                  <Td>{r.dataParto}</Td>
                  <Td>{r.diasGest}</Td>
                  <Td>{r.vivos !== "-" ? `${r.totalNasc} (${r.vivos}/${r.mortos}/${r.natimortos})` : "-"}</Td>
                  <Td>{r.dataDesm}</Td>
                  <Td>{r.desmamados}</Td>
                  <Td>{r.diasLact}</Td>
                  <Td>{r.retCio}</Td>
                  <Td style={{ fontSize: "0.55rem" }}>{r.obs}</Td>
                </TR>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ══════════ SEC 4 & 5 ══════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginBottom: 15 }}>
        {/* Vacinas */}
        <div style={{ border: `1px solid ${GREEN_BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          <SectionHeader number={4} title="VACINAÇÕES" />
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Vacina</Th>
                <Th>Data</Th>
                <Th>Próxima Dose</Th>
                <Th>Observações</Th>
              </tr>
            </thead>
            <tbody>
              {vacinas.length === 0 ? (
                <TR>
                  <Td colSpan={4} style={{ color: GRAY_TEXT, fontStyle: "italic", padding: "10px" }}>Nenhuma vacinação registrada</Td>
                </TR>
              ) : (
                vacinas.map((v: any, i: number) => (
                  <TR key={i} even={i % 2 !== 0}>
                    <Td>{v.vacina}</Td>
                    <Td>{v.data}</Td>
                    <Td>{v.prox}</Td>
                    <Td>{v.obs}</Td>
                  </TR>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Medicações */}
        <div style={{ border: `1px solid ${GREEN_BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          <SectionHeader number={5} title="TRATAMENTOS / MEDICAÇÕES" />
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Motivo</Th>
                <Th>Data</Th>
                <Th>Dosagem</Th>
                <Th>Responsável</Th>
              </tr>
            </thead>
            <tbody>
              {tratamentos.length === 0 ? (
                <TR>
                  <Td colSpan={5} style={{ color: GRAY_TEXT, fontStyle: "italic", padding: "10px" }}>Nenhum tratamento registrado</Td>
                </TR>
              ) : (
                tratamentos.map((t: any, i: number) => (
                  <TR key={i} even={i % 2 !== 0}>
                    <Td>{t.prod}</Td>
                    <Td>{t.motivo}</Td>
                    <Td>{t.data}</Td>
                    <Td>{t.dose}</Td>
                    <Td>{t.resp}</Td>
                  </TR>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════ SEC 6 ══════════ */}
      <div style={{ border: `1px solid ${GREEN_BORDER}`, borderRadius: 8, overflow: "hidden", marginBottom: 15 }}>
        <SectionHeader number={6} title="OBSERVAÇÕES" />
        <div style={{ padding: "10px", fontSize: "0.65rem", color: "#333", lineHeight: 1.5 }}>
          {animal?.notes || "Nenhuma observação registrada para esta matriz."}
        </div>
      </div>

      {/* ══════════ SEC 7 - Flow ══════════ */}
      <div style={{ border: `1px solid ${GREEN_BORDER}`, borderRadius: 8, overflow: "hidden", marginBottom: 15 }}>
        <SectionHeader number={7} title="FLUXO DA FASE REPRODUTIVA" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px" }}>
          
          <div style={{ textAlign: "center", width: 100 }}>
            <div style={{ fontWeight: 800, fontSize: "0.6rem", color: GREEN_DARK, marginBottom: 5 }}>MARRÃ</div>
            <div style={{ fontSize: "1.8rem", marginBottom: 5 }}>🐖</div>
            <div style={{ fontSize: "0.55rem", color: GRAY_TEXT }}>Fêmea jovem em adaptação e preparação para cobertura.</div>
          </div>
          
          <span style={{ fontSize: "1.2rem", color: GREEN_DARK }}>➔</span>
          
          <div style={{ textAlign: "center", width: 100 }}>
            <div style={{ fontWeight: 800, fontSize: "0.6rem", color: GREEN_DARK, marginBottom: 5 }}>GESTAÇÃO</div>
            <div style={{ fontSize: "1.8rem", marginBottom: 5 }}>🐖</div>
            <div style={{ fontSize: "0.55rem", color: GRAY_TEXT }}>Período de gestação (114 dias em média). Acompanhamento de prenhez e saúde.</div>
          </div>

          <span style={{ fontSize: "1.2rem", color: GREEN_DARK }}>➔</span>

          <div style={{ textAlign: "center", width: 100 }}>
            <div style={{ fontWeight: 800, fontSize: "0.6rem", color: GREEN_DARK, marginBottom: 5 }}>MATERNIDADE</div>
            <div style={{ fontSize: "1.8rem", marginBottom: 5 }}>🐖</div>
            <div style={{ fontSize: "0.55rem", color: GRAY_TEXT }}>Período de parto e lactação. Cuidados com leitões e matriz.</div>
          </div>

          <span style={{ fontSize: "1.2rem", color: GREEN_DARK }}>➔</span>

          <div style={{ textAlign: "center", width: 100 }}>
            <div style={{ fontWeight: 800, fontSize: "0.6rem", color: GREEN_DARK, marginBottom: 5 }}>PÓS-DESMAME /<br/>ESPERANDO COBERTURA</div>
            <div style={{ fontSize: "1.8rem", marginBottom: 5 }}>🐖</div>
            <div style={{ fontSize: "0.55rem", color: GRAY_TEXT }}>Recuperação da matriz, retorno ao cio e preparação para nova cobertura.</div>
          </div>

          <span style={{ fontSize: "1.2rem", color: GREEN_DARK }}>➔</span>

          <div style={{ textAlign: "center", width: 100 }}>
            <div style={{ fontWeight: 800, fontSize: "0.6rem", color: GREEN_DARK, marginBottom: 5 }}>NOVO CICLO</div>
            <div style={{ fontSize: "1.8rem", marginBottom: 5 }}>🔄</div>
            <div style={{ fontSize: "0.55rem", color: GRAY_TEXT }}>Após nova cobertura, retorna para a fase de gestação.</div>
          </div>

        </div>
      </div>

      {/* ══════════ FOOTER ══════════ */}
      <div style={{ borderTop: `1px solid ${GREEN_BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, marginTop: "auto" }}>
        <div style={{ display: "flex", gap: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#f0f0f0", padding: "6px", borderRadius: "50%" }}>🧑‍⚕️</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.65rem", color: "#1a1a1a" }}>Responsável Técnico</div>
              <div style={{ fontSize: "0.6rem", color: GRAY_TEXT }}>Dr. João Silva<br/>CRMV 12345</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=52x52&data=matriz-${animal?.identifier}`} alt="QR Code" style={{ width: 42, height: 42 }} />
            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#1a1a1a" }}>QR Code<br/><span style={{ fontSize: "0.55rem", color: GRAY_TEXT, fontWeight: 400 }}>Escaneie para acessar o histórico.</span></div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Reprodutor Template ──────────────────────────────────────────────────────
function ReprodutorTemplate({ animal, history, reportDate, reportTime }: any) {
  const ageString = calcAge(animal?.birth_date);
  
  // History calculations
  const coberturas = history.filter((e: any) => e.type === "mating");
  
  const numCoberturas = coberturas.length;
  // Semen collections are not tracked in DB, fallback to 0 or check if custom collections are added
  const numColetas = history.filter((e: any) => e.type === "semen_collection").length;
  
  const successfulMatings = coberturas.filter((m: any) => m.details?.status === "confirmed").length;
  const taxaSucesso = numCoberturas > 0 ? `${((successfulMatings / numCoberturas) * 100).toFixed(1)}%` : "0%";

  // Dynamic Vaccinations
  const vacinas = history
    .filter((e: any) => e.type === "vaccination")
    .map((v: any) => ({
      vacina: v.details?.vaccine_name || v.title.replace("Vacinação: ", ""),
      data: fmtDate(v.details?.application_date || v.date),
      prox: fmtDate(v.details?.next_dose_date) || "-",
      obs: v.details?.notes || v.subtitle || "-"
    }));

  // Dynamic Treatments / Medical records
  const tratamentos = history
    .filter((e: any) => e.type === "health")
    .map((h: any) => ({
      prod: h.details?.description || h.subtitle || "",
      motivo: h.details?.treatment_type_display || h.title.replace("Clínico: ", "") || "Tratamento",
      data: fmtDate(h.details?.application_date || h.date),
      dose: h.details?.notes || "-",
      resp: h.details?.veterinary || "Vet"
    }));

  return (
    <>
      {/* ══════════ HEADER ══════════ */}
      <div style={{ display: "flex", alignItems: "stretch", borderBottom: `2px solid ${GREEN_DARK}`, paddingBottom: 10, marginBottom: 15 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 155 }}>
          <div style={{ width: 45, height: 45, background: GREEN_DARK, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "1.5rem" }}>🐗</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: GREEN_DARK, fontSize: "0.9rem", lineHeight: 1.2 }}>Gestão Agro</div>
            <div style={{ color: GRAY_TEXT, fontSize: "0.6rem" }}>Fazenda São João</div>
          </div>
        </div>

        <div style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontWeight: 900, fontSize: "1.3rem", color: GREEN_DARK, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            FICHA TÉCNICA <span style={{ color: GRAY_TEXT }}>–</span> REPRODUTOR
          </div>
          <div style={{ fontWeight: 700, fontSize: "0.75rem", color: "#1a1a1a", marginTop: 4 }}>CONTROLE DE ATIVIDADE</div>
          <div style={{ fontSize: "0.55rem", color: GREEN_DARK, fontWeight: 700, letterSpacing: 1, marginTop: 4 }}>
            DESCANSO • MONTA NATURAL • COLETA DE SÊMEN
          </div>
        </div>

        {/* Info box right */}
        <div style={{ minWidth: 160, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ background: GREEN_DARK, color: "#fff", padding: "6px 12px", width: "100%", textAlign: "center", fontWeight: 800, fontSize: "1.1rem", letterSpacing: 1 }}>
            REPRODUTOR Nº {animal?.identifier || "..."}
          </div>
          <div style={{ fontSize: "0.55rem", color: GRAY_TEXT, marginTop: 4, width: "100%", textAlign: "right", paddingRight: 4 }}>
            Data do Relatório: {reportDate}<br/>Hora: {reportTime}
          </div>
        </div>
      </div>

      {/* ══════════ SEC 1 & 2 ══════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `2px solid ${GREEN_DARK}` }}>
        {/* Identificação */}
        <div style={{ borderRight: `2px solid ${GREEN_DARK}` }}>
          <SectionHeader number={1} title="IDENTIFICAÇÃO" />
          <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "130px 1fr", rowGap: 8, fontSize: "0.65rem", alignItems: "center" }}>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🧑‍🌾 Nome / Número:</span> <b>{animal?.identifier || "-"}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🏷️ Brinco:</span> <b>{animal?.identifier || "-"}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🧬 Raça / Linhagem:</span> <b>{animal?.breed_name || "Mestiço"}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>📅 Data de Nascimento:</span> <b>{fmtDate(animal?.birth_date)}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>⏱️ Idade:</span> <b>{ageString || "-"}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>📉 Categoria Atual:</span> 
              <span style={{ background: "#d1e7dd", color: "#0f5132", padding: "2px 8px", borderRadius: 4, fontWeight: 700, width: "fit-content" }}>{(animal?.category || "Reprodutor").toUpperCase()}</span>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>✅ Status:</span> 
              <span style={{ background: animal?.status === "active" ? "#1b5e20" : "#74c0fc", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700, width: "fit-content", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={12}/> {animal?.status === "active" ? "ATIVO" : "INATIVO"}
              </span>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🏢 Entrada na Granja:</span> <b>{fmtDate(animal?.entry_date)}</b>
            <span style={{ color: GRAY_TEXT, display: "flex", alignItems: "center", gap: 6 }}>🌍 Origem:</span> <b>{fmtOrigin(animal?.batch_origin)}</b>
          </div>
        </div>

        {/* Resumo Atividade */}
        <div>
          <SectionHeader number={2} title="RESUMO DE ATIVIDADE" />
          <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>🐎 Montas Realizadas</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{numCoberturas}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>🧪 Coletas de Sêmen</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{numColetas}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>🎯 Taxa de Sucesso</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{taxaSucesso}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <span style={{ color: GRAY_TEXT, fontSize: "0.6rem", display: "flex", alignItems: "center", gap: 6 }}>⚖️ Peso Atual</span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{animal?.current_weight_kg || "-"} kg</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ SEC 3 - Histórico de Coberturas ══════════ */}
      <div style={{ borderBottom: `2px solid ${GREEN_DARK}` }}>
        <SectionHeader number={3} title="HISTÓRICO DE COBERTURAS / MONTAS" />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Nº</Th>
              <Th>Data</Th>
              <Th>Matriz Coberta</Th>
              <Th>Tipo</Th>
              <Th>Status</Th>
              <Th>Previsão Parto</Th>
              <Th>Observações</Th>
            </tr>
          </thead>
          <tbody>
            {coberturas.length === 0 ? (
              <TR>
                <Td colSpan={7} style={{ color: GRAY_TEXT, fontStyle: "italic", padding: "10px" }}>Nenhuma cobertura registrada</Td>
              </TR>
            ) : (
              coberturas.map((m: any, i: number) => (
                <TR key={i} even={i % 2 !== 0}>
                  <Td bold>{i + 1}</Td>
                  <Td>{fmtDate(m.date)}</Td>
                  <Td>{m.subtitle?.replace("Matriz: ", "") || "-"}</Td>
                  <Td>{m.details?.mating_type || "-"}</Td>
                  <Td>{m.status || "-"}</Td>
                  <Td>{fmtDate(m.details?.expected_birth_date)}</Td>
                  <Td style={{ fontSize: "0.55rem" }}>{m.details?.notes || "-"}</Td>
                </TR>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ══════════ SEC 4 & 5 ══════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `2px solid ${GREEN_DARK}` }}>
        {/* Vacinas */}
        <div style={{ borderRight: `2px solid ${GREEN_DARK}` }}>

          <SectionHeader number={4} title="VACINAÇÕES" />
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Vacina</Th>
                <Th>Data</Th>
                <Th>Próxima Dose</Th>
                <Th>Observações</Th>
              </tr>
            </thead>
            <tbody>
              {vacinas.length === 0 ? (
                <TR>
                  <Td colSpan={4} style={{ color: GRAY_TEXT, fontStyle: "italic", padding: "10px" }}>Nenhuma vacinação registrada</Td>
                </TR>
              ) : (
                vacinas.map((v: any, i: number) => (
                  <TR key={i} even={i % 2 !== 0}>
                    <Td>{v.vacina}</Td>
                    <Td>{v.data}</Td>
                    <Td>{v.prox}</Td>
                    <Td>{v.obs}</Td>
                  </TR>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Medicações */}
        <div>
          <SectionHeader number={5} title="TRATAMENTOS / MEDICAÇÕES" />
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Motivo</Th>
                <Th>Data</Th>
                <Th>Dosagem</Th>
                <Th>Responsável</Th>
              </tr>
            </thead>
            <tbody>
              {tratamentos.length === 0 ? (
                <TR>
                  <Td colSpan={5} style={{ color: GRAY_TEXT, fontStyle: "italic", padding: "10px" }}>Nenhum tratamento registrado</Td>
                </TR>
              ) : (
                tratamentos.map((t: any, i: number) => (
                  <TR key={i} even={i % 2 !== 0}>
                    <Td>{t.prod}</Td>
                    <Td>{t.motivo}</Td>
                    <Td>{t.data}</Td>
                    <Td>{t.dose}</Td>
                    <Td>{t.resp}</Td>
                  </TR>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════ FOOTER ══════════ */}
      <div style={{ borderTop: `1px solid ${GREEN_BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, marginTop: "auto" }}>
        <div style={{ display: "flex", gap: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#f0f0f0", padding: "6px", borderRadius: "50%" }}>🧑‍⚕️</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.65rem", color: "#1a1a1a" }}>Responsável Técnico</div>
              <div style={{ fontSize: "0.6rem", color: GRAY_TEXT }}>Dr. João Silva<br/>CRMV 12345</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=52x52&data=reprodutor-${animal?.identifier}`} alt="QR Code" style={{ width: 42, height: 42 }} />
          <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#1a1a1a" }}>QR Code<br/><span style={{ fontSize: "0.55rem", color: GRAY_TEXT, fontWeight: 400 }}>Escaneie para acessar o histórico.</span></div>
        </div>
      </div>
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function AnimalTechnicalSheetModal({ isOpen, onClose, animalId }: AnimalTechnicalSheetModalProps) {
  const [animal, setAnimal] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && animalId) {
      setLoading(true);
      
      // Step 1: Fetch batch details first to determine category
      apiClient.get(`/livestock/batches/${animalId}/`)
        .then((batchRes) => {
          const batchData = batchRes.data;
          const category = (batchData?.category || "").toLowerCase();
          const isReproductive = ["matriz", "marrã", "reprodutor", "cachaço", "cacho", "touro", "vaca", "novilha"].some(
            c => category.includes(c)
          );
          
          if (isReproductive) {
            // Step 2: Fetch individual animal details & history
            return Promise.all([
              apiClient.get(`/livestock/batches/${animalId}/animal-detail/`).catch(() => null),
              apiClient.get(`/livestock/batches/${animalId}/animal-history/`).catch(() => null),
            ]).then(([animalRes, historyRes]) => {
              if (animalRes && animalRes.data) {
                setAnimal(animalRes.data);
                setHistory(historyRes?.data || []);
              } else {
                // Fallback to batch data if individual animal not found
                setAnimal(batchData);
                setHistory([]);
              }
            });
          } else {
            // Non-reproductive, just use the batch and its phase history
            return apiClient.get(`/livestock/batches/${animalId}/history/`)
              .then((histRes) => {
                setAnimal(batchData);
                setHistory(histRes.data || []);
              });
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, animalId]);

  const handlePrint = () => window.print();

  if (!isOpen) return null;

  const now = new Date();
  const reportDate = now.toLocaleDateString("pt-BR");
  const reportTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // Determine which template to render based on category (batches don't have gender)
  const category = (animal?.category || "").toLowerCase();
  const isReprodutor = ["reprodutor", "cachaço", "cacho", "touro"].some(c => category.includes(c));
  const TemplateContent = isReprodutor ? ReprodutorTemplate : MatrizTemplate;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ficha Técnica — ${animal?.identifier || ""}`}
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
          <span className="text-muted">Carregando ficha técnica...</span>
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
              padding: "15px",
              border: "2px solid #1b5e20",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <TemplateContent 
              animal={animal} 
              history={history} 
              reportDate={reportDate} 
              reportTime={reportTime} 
            />
          </div>
          <style>{`
            @media print {
              html, body { overflow: visible !important; height: auto !important; }
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              body > *:not(:has(.print-container-wrapper)) { display: none !important; }
              body > *:has(.print-container-wrapper) {
                position: static !important; overflow: visible !important;
                width: 100% !important; height: auto !important;
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
                width: 100% !important;
                min-height: 297mm !important;
                margin: 0 !important; padding: 15px !important;
                box-shadow: none !important;
                border: 2px solid #1b5e20 !important;
                background: white !important;
                overflow: visible !important;
                display: flex !important; flex-direction: column !important;
                page-break-inside: auto !important; break-after: auto !important;
              }
              @page { size: A4 portrait; margin: 10mm; }
            }
            .ficha-lote-paper { box-sizing: border-box; }
          `}</style>
        </div>
      )}
    </Modal>
  );
}
