"use client";
import { useState } from "react";
import { lotCostColumns, lotReportTotals, lotReportStatus, LotReportItem } from "@/services/lotReportService";
import { BatchTechnicalSheetModal } from "@/components/animal/BatchTechnicalSheetModal";
import { BatchFinancialDetails } from "./BatchFinancialDetails";
import { useOrganizationLocale } from "@/lib/locale";
import styles from "./page.module.css";

export function LotsTable({ items }: { items: LotReportItem[] }) {
  const { language, t } = useOrganizationLocale();
  const number = new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const count = new Intl.NumberFormat(language);
  const value = (amount: string | number | null | undefined, percentage = false) => amount == null ? "—" : `${number.format(Number(amount))}${percentage ? "%" : ""}`;
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [financialBatch, setFinancialBatch] = useState<string | null>(null);
  const totals = lotReportTotals(items);
  return <section className={styles.tablePanel}>
    <div className={styles.tableTitle}><div><span>{t("lotReport.batches").toLocaleUpperCase(language)}</span><h2>{t("lotReport.generalTitle")}</h2></div><strong>{t("lotReport.records", { count: items.length })}</strong></div>
    <p className={styles.lotExplanation}>Custos acumulados do lote. Os gastos mensais do reprodutor são divididos entre suas coberturas e acompanham os leitões nas transferências registradas. “—” indica valor ou vínculo não informado.</p>
    <div className={styles.tableScroll}><table className={styles.lotTable}>
      <thead><tr>
        <th rowSpan={2}>{t("lotReport.actions")}</th><th rowSpan={2}>{t("lotReport.batch")}</th><th rowSpan={2}>Tipo de Produção</th><th rowSpan={2}>{t("swineReproduction.matrices")}<small>(mãe dos leitões)</small></th><th rowSpan={2}>Animais Atuais</th><th rowSpan={2}>Status do Lote</th>
        <th colSpan={4} scope="colgroup">Custo Reprodução (por lote)</th><th colSpan={4} scope="colgroup">Custo por Lote (R$)</th>
        {lotCostColumns.slice(8).map(column => <th key={column.key} rowSpan={2} scope="col">{column.label}</th>)}
      </tr><tr>{lotCostColumns.slice(0, 8).map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{items.length ? items.map(item => <tr key={item.id}>
        <td><div className={styles.rowActions}><button type="button" title={t("lotReport.viewSheet", { batch: item.batch_code })} aria-label={t("lotReport.viewSheet", { batch: item.batch_code })} onClick={() => setSelectedBatch(item.id)}>◉</button><button type="button" title={t("lotReport.viewExpenses", { batch: item.batch_code })} aria-label={t("lotReport.viewExpenses", { batch: item.batch_code })} onClick={() => setFinancialBatch(item.id)}>⋮</button></div></td>
        <td><b>{item.batch_code}</b></td><td>{item.production_type || "—"}</td><td>{item.matrices?.join(", ") || "—"}</td><td>{count.format(item.quantity)}</td>
        <td><span className={styles.status} data-status={item.status}>{lotReportStatus(item)}</span></td>
        {lotCostColumns.map(({ key }) => <td key={key} data-result={key === "profit" || key === "margin" ? Number(item[key]) < 0 ? "negative" : "positive" : undefined}>{value(item[key], key === "margin")}</td>)}
      </tr>) : <tr><td colSpan={21} className={styles.empty}>{t("lotReport.empty")}</td></tr>}</tbody>
      {!!items.length && <tfoot><tr><th scope="row" colSpan={4}>{t("lotReport.total").toLocaleUpperCase(language)}</th><td>{count.format(items.reduce((sum, item) => sum + item.quantity, 0))}</td><td>—</td>{lotCostColumns.map(({ key }) => <td key={key}>{value(totals[key], key === "margin")}</td>)}</tr></tfoot>}
    </table></div>
    {items.some(item => item.reproduction_allocation_pending) && <p className={styles.lotExplanation}>Há custos do reprodutor ou quantidades de transferências sem informação suficiente. O rateio considera somente os valores e vínculos comprovados.</p>}
    {items.some(item => item.missing_cost_count) && <p className={styles.lotExplanation}>Há registros sem custo informado. Os totais consideram somente os valores disponíveis.</p>}
    {selectedBatch && <BatchTechnicalSheetModal isOpen onClose={() => setSelectedBatch(null)} batchId={selectedBatch} />}
    {financialBatch && <BatchFinancialDetails batchId={financialBatch} onClose={() => setFinancialBatch(null)} />}
  </section>;
}
