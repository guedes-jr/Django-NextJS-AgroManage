"use client";
import { useOrganizationLocale } from "@/lib/locale";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cattleHome, type CattleProduction } from "@/services/cattleNavigation";
import { cattleService, cattleError, type CattleFeed, type Page } from "@/services/cattleService";
import { CattleNutrition } from "./CattleNutrition";
import styles from "./cattle.module.css";

const number = (value: string | number, language = "pt-BR") => Number(value).toLocaleString(language, { maximumFractionDigits: 2 });
const date = (value: string, language = "pt-BR") => new Date(`${value}T12:00:00`).toLocaleDateString(language);

export function CattleFeedingReport({ farm, production }: { farm: string; production: CattleProduction }) {
  const { language, t } = useOrganizationLocale();
  const [data, setData] = useState<Page<CattleFeed> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const root = cattleHome(production);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      cattleService.list<CattleFeed>("feed", { farm, production, page, page_size: 10, search }, controller.signal)
        .then(data => { if (!controller.signal.aborted) setData(data); })
        .catch(error => { if (!controller.signal.aborted) setError(cattleError(error, language)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [farm, production, page, search, revision, language]);
  return <div id="alimentacao">
    <section className={styles.panel}>
      <h2>Relatório de alimentação</h2>
      <p className={styles.muted}>Histórico de ração e suplementos, quantidades e custos registrados. Consumos compartilhados exibem o total do lançamento, sem rateio presumido.</p>
      <div className={styles.toolbar}>
        <label className={styles.field}>Buscar ração, lote ou brinco<input type="search" className="form-control form-control-sm" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
        <div className={styles.actions}><Link href={`${root}/racao/tratos`} className="btn btn-outline-success btn-sm">{t("workspace.recordFeed")}</Link><Link href={`${root}/racao`} className="btn btn-outline-secondary btn-sm">Consumo por período e leitura do cocho</Link><Link href={`${root}/racao/producao`} className="btn btn-outline-secondary btn-sm">{t("swine.home.module.feedMill")}</Link><Link href={`${root}/racao/gerenciar-formulas`} className="btn btn-outline-secondary btn-sm">Fórmulas</Link></div>
      </div>
      {error ? <div className="alert alert-danger" role="alert">{error} <button className="btn btn-sm btn-outline-danger" onClick={() => setRevision(value => value + 1)}>{t("lotReport.retry")}</button></div> : loading ? <p role="status">Carregando consumos...</p> : <div className="table-responsive"><table className={styles.table}><thead><tr><th>{t("plantations.operation.period")}</th><th>{t("crops.destination")}</th><th>Ração / suplemento</th><th>Consumo (kg)</th><th>Custo registrado</th></tr></thead><tbody>
        {data?.results.map(row => <tr key={row.id}><td>{date(row.data_inicio, language)}<small>{t("plantations.history.through")} {date(row.data_fim, language)}</small></td><td>{row.lote_codigo || row.animais_identificadores.join(", ")}</td><td>{row.item_nome}</td><td>{number(row.quantidade, language)}</td><td>{row.custo_total == null ? t("lotReport.notInformed") : Number(row.custo_total).toLocaleString(language, { style: "currency", currency: "BRL" })}</td></tr>)}
        {!data?.count && <tr><td colSpan={5}>Nenhum consumo registrado neste filtro.</td></tr>}
      </tbody></table></div>}
      <div className={styles.pagination}><span>{data?.count ?? 0} lançamentos · página {page}</span><button className="btn btn-outline-secondary btn-sm" disabled={loading || Boolean(error) || page === 1} onClick={() => setPage(value => value - 1)}>{t("notifications.previous")}</button><button className="btn btn-outline-secondary btn-sm" disabled={loading || Boolean(error) || !data?.next} onClick={() => setPage(value => value + 1)}>{t("notifications.next")}</button></div>
    </section>
    <CattleNutrition key={`${farm}:${production}`} farm={farm} canWrite={false} />
  </div>;
}
