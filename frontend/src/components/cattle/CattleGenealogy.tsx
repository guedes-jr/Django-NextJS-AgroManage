"use client";
import { useEffect, useState } from "react";
import { cattleService, cattleError, type CattleGenealogy as Genealogy } from "@/services/cattleService";
import styles from "./cattle.module.css";

export function CattleGenealogy({ id }: { id: string }) {
  const [data, setData] = useState<Genealogy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    cattleService.genealogy(id, controller.signal).then(data => { if (!controller.signal.aborted) setData(data); })
      .catch(error => { if (!controller.signal.aborted) setError(cattleError(error)); });
    return () => controller.abort();
  }, [id]);
  return <section className="my-3"><h3 className="h6 fw-bold">Ascendência identificada</h3>
    {error ? <p className="text-danger" role="alert">{error}</p> : !data ? <p role="status">Carregando filiação…</p> : <>
      <p className="small text-muted">{data.notice}</p>
      {data.ancestors.filter(row => row.level > 0).map((row, index) => <div className={styles.event} key={`${row.id}-${index}`}><small>{row.relation}</small><strong>{row.identifier}</strong>{row.repeated && <span className="small text-warning">Vínculo repetido; consulte a origem do cadastro.</span>}</div>)}
      {data.ancestors.length === 1 && <p className="small text-muted">Sem ascendentes vinculados por identificação.</p>}
      <h3 className="h6 fw-bold mt-3">Descendentes identificados ({data.children_count})</h3>
      {data.children.map(row => <p className="small mb-1" key={row.id}><strong>{row.identifier}</strong> · nascimento {row.birth_date ? new Date(`${row.birth_date}T12:00:00`).toLocaleDateString("pt-BR") : "não informado"} · {row.current_weight_kg ? `${row.current_weight_kg} kg` : "peso não informado"}</p>)}
      {data.children_count > data.children.length && <p className="small text-muted">Exibindo os primeiros 50 descendentes.</p>}
    </>}
  </section>;
}
