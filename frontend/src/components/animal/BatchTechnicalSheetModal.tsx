"use client";

import { useState, useEffect } from "react";
import { X, Printer, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { apiClient } from "@/services/api";

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

const calcGPD = (startWeight: number, endWeight: number, startDate: string, endDate: string) => {
  if (!startDate || !endDate || startWeight == null || endWeight == null) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 0;
  return (endWeight - startWeight) / diffDays;
};

const calcDays = (startDate: string, endDate: string | null) => {
  if (!startDate) return "-";
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

// ─── Colors ──────────────────────────────────────────────────────────────────
const GREEN_DARK = "#1b5e20";
const GREEN_MID = "#2e7d32";
const GREEN_LIGHT = "#e8f5e9";
const GREEN_BORDER = "#c8e6c9";
const GRAY_TEXT = "#555";

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

const Td = ({ children, style, bold, colSpan }: { children: React.ReactNode; style?: React.CSSProperties; bold?: boolean; colSpan?: number }) => (
  <td colSpan={colSpan} style={{
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

export function BatchTechnicalSheetModal({ isOpen, onClose, batchId }: BatchTechnicalSheetModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [batchInfo, setBatchInfo] = useState<any>(null);

  useEffect(() => {
    if (isOpen && batchId) {
      setLoading(true);
      setError("");
      
      // Fetch batch basic info
      apiClient.get(`/livestock/batches/${batchId}/`)
        .then(res => {
          setBatchInfo(res.data);
          // Fetch batch history
          return apiClient.get(`/livestock/batches/${batchId}/history/`);
        })
        .then(res => {
          setHistory(res.data || []);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError("Não foi possível carregar a ficha do lote.");
          setLoading(false);
        });
    }
  }, [isOpen, batchId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="d-flex justify-content-between align-items-center p-3 border-bottom d-print-none bg-light">
        <h5 className="mb-0 fw-bold d-flex align-items-center gap-2" style={{ color: GREEN_DARK }}>
          <span style={{ fontSize: "1.2rem" }}>📑</span> Ficha Técnica do Lote
        </h5>
        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-sm btn-outline-success d-flex align-items-center gap-2 fw-semibold"
            onClick={handlePrint}
            disabled={loading || !!error}
          >
            <Printer size={16} /> <span className="d-none d-sm-inline">Imprimir Ficha</span>
          </button>
          <button onClick={onClose} className="btn btn-sm btn-light border" aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="p-0 position-relative modal-body-print-container" style={{ background: "#e0e0e0" }}>
        {loading ? (
          <div className="d-flex justify-content-center align-items-center py-5" style={{ minHeight: 400 }}>
            <Loader2 className="animate-spin text-success" size={32} />
          </div>
        ) : error ? (
          <div className="p-4 text-center text-danger fw-bold">{error}</div>
        ) : (
          <div className="ficha-lote-wrapper d-flex justify-content-center p-3">
            <div className="ficha-lote-paper unique-lote-print-sheet shadow bg-white p-4" style={{
              width: "210mm",
              minHeight: "277mm",
              background: "#fff",
              position: "relative",
              color: "#000",
              fontFamily: "Arial, sans-serif"
            }}>
              
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2px solid ${GREEN_DARK}`, paddingBottom: 10, marginBottom: 15 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=52x52&data=lote-${batchInfo?.batch_code}-${batchInfo?.id}`}
                    alt="QR Code"
                    style={{ width: 48, height: 48, display: "block" }}
                  />
                  <div style={{ fontSize: "0.5rem", color: GRAY_TEXT, lineHeight: 1.3, whiteSpace: "nowrap" }}>
                    Escaneie o QR Code<br />para acessar o lote<br />no sistema.
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, color: GREEN_DARK, fontSize: "0.75rem" }}>Sistema Gestão Agro</div>
                  <div style={{ fontSize: "0.54rem", color: GRAY_TEXT, marginTop: 2 }}>Ficha do Lote</div>
                </div>
              </div>

              {/* Informações Básicas */}
              <SectionHeader number={1} title="Identificação do Lote" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 15px", marginBottom: 20, marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: "0.55rem", color: GRAY_TEXT, fontWeight: 700, textTransform: "uppercase" }}>Código do Lote</div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#000" }}>{batchInfo?.batch_code || "-"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.55rem", color: GRAY_TEXT, fontWeight: 700, textTransform: "uppercase" }}>Fase Atual</div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "capitalize", color: GREEN_DARK }}>{batchInfo?.phase || "-"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.55rem", color: GRAY_TEXT, fontWeight: 700, textTransform: "uppercase" }}>Status</div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>{batchInfo?.status === "active" ? "Ativo" : "Concluído / Finalizado"}</div>
                </div>
              </div>

              {/* Histórico de Fases */}
              <SectionHeader number={2} title="Histórico de Fases e Desempenho" />
              <div style={{ marginTop: 10, marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
                  <thead>
                    <tr>
                      <Th>Fase</Th>
                      <Th>Entrada</Th>
                      <Th>Saída</Th>
                      <Th>Dias na Fase</Th>
                      <Th>Quantidade</Th>
                      <Th>Peso Médio (kg)</Th>
                      <Th>GPD (kg/dia)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length > 0 ? history.map((ph, idx) => {
                      const prevPhase = idx > 0 ? history[idx - 1] : null;
                      const gpd = prevPhase && prevPhase.avg_weight_kg && ph.avg_weight_kg 
                        ? calcGPD(prevPhase.avg_weight_kg, ph.avg_weight_kg, prevPhase.exit_date || prevPhase.entry_date, ph.entry_date || ph.exit_date)
                        : null;

                      return (
                        <TR key={idx} even={idx % 2 === 0}>
                          <Td bold style={{ textTransform: "capitalize" }}>{ph.phase}</Td>
                          <Td>{fmtDate(ph.entry_date)}</Td>
                          <Td>{ph.exit_date ? fmtDate(ph.exit_date) : "Atual"}</Td>
                          <Td>{calcDays(ph.entry_date, ph.exit_date)}</Td>
                          <Td>{fmtInt(ph.quantity)}</Td>
                          <Td>{fmt(ph.avg_weight_kg, 2)}</Td>
                          <Td bold style={{ color: gpd && gpd > 0 ? GREEN_DARK : GRAY_TEXT }}>
                            {gpd ? fmt(gpd, 3) : "-"}
                          </Td>
                        </TR>
                      );
                    }) : (
                      <TR>
                        <Td style={{ padding: "10px", color: GRAY_TEXT }} colSpan={7}>
                          Nenhum histórico de fases registrado para este lote.
                        </Td>
                      </TR>
                    )}
                  </tbody>
                </table>
                <div style={{ fontSize: "0.55rem", color: GRAY_TEXT, fontStyle: "italic" }}>
                  * GPD (Ganho de Peso Diário) é calculado com base na diferença de peso médio entre o final de uma fase e o final da fase atual, dividido pelos dias do período.
                </div>
              </div>
              
              <div style={{ position: "absolute", bottom: "10mm", left: "10mm", right: "10mm", borderTop: "1px dashed #ccc", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: "0.55rem", color: GRAY_TEXT }}>
                <div>Impresso em: {new Date().toLocaleString("pt-BR")}</div>
                <div>{batchInfo?.batch_code}</div>
              </div>
            </div>
            <style>{`
              @media print {
                body * { visibility: hidden; }
                .d-print-none { display: none !important; }
                .unique-lote-print-sheet {
                  visibility: visible !important;
                  position: absolute !important;
                  left: 0 !important; top: 0 !important;
                  width: 100% !important; height: 277mm !important;
                  margin: 0 !important; padding: 0 !important;
                  box-shadow: none !important; border: 2px solid #1b5e20 !important;
                  background: white !important; overflow: hidden !important;
                }
                .unique-lote-print-sheet * { visibility: visible; }
                @page { size: A4 portrait; margin: 6mm; }
              }
              .ficha-lote-paper { box-sizing: border-box; }
            `}</style>
          </div>
        )}
      </div>
    </Modal>
  );
}
