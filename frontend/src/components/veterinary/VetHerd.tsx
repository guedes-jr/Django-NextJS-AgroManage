"use client";

import { Fragment, useEffect, useState } from "react";
import { Baby, HeartPulse, PawPrint, Syringe } from "lucide-react";
import type { TranslationKey } from "@/lib/localeMessages";
import { veterinaryService, vetError, type VetHerdHistory, type VetHerdPage } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import { VetKpis, type VetContext } from "./VeterinaryArea";

/** Read-only farm herd: segment animals with their reproduction and health records. */
export function VetHerd({ ctx }: { ctx: VetContext }) {
  const { t, fmt } = ctx;
  const [species, setSpecies] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VetHerdPage | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");

  // Debounce the free-text search so typing does not fire one request per key.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    veterinaryService
      .herd({ species: species || undefined, q: search || undefined, page }, controller.signal)
      .then(result => { setData(result); setError(""); })
      .catch(err => { if (!controller.signal.aborted) setError(vetError(err, t("vet.herd.error"))); });
    return () => controller.abort();
  }, [species, search, page, t]);

  if (error && !data) {
    return <div role="alert" className="alert alert-danger">{error}</div>;
  }
  if (!data) return <p className={styles.muted}>{t("vet.loading")}</p>;

  const pages = Math.max(1, Math.ceil(data.count / data.page_size));
  const pregnant = data.results.filter(animal => animal.expected_birth).length;

  return (
    <>
      <VetKpis items={[
        { label: t("vet.tab.herd"), value: data.count, icon: PawPrint },
        { label: t("vet.herd.expectedBirth"), value: pregnant, icon: Baby },
        { label: t("vet.herd.withVaccine"), value: data.results.filter(animal => animal.last_vaccine).length, icon: Syringe },
      ]} />

      <section className={styles.panel}>
        <div className={styles.panelHead}><h2>{t("vet.herd.title")}</h2></div>
        <p className={styles.muted} style={{ marginBottom: 10 }}>{t("vet.herd.subtitle")}</p>
        {!data.species.length ? (
          <p className={styles.muted}>{t("vet.herd.noSpecies")}</p>
        ) : (
          <div className={styles.filters}>
            <select className="form-select" style={{ flex: "1 1 160px" }} value={species} aria-label={t("vet.herd.species")}
              onChange={e => { setSpecies(e.target.value); setPage(1); setOpen(""); }}>
              <option value="">{t("vet.herd.allSpecies")}</option>
              {data.species.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <input type="search" className="form-control" style={{ flex: "2 1 220px" }} placeholder={t("vet.herd.search")} value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); setOpen(""); }} />
          </div>
        )}
      </section>

      {data.species.length > 0 && <section className={styles.panel}>
        <p className={styles.muted} style={{ marginBottom: 8 }}>{t("vet.herd.count", { count: data.count })}</p>
        {data.results.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table} style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>{t("vet.herd.animal")}</th>
                  <th>{t("vet.herd.species")}</th>
                  <th>{t("vet.herd.reproductive")}</th>
                  <th>{t("vet.herd.lastVaccine")}</th>
                  <th>{t("vet.herd.lastHealth")}</th>
                  <th>{t("vet.herd.expectedBirth")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.results.map(animal => (
                  <Fragment key={animal.id}>
                    <tr>
                      <td><b>{animal.identifier}</b><div className={styles.muted}>{animal.farm_name}</div></td>
                      <td>{animal.species_name}{animal.category && <div className={styles.muted}>{animal.category}</div>}</td>
                      <td>{animal.reproductive_status || "—"}</td>
                      <td>{animal.last_vaccine ? <>{animal.last_vaccine.name}<div className={styles.muted}>{fmt.fd(animal.last_vaccine.date)}</div></> : "—"}</td>
                      <td>{animal.last_health ? <>{animal.last_health.type}<div className={styles.muted}>{fmt.fd(animal.last_health.date)}</div></> : "—"}</td>
                      <td>{animal.expected_birth ? fmt.fd(animal.expected_birth) : "—"}</td>
                      <td>
                        <button type="button" className="btn btn-sm btn-outline-secondary" aria-expanded={open === animal.id}
                          onClick={() => setOpen(open === animal.id ? "" : animal.id)}>
                          {open === animal.id ? t("vet.herd.hide") : t("vet.herd.history")}
                        </button>
                      </td>
                    </tr>
                    {open === animal.id && <tr className={styles.subRow}><td colSpan={7}><HerdHistory ctx={ctx} animalId={animal.id} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.muted}>{t("vet.herd.empty")}</p>}

        {pages > 1 && (
          <div className="d-flex align-items-center justify-content-end gap-2 mt-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("vet.herd.previous")}</button>
            <span className={styles.muted}>{t("vet.herd.page", { page, pages })}</span>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("vet.herd.next")}</button>
          </div>
        )}
      </section>}
    </>
  );
}

function HerdHistory({ ctx, animalId }: { ctx: VetContext; animalId: string }) {
  const { t, fmt } = ctx;
  const [history, setHistory] = useState<VetHerdHistory | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    veterinaryService.herdAnimal(animalId, controller.signal)
      .then(setHistory)
      .catch(err => { if (!controller.signal.aborted) setError(vetError(err, t("vet.herd.error"))); });
    return () => controller.abort();
  }, [animalId, t]);

  if (error) return <p className={styles.danger}>{error}</p>;
  if (!history) return <p className={styles.muted}>{t("vet.loading")}</p>;
  if (!history.events.length) return <p className={styles.muted}>{t("vet.herd.noHistory")}</p>;

  const detail = (event: VetHerdHistory["events"][number]) => {
    if (event.kind === "birth") return t("vet.herd.births", { value: event.detail });
    if (event.kind === "vaccination" && event.detail) return t("vet.herd.nextDose", { date: fmt.fd(event.detail) });
    if (event.kind === "pregnancy" && event.detail) return t("vet.herd.expected", { date: fmt.fd(event.detail) });
    if (event.kind === "heat" && event.status === "predicted") return t("vet.herd.predicted");
    return event.detail;
  };

  return (
    <ul className="list-unstyled mb-0 d-grid gap-2">
      {history.events.map((event, index) => (
        <li key={`${event.kind}-${event.date}-${index}`} className="d-flex gap-2 align-items-start">
          <HeartPulse size={16} aria-hidden="true" className="flex-shrink-0 mt-1" style={{ color: "var(--primary)" }} />
          <span>
            <b>{t(`vet.herd.kind.${event.kind}` as TranslationKey)}</b>
            {event.title && ` · ${event.title}`}
            <span className={styles.muted}> · {fmt.fd(event.date)}</span>
            {detail(event) && <div className={styles.muted}>{detail(event)}</div>}
          </span>
        </li>
      ))}
    </ul>
  );
}
