"use client";

import { useEffect, useState } from "react";
import { PackageMinus, Plus, Trash2 } from "lucide-react";
import { veterinaryService, type VetInputLot, type VetInputRow } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import type { VetContext } from "./VeterinaryArea";

/** Stock used in the procedure: each row is a lot and the quantity that leaves it on save. */
export function VetInputs({ ctx, rows, onChange }: { ctx: VetContext; rows: VetInputRow[]; onChange: (rows: VetInputRow[]) => void }) {
  const { t, fmt } = ctx;
  const [lots, setLots] = useState<VetInputLot[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    veterinaryService.inputLots(controller.signal).then(setLots).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);

  const update = (index: number, patch: Partial<VetInputRow>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const total = rows.reduce((sum, row) => {
    const lot = lots?.find(l => l.id === row.lot);
    return sum + (lot?.unit_cost ? Number(lot.unit_cost) * (Number(row.quantity.replace(",", ".")) || 0) : 0);
  }, 0);

  return (
    <div className={styles.inputs}>
      <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <span className={styles.label}><PackageMinus size={14} aria-hidden="true" /> {t("vet.inputs.title")}</span>
        {lots && lots.length > 0 && (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onChange([...rows, { lot: "", quantity: "" }])}>
            <Plus size={14} aria-hidden="true" /> {t("vet.inputs.add")}
          </button>
        )}
      </div>
      {error && <p className={styles.danger}>{t("vet.inputs.error")}</p>}
      {lots && !lots.length && <p className={styles.hint}>{t("vet.inputs.none")}</p>}
      {rows.map((row, index) => {
        const lot = lots?.find(l => l.id === row.lot);
        const quantity = Number(row.quantity.replace(",", ".")) || 0;
        const over = !!lot && quantity > Number(lot.balance);
        return (
          <div key={index} className={styles.inputRow}>
            <select className="form-select" aria-label={t("vet.inputs.lot")} value={row.lot} onChange={e => update(index, { lot: e.target.value })}>
              <option value="">{t("vet.select")}</option>
              {(lots || []).map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}{l.lot ? ` · ${t("vet.inputs.lotNumber", { lot: l.lot })}` : ""} · {t("vet.inputs.balance", { value: fmt.num(Number(l.balance)), unit: l.unit })}
                </option>
              ))}
            </select>
            <input className="form-control" inputMode="decimal" aria-label={t("vet.inputs.quantity")} placeholder={lot ? lot.unit : t("vet.inputs.quantity")}
              value={row.quantity} onChange={e => update(index, { quantity: e.target.value })} />
            <button type="button" className="btn btn-sm btn-outline-danger" aria-label={t("vet.inputs.remove")} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
              <Trash2 size={14} aria-hidden="true" />
            </button>
            {over && <p className={styles.danger} style={{ gridColumn: "1 / -1", margin: 0 }}>{t("vet.inputs.over")}</p>}
          </div>
        );
      })}
      {rows.length > 0 && total > 0 && <p className={styles.hint}>{t("vet.inputs.cost", { value: fmt.money(total) })}</p>}
    </div>
  );
}
