"use client";

import { useState } from "react";
import { ClipboardCheck, PawPrint, Plus, Trash2, Users } from "lucide-react";
import { veterinaryService, vetError } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import { VetKpis, type VetContext } from "./VeterinaryArea";

export function VetClients({ ctx }: { ctx: VetContext }) {
  const { t, fmt, clients, animals, workspace } = ctx;
  const [name, setName] = useState("");
  const [farm, setFarm] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [wipeArmed, setWipeArmed] = useState(false);
  const procedures = clients.reduce((sum, c) => sum + c.procedures, 0);

  const create = async () => {
    if (!name.trim()) return setError(t("vet.clients.nameRequired"));
    setSaving(true);
    try {
      const created = await veterinaryService.createClient({ name: name.trim(), farm_name: farm.trim(), phone: phone.trim() });
      ctx.notify(t("vet.clients.created", { name: created.name }));
      setName(""); setFarm(""); setPhone(""); setError("");
      await ctx.reload();
    } catch (err) {
      setError(vetError(err, t("vet.saveError")));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await veterinaryService.deleteClient(id);
      await ctx.reload();
    } catch (err) {
      setError(vetError(err, t("vet.saveError")));
    }
  };

  const wipe = async () => {
    if (!wipeArmed) return setWipeArmed(true);
    try {
      const counts = await veterinaryService.wipe();
      ctx.notify(t("vet.clients.wiped", { clients: counts.clients, animals: counts.animals }));
      setWipeArmed(false);
      await ctx.reload();
    } catch (err) {
      setError(vetError(err, t("vet.saveError")));
    }
  };

  return (
    <>
      <VetKpis items={[
        { label: t("vet.tab.clients"), value: clients.length, icon: Users },
        { label: t("vet.tab.animals"), value: animals.length, icon: PawPrint },
        { label: t("vet.clients.visits"), value: procedures, icon: ClipboardCheck, tone: "info" },
      ]} />
      <section className={styles.panel}>
        <div className={styles.panelHead}><h2>{t("vet.clients.new")}</h2></div>
        <div className={styles.grid}>
          <label className={styles.field}><span>{t("vet.clients.name")}</span><input className="form-control" placeholder={t("vet.clients.namePlaceholder")} value={name} onChange={e => setName(e.target.value)} /></label>
          <label className={styles.field}><span>{t("vet.clients.farm")}</span><input className="form-control" value={farm} onChange={e => setFarm(e.target.value)} /></label>
          <label className={styles.field}><span>{t("vet.clients.phone")}</span><input className="form-control" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label>
        </div>
        {error && <div role="alert" className="alert alert-danger py-2 mt-3 mb-0">{error}</div>}
        <button type="button" className="btn btn-agro mt-3" disabled={saving} onClick={() => void create()}><Plus size={16} aria-hidden="true" /> {t("vet.clients.create")}</button>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><h2>{t("vet.clients.mine", { count: clients.length })}</h2></div>
        {clients.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table} style={{ minWidth: 620 }}>
              <thead><tr>
                <th>{t("vet.clients.client")}</th><th>{t("vet.clients.farm")}</th><th>{t("vet.tab.animals")}</th>
                <th>{t("vet.clients.monthVisits")}</th><th>{t("vet.clients.receivable")}</th><th />
              </tr></thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b>{c.phone && <div className={styles.muted}>{c.phone}</div>}</td>
                    <td>{c.farm_name || "—"}</td>
                    <td>{c.animals}</td>
                    <td>{c.month_procedures}</td>
                    <td>{fmt.money(c.receivable)}</td>
                    <td>
                      <div className={styles.actions}>
                        <button type="button" className="btn btn-sm btn-agro" onClick={() => ctx.go("at", { preset: { client: c.id } })}>{t("vet.animals.launch")}</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => ctx.go("co", { client: c.id })}>{t("vet.tab.billing")}</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" title={t("vet.clients.delete")} aria-label={`${t("vet.clients.delete")} ${c.name}`} onClick={() => void remove(c.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.muted}>{t("vet.clients.empty")}</p>}
      </section>

      {workspace.can_wipe && (
        <div style={{ marginTop: 24, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <button type="button" className={`btn w-100 ${wipeArmed ? "btn-danger" : "btn-outline-danger"}`} onClick={() => void wipe()} onBlur={() => setWipeArmed(false)}>
            {wipeArmed ? t("vet.clients.wipeConfirm") : t("vet.clients.wipe")}
          </button>
          <p className={styles.muted} style={{ marginTop: 6 }}>{t("vet.clients.wipeHint")}</p>
        </div>
      )}
    </>
  );
}
