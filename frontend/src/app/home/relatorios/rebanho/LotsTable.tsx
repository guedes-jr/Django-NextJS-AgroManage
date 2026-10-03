"use client";
import { useState } from "react";
import { lotCostColumns, lotReportTotals, lotReportStatus, LotReportItem } from "@/services/lotReportService";
import { BatchTechnicalSheetModal } from "@/components/animal/BatchTechnicalSheetModal";
import { BatchFinancialDetails } from "./BatchFinancialDetails";
import styles from "./page.module.css";

const number = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("pt-BR");
const value = (amount: string | number | null | undefined, percentage = false) => amount == null ? "—" : `${number.format(Number(amount))}${percentage ? "%" : ""}`;

export function LotsTable({ items }: { items: LotReportItem[] }) {
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [financialBatch, setFinancialBatch] = useState<string | null>(null);
  const totals = lotReportTotals(items);
  return <section className={styles.tablePanel}>
    <div className={styles.tableTitle}><div><span>LOTES</span><h2>Relatório Geral dos Lotes</h2></div><strong>{items.length} registros</strong></div>
    <p className={styles.lotExplanation}>Custos acumulados registrados diretamente em cada lote. “—” indica valor ou vínculo não informado. Custos dos lotes de origem permanecem na linha de origem; gastos gerais sem lote não são rateados.</p>
    <div className={styles.tableScroll}><table className={styles.lotTable}>
      <thead><tr>
        <th rowSpan={2}>Ações</th><th rowSpan={2}>Lote</th><th rowSpan={2}>Tipo de Produção</th><th rowSpan={2}>Matrizes<small>(mãe dos leitões)</small></th><th rowSpan={2}>Animais Atuais</th><th rowSpan={2}>Status do Lote</th>
        <th colSpan={4} scope="colgroup">Custo Reprodução (por lote)</th><th colSpan={4} scope="colgroup">Custo por Lote (R$)</th>
        {lotCostColumns.slice(8).map(column => <th key={column.key} rowSpan={2} scope="col">{column.label}</th>)}
      </tr><tr>{lotCostColumns.slice(0, 8).map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{items.length ? items.map(item => <tr key={item.id}>
        <td><div className={styles.rowActions}><button type="button" title="Ver ficha do lote" aria-label={`Ver ficha do lote ${item.batch_code}`} onClick={() => setSelectedBatch(item.id)}>◉</button><button type="button" title="Ver gastos do lote" aria-label={`Ver gastos do lote ${item.batch_code}`} onClick={() => setFinancialBatch(item.id)}>⋮</button></div></td>
        <td><b>{item.batch_code}</b></td><td>{item.production_type || "—"}</td><td>{item.matrices?.join(", ") || "—"}</td><td>{count.format(item.quantity)}</td>
        <td><span className={styles.status} data-status={item.status}>{lotReportStatus(item)}</span></td>
        {lotCostColumns.map(({ key }) => <td key={key} data-result={key === "profit" || key === "margin" ? Number(item[key]) < 0 ? "negative" : "positive" : undefined}>{value(item[key], key === "margin")}</td>)}
      </tr>) : <tr><td colSpan={21} className={styles.empty}>Nenhum lote encontrado.</td></tr>}</tbody>
      {!!items.length && <tfoot><tr><th scope="row" colSpan={4}>TOTAL</th><td>{count.format(items.reduce((sum, item) => sum + item.quantity, 0))}</td><td>—</td>{lotCostColumns.map(({ key }) => <td key={key}>{value(totals[key], key === "margin")}</td>)}</tr></tfoot>}
    </table></div>
    {items.some(item => item.missing_cost_count) && <p className={styles.lotExplanation}>Há registros sem custo informado. Os totais consideram somente os valores disponíveis.</p>}
    {selectedBatch && <BatchTechnicalSheetModal isOpen onClose={() => setSelectedBatch(null)} batchId={selectedBatch} />}
    {financialBatch && <BatchFinancialDetails batchId={financialBatch} onClose={() => setFinancialBatch(null)} />}
  </section>;
}
