"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, Heart, PawPrint } from "lucide-react";
import { veterinaryService, vetError, type VetAnimal, type VetConduct, type VetCycling, type VetMethod, type VetProcedure, type VetQuickPayload, type VetResult } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import { StatusPill, VetKpis, type VetContext } from "./VeterinaryArea";
import { CyclingInfo, ProtocolInfo, protocolAlertsText, savedMessage } from "./VetLaunch";
import { AnimalRecords } from "./VetRecords";
import {
  CATEGORIES, METHODS, OPEN_CONDUCTS, STATUSES, addDays, categoryLabel, conductLabel, gestationNow, kindLabel, lastShort,
  methodLabel, naturalCompare, nextKey, nextLabel, norm, procedureText, statusLabel,
} from "./vetText";

type QuickKind = "protocol_insemination" | "protocol_step" | "ultrasound" | "pregnant" | "general";

export function quickKind(animal: VetAnimal): QuickKind {
  if (animal.status === "protocol") return animal.next.code === "alert_inseminate" || animal.next.code === "inseminate_iatf" ? "protocol_insemination" : "protocol_step";
  if (animal.status === "inseminated") return "ultrasound";
  if (animal.status === "pregnant") return "pregnant";
  return "general";
}

export function VetAnimals({ ctx }: { ctx: VetContext }) {
  const { t, fmt, animals, clients, today, language } = ctx;
  const client = ctx.focusClient && clients.some(c => c.id === ctx.focusClient) ? ctx.focusClient : clients[0]?.id || "";
  const [query, setQuery] = useState("");
  const [procedure, setProcedure] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [day, setDay] = useState("");
  const [open, setOpen] = useState("");
  const [quick, setQuick] = useState("");

  const farmAnimals = useMemo(() => animals.filter(a => a.client === client), [animals, client]);
  const procedures = useMemo(() => {
    const seen = new Map<string, string>();
    farmAnimals.forEach(a => seen.set(nextKey(a.next), nextLabel(t, a.next)));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], language));
  }, [farmAnimals, t, language]);

  const dayChips = useMemo(() => {
    const counts = new Map<string, number>();
    let late = 0;
    farmAnimals.forEach(a => {
      const d = a.next.date;
      if (!d) return;
      if (d < today) { late += 1; return; }
      counts.set(d, (counts.get(d) || 0) + 1);
    });
    return { late, days: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 6) };
  }, [farmAnimals, today]);

  const list = farmAnimals.filter(a => {
    if (category && a.category !== category) return false;
    if (status && a.status !== status) return false;
    if (procedure && nextKey(a.next) !== procedure) return false;
    if (day === "late" && !(a.next.date && a.next.date < today)) return false;
    if (day && day !== "late" && a.next.date !== day) return false;
    if (query && !norm(`${a.identifier} ${a.name}`).includes(norm(query))) return false;
    return true;
  });
  const filtered = !!(query || procedure || status || category || day);

  if (!animals.length) {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>{t("vet.animals.empty")}</p>
        <button type="button" className="btn btn-agro mt-2" onClick={() => ctx.go("at")}>{t("vet.animals.newVisit")}</button>
      </div>
    );
  }

  const current = clients.find(c => c.id === client);
  return (
    <>
      <VetKpis items={[
        { label: t("vet.tab.animals"), value: farmAnimals.length, icon: PawPrint },
        { label: t("vet.alerts.pregnant"), value: farmAnimals.filter(a => a.status === "pregnant").length, icon: Heart },
        { label: t("vet.status.protocol"), value: farmAnimals.filter(a => a.status === "protocol").length, icon: Clock, tone: "warning" },
        { label: t("vet.late"), value: farmAnimals.filter(a => a.deadline === "late").length, icon: AlertTriangle, tone: "danger" },
      ]} />
      <section className={styles.panel}>
        <label className={styles.field}>
          <span>{t("vet.animals.farm")}</span>
          <select className="form-select" value={client} onChange={e => { setProcedure(""); setDay(""); setOpen(""); setQuick(""); ctx.setFocusClient(e.target.value); }}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.farm_name ? ` · ${c.farm_name}` : ""}</option>)}
          </select>
        </label>
        <p className={styles.muted} style={{ marginTop: 6 }}>{current ? `${current.name}${current.farm_name ? ` · ${current.farm_name}` : ""}` : t("vet.animals.subtitleAll")}</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>{t("vet.animals.filter")}</h2>
          {filtered && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setQuery(""); setProcedure(""); setStatus(""); setCategory(""); setDay(""); }}>{t("vet.animals.clear")}</button>}
        </div>
        <input type="search" className="form-control mb-2" placeholder={t("vet.animals.search")} value={query} onChange={e => setQuery(e.target.value)} />
        <div className={styles.filters}>
          <select className="form-select" style={{ flex: "1 1 160px" }} value={procedure} onChange={e => setProcedure(e.target.value)} aria-label={t("vet.alerts.nextProcedure")}>
            <option value="">{t("vet.animals.allProcedures")}</option>
            {procedures.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select className="form-select" style={{ flex: "1 1 140px" }} value={status} onChange={e => setStatus(e.target.value)} aria-label={t("vet.alerts.situation")}>
            <option value="">{t("vet.animals.allSituations")}</option>
            {STATUSES.map(s => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
          </select>
          <select className="form-select" style={{ flex: "1 1 140px" }} value={category} onChange={e => setCategory(e.target.value)} aria-label={t("vet.report.category")}>
            <option value="">{t("vet.animals.allCategories")}</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
          </select>
        </div>
        <p className={styles.muted} style={{ marginTop: 6 }}>{t("vet.animals.filterHint")}</p>
        <div style={{ marginTop: 10 }}>
          <p className={styles.muted} style={{ marginBottom: 4 }}><b>{t("vet.animals.dayTitle")}</b> · {t("vet.animals.dayHint")}</p>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <input type="date" className="form-control" style={{ maxWidth: 170 }} value={day && day !== "late" ? day : ""} onChange={e => { setDay(e.target.value); setOpen(""); }} aria-label={t("vet.animals.dayTitle")} />
            <div className={styles.chips}>
              <button type="button" className={`${styles.chip} ${!day ? styles.chipOn : ""}`} onClick={() => setDay("")}>{t("vet.all")}</button>
              {dayChips.late > 0 && <button type="button" className={`${styles.chip} ${day === "late" ? styles.chipOn : ""}`} onClick={() => setDay("late")}>{t("vet.animals.lateCount", { count: dayChips.late })}</button>}
              {dayChips.days.map(([d, n]) => <button key={d} type="button" className={`${styles.chip} ${day === d ? styles.chipOn : ""}`} onClick={() => setDay(d)}>{d === today ? t("vet.today") : fmt.fd5(d)} ({n})</button>)}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><h2>{t("vet.tab.animals")}</h2></div>
        <p className={styles.muted} style={{ marginBottom: 8 }}>{t("vet.animals.count", { count: list.length, total: farmAnimals.length })}</p>
        {quick && farmAnimals.some(a => a.id === quick) && (
          <QuickPanel ctx={ctx} animal={farmAnimals.find(a => a.id === quick)!} onClose={() => setQuick("")} />
        )}
        {list.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table} style={{ minWidth: 760 }}>
              <thead><tr>
                <th>{t("vet.animals.identifier")}</th><th>{t("vet.report.category")}</th><th>{t("vet.alerts.situation")}</th>
                <th>{t("vet.launch.lastProcedure")}</th><th>{t("vet.launch.nextProcedure")}</th><th>{t("vet.animals.visits")}</th><th />
              </tr></thead>
              <tbody>
                {[...list].sort((a, b) => naturalCompare(a.identifier, b.identifier, language)).map(animal => {
                  const lateNext = !!animal.next.date && animal.next.date < today;
                  const todayNext = animal.next.date === today;
                  return (
                    <Fragment key={animal.id}>
                      <tr>
                        <td><b>{animal.identifier}</b>{animal.name && <div className={styles.muted}>{animal.name}</div>}</td>
                        <td>
                          <select className="form-select form-select-sm" value={animal.category} aria-label={t("vet.report.category")} onChange={e => void veterinaryService.setCategory(animal.id, e.target.value as typeof animal.category).then(ctx.reload)}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
                          </select>
                        </td>
                        <td><StatusPill tone={animal.status_tone}>{statusLabel(t, animal.status)}</StatusPill></td>
                        <td>{lastShort(t, fmt, animal.last)}</td>
                        <td>
                          <b style={{ fontWeight: 600 }}>{nextLabel(t, animal.next)}</b>
                          {animal.next.date && <div className={`${styles.muted} ${lateNext ? styles.danger : todayNext ? styles.warn : ""}`}>{fmt.fd5(animal.next.date)}{lateNext ? ` · ${t("vet.lateSuffix")}` : todayNext ? ` · ${t("vet.todaySuffix")}` : ""}</div>}
                        </td>
                        <td>{animal.procedures_count}</td>
                        <td>
                          <div className={styles.actions}>
                            <button type="button" className="btn btn-sm btn-outline-secondary" aria-expanded={open === animal.id} onClick={() => setOpen(open === animal.id ? "" : animal.id)}>{t("vet.animals.history")}</button>
                            <button type="button" className="btn btn-sm btn-agro" onClick={() => { setOpen(""); setQuick(quick === animal.id ? "" : animal.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("vet.animals.launch")}</button>
                          </div>
                        </td>
                      </tr>
                      {open === animal.id && <tr className={styles.subRow}><td colSpan={7}><History ctx={ctx} animal={animal} /></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.muted}>{t("vet.animals.none")}</p>}
      </section>
    </>
  );
}

/** Procedures of one animal (prototype vFicha). */
function History({ ctx, animal }: { ctx: VetContext; animal: VetAnimal }) {
  const { t, fmt, today } = ctx;
  const animalId = animal.id;
  const [items, setItems] = useState<VetProcedure[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    veterinaryService.history(animalId, controller.signal).then(setItems).catch(() => setItems([]));
    return () => controller.abort();
  }, [animalId]);
  if (!items) return <span className={styles.muted}>{t("vet.loading")}</span>;
  return (
    <div>
      {!items.length && <span className={styles.muted}>{t("vet.history.empty")}</span>}
      {items.map(p => {
        const lines: string[] = [];
        if (p.result === "pregnant" && (p.gestation_days || p.coverage_date)) {
          lines.push(t("vet.history.gestation", { days: gestationNow(p, today), date: fmt.fd(p.calving_date || addDays(p.date, 283 - (p.gestation_days || 0))) }));
        }
        if (p.semen) lines.push(t("vet.history.semen", { value: p.semen }));
        return (
          <div key={p.id} className={styles.rowItem}>
            <div>
              <b style={{ fontWeight: 600 }}>{fmt.fd(p.date)} · {kindLabel(t, p.kind)}</b>{" "}
              {p.result && <StatusPill tone={p.result === "pregnant" ? "success" : "danger"}>{t(`vet.result.${p.result}`)}</StatusPill>}
              {p.herd_synced && <> <StatusPill tone="info">{t("vet.history.inHerd")}</StatusPill></>}
              {lines.length > 0 && <div className={styles.muted}>{lines.join(" · ")}</div>}
              {p.responsible && <div className={styles.muted}>{t("vet.history.responsible", { value: p.responsible })}</div>}
              {(p.step || p.result || p.kind === "insemination") && <div className={styles.muted}>{t("vet.history.note", { value: procedureText(t, fmt, p, today) })}</div>}
              {p.notes && <div className={styles.muted}>{t("vet.history.note", { value: p.notes })}</div>}
            </div>
            <span className={styles.muted} style={{ whiteSpace: "nowrap" }}>{fmt.money(p.value)}{p.paid ? ` · ${t("vet.history.paid")}` : ""}</span>
          </div>
        );
      })}
      <AnimalRecords ctx={ctx} animal={animal} />
    </div>
  );
}

/** Inline launch from the animal list (prototype vqPanel / vqSave). */
function QuickPanel({ ctx, animal, onClose }: { ctx: VetContext; animal: VetAnimal; onClose: () => void }) {
  const { t, fmt, today } = ctx;
  const kind = quickKind(animal);
  const [date, setDate] = useState(today);
  const [done, setDone] = useState<"" | "yes" | "no">("");
  const [bull, setBull] = useState("");
  const [notes, setNotes] = useState("");
  const [reschedule, setReschedule] = useState("");
  const [result, setResult] = useState<VetResult>("");
  const [conduct, setConduct] = useState<VetConduct>("");
  const [cycling, setCycling] = useState<VetCycling>("cycling");
  const [management, setManagement] = useState<"10" | "11">("10");
  const [action, setAction] = useState<"" | "insemination" | "diagnosis" | "protocol">("");
  const [days, setDays] = useState("30");
  const [method, setMethod] = useState<VetMethod>(animal.source ? "artificial" : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const bulls = useMemo(() => [...new Set(ctx.animals.map(a => a.source?.bull || a.last?.semen || "").filter(Boolean))], [ctx.animals]);

  const chip = (on: boolean, label: string, onClick: () => void, tone = "") => (
    <button key={label} type="button" className={`${styles.chip} ${on ? styles.chipOn : ""} ${tone}`} aria-pressed={on} onClick={() => { setError(""); onClick(); }}>{label}</button>
  );
  const dateField = (label: string) => (
    <label className={styles.field} style={{ flex: "1 1 150px" }}><span>{label}</span><input type="date" className="form-control" max={today} value={date} onChange={e => setDate(e.target.value)} /></label>
  );
  const bullField = (
    <label className={styles.field} style={{ flex: "2 1 180px" }}>
      <span>{t("vet.quick.bullUsed")}</span>
      <input className="form-control" list="vet-bulls" autoComplete="off" placeholder={t("vet.quick.bullPlaceholder")} value={bull} onChange={e => setBull(e.target.value)} />
      <datalist id="vet-bulls">{bulls.map(b => <option key={b} value={b} />)}</datalist>
    </label>
  );
  const protocolFields = (
    <>
      <span className={styles.muted} style={{ display: "block", marginTop: 10 }}>{t("vet.launch.animalSituation")}</span>
      <div className={styles.chips} style={{ marginTop: 4 }}>{chip(cycling === "cycling", t("vet.cycling.cycling"), () => setCycling("cycling"))}{chip(cycling === "not_cycling", t("vet.cycling.not_cycling"), () => setCycling("not_cycling"))}</div>
      <CyclingInfo t={t} cycling={cycling} />
      <span className={styles.muted} style={{ display: "block", marginTop: 10 }}>{t("vet.launch.management")}</span>
      <div className={styles.chips} style={{ marginTop: 4 }}>{chip(management === "10", t("vet.days", { count: 10 }), () => setManagement("10"))}{chip(management === "11", t("vet.days", { count: 11 }), () => setManagement("11"))}</div>
      <ProtocolInfo t={t} management={Number(management)} />
      <p className={styles.muted} style={{ marginTop: 8 }}>{t("vet.quick.alertsFrom", { date: fmt.fd5(date), list: protocolAlertsText(t, fmt, Number(management), date) })}</p>
    </>
  );
  const conducts = (
    <>
      <span className={styles.muted} style={{ display: "block", marginTop: 10 }}>{t("vet.launch.conduct")}</span>
      <div className={styles.chips} style={{ marginTop: 4 }}>{OPEN_CONDUCTS.map(c => chip(conduct === c, conductLabel(t, c), () => setConduct(c)))}</div>
      {conduct === "iatf_protocol" && protocolFields}
    </>
  );
  const methods = (
    <>
      <span className={styles.muted} style={{ display: "block", marginTop: 10 }}>{t("vet.launch.method")}</span>
      <div className={styles.chips} style={{ marginTop: 4 }}>{METHODS.map(m => chip(method === m, methodLabel(t, m), () => setMethod(m)))}</div>
    </>
  );

  const save = async () => {
    const payload: VetQuickPayload = { date, notes };
    if (kind === "protocol_insemination" || kind === "protocol_step") Object.assign(payload, { step_done: done, bull, reschedule_to: reschedule || null });
    else if (kind === "ultrasound") Object.assign(payload, { diagnosis: result, conduct, cycling, management_days: Number(management), coverage_method: method });
    else Object.assign(payload, { action, bull, diagnosis: result, conduct, cycling, management_days: Number(management), gestation_days: parseInt(days, 10) || null, coverage_method: method });
    setSaving(true);
    try {
      const saved = await veterinaryService.quick(animal.id, payload);
      const message = saved.branch === "diagnosis" && kind !== "general" ? t("vet.msg.diagnosis", { animal: animal.identifier })
        : saved.branch === "diagnosis" && action === "diagnosis" ? t("vet.msg.diagnosis", { animal: animal.identifier }) : savedMessage(t, fmt, saved);
      ctx.notify(message);
      onClose();
      await ctx.reload();
    } catch (err) {
      setError(vetError(err, t("vet.saveError")));
    } finally {
      setSaving(false);
    }
  };

  const source = animal.source;
  return (
    <div className={styles.quick} id="vet-quick">
      <div className="d-flex justify-content-between gap-2 align-items-start">
        <div>
          <b>{t("vet.quick.title", { animal: `${animal.identifier}${animal.name ? ` · ${animal.name}` : ""}` })}</b>
          <div className={styles.muted}>{t("vet.quick.next", { step: nextLabel(t, animal.next) })}{animal.next.date ? ` · ${fmt.fd5(animal.next.date)}` : ""}</div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>{t("vet.close")}</button>
      </div>

      {(kind === "protocol_insemination" || kind === "protocol_step") && (
        <>
          <p className={styles.muted} style={{ margin: "10px 0 6px" }}>{kind === "protocol_insemination" ? t("vet.quick.inseminationDone") : t("vet.quick.stepDone", { step: nextLabel(t, animal.next) })}</p>
          <div className={styles.chips}>{chip(done === "yes", t("vet.launch.done"), () => setDone("yes"))}{chip(done === "no", t("vet.launch.notDone"), () => setDone("no"), styles.chipWarn)}</div>
          {done === "yes" && <div className={styles.filters} style={{ marginTop: 10 }}>{dateField(kind === "protocol_insemination" ? t("vet.launch.inseminationDate") : t("vet.launch.doneDate"))}{kind === "protocol_insemination" && bullField}</div>}
          {done === "no" && (
            <div className={styles.filters} style={{ marginTop: 10 }}>
              {kind === "protocol_step" && <label className={styles.field} style={{ flex: "1 1 150px" }}><span>{t("vet.quick.reschedule")}</span><input type="date" className="form-control" min={today} value={reschedule} onChange={e => setReschedule(e.target.value)} /></label>}
              <label className={styles.field} style={{ flex: "2 1 180px" }}><span>{t("vet.quick.reason")}</span><input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} /></label>
            </div>
          )}
        </>
      )}

      {kind === "ultrasound" && (
        <>
          <p className={styles.muted} style={{ margin: "10px 0 6px" }}>
            {t("vet.quick.ultrasoundResult")}
            {source && source.insemination_date <= today ? t("vet.quick.inseminatedWith", { date: fmt.fd5(source.insemination_date) }) + (source.bull ? t("vet.quick.with", { bull: source.bull }) : "") : ""}
          </p>
          <div className={styles.chips}>{chip(result === "pregnant", t("vet.result.pregnant"), () => setResult("pregnant"))}{chip(result === "open", t("vet.result.open"), () => setResult("open"), styles.chipDanger)}</div>
          <div className={styles.filters} style={{ marginTop: 10 }}>{dateField(t("vet.quick.ultrasoundDate"))}</div>
          {result === "open" && conducts}
          {result === "pregnant" && methods}
        </>
      )}

      {kind === "pregnant" && (
        <>
          <p className={styles.muted} style={{ margin: "10px 0" }}>{t("vet.quick.pregnant", { date: animal.next.date ? t("vet.quick.pregnantDate", { date: fmt.fd(animal.next.date) }) : "" })}</p>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => ctx.go("at", { preset: { client: animal.client, animal: animal.identifier } })}>{t("vet.quick.otherVisit")}</button>
        </>
      )}

      {kind === "general" && (
        <>
          <p className={styles.muted} style={{ margin: "10px 0 6px" }}>{t("vet.quick.whatDone")}</p>
          <div className={styles.chips}>
            {chip(action === "insemination", t("vet.kind.insemination"), () => setAction("insemination"))}
            {chip(action === "diagnosis", t("vet.quick.diagnosis"), () => setAction("diagnosis"))}
            {chip(action === "protocol", t("vet.conduct.iatf_protocol"), () => setAction("protocol"))}
          </div>
          {action === "insemination" && <div className={styles.filters} style={{ marginTop: 10 }}>{dateField(t("vet.launch.inseminationDate"))}{bullField}</div>}
          {action === "protocol" && <><div className={styles.filters} style={{ marginTop: 10 }}>{dateField(t("vet.launch.protocolStart"))}</div>{protocolFields}</>}
          {action === "diagnosis" && (
            <>
              <p className={styles.muted} style={{ margin: "10px 0 6px" }}>{t("vet.quick.result")}</p>
              <div className={styles.chips}>{chip(result === "pregnant", t("vet.result.pregnant"), () => setResult("pregnant"))}{chip(result === "open", t("vet.result.open"), () => setResult("open"), styles.chipDanger)}</div>
              <div className={styles.filters} style={{ marginTop: 10 }}>
                {dateField(t("vet.launch.date"))}
                {result === "pregnant" && <label className={styles.field} style={{ flex: "1 1 130px" }}><span>{t("vet.quick.gestationDays")}</span><input className="form-control" inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} /></label>}
              </div>
              {result === "open" && conducts}
              {result === "pregnant" && methods}
            </>
          )}
        </>
      )}

      {kind !== "pregnant" && (
        <>
          {error && <div role="alert" className="alert alert-danger py-2 mt-3 mb-0">{error}</div>}
          <button type="button" className="btn btn-agro mt-3" disabled={saving} onClick={() => void save()}>{t("vet.quick.save")}</button>
        </>
      )}
    </div>
  );
}
