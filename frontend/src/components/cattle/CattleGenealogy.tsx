"use client";
import { useEffect, useState } from "react";
import { cattleService, cattleError, type CattleGenealogy as Genealogy } from "@/services/cattleService";
import { useOrganizationLocale } from "@/lib/locale";
import styles from "./cattle.module.css";

export function CattleGenealogy({ id }: { id: string }) {
  const { language, t } = useOrganizationLocale();
  const [data, setData] = useState<Genealogy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    cattleService.genealogy(id, controller.signal).then(data => { if (!controller.signal.aborted) setData(data); })
      .catch(error => { if (!controller.signal.aborted) setError(cattleError(error, language)); });
    return () => controller.abort();
  }, [id, language]);
  const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(language);
  const number = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  return <section className="my-3"><h3 className="h6 fw-bold">{t("cattle.genealogy.identifiedAncestry")}</h3>
    {error ? <p className="text-danger" role="alert">{error}</p> : !data ? <p role="status">{t("cattle.genealogy.loading")}</p> : <>
      <p className="small text-muted">{data.notice}</p>
      {data.ancestors.filter(row => row.level > 0).map((row, index) => <div className={styles.event} key={`${row.id}-${index}`}><small>{row.relation}</small><strong>{row.identifier}</strong>{row.repeated && <span className="small text-warning">{t("cattle.genealogy.repeatedLink")}</span>}</div>)}
      {data.ancestors.length === 1 && <p className="small text-muted">{t("cattle.genealogy.noAncestors")}</p>}
      <h3 className="h6 fw-bold mt-3">{t("cattle.genealogy.identifiedDescendants", { count: data.children_count })}</h3>
      {data.children.map(row => <p className="small mb-1" key={row.id}><strong>{row.identifier}</strong> · {t("cattle.genealogy.birth")} {row.birth_date ? date(row.birth_date) : t("cattle.genealogy.notInformed")} · {row.current_weight_kg ? `${number(Number(row.current_weight_kg))} kg` : t("cattle.genealogy.weightNotInformed")}</p>)}
      {data.children_count > data.children.length && <p className="small text-muted">{t("cattle.genealogy.showingFirst", { count: 50 })}</p>}
    </>}
  </section>;
}
