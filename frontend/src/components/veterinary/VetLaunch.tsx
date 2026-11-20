"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, NotebookPen, Save } from "lucide-react";
import {
  veterinaryService, vetError, type VetConduct, type VetCycling, type VetDiscardReason, type VetLookup,
  type VetMethod, type VetRegisterPayload, type VetRegisterResult, type VetResult,
} from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import { StatusPill, type LaunchPreset, type VetContext } from "./VeterinaryArea";
import {
  CATEGORIES, DISCARD_REASONS, GESTATION_DAYS, METHODS, OPEN_CONDUCTS, addDays, categoryLabel, conductLabel,
  deadlineMark, diffDays, discardLabel, lastShort, methodLabel, nextLabel, procedureText, protocolOrigin, resultLabel, statusLabel,
  type Translate,
} from "./vetText";

interface Form {
  client: string; newClient: string; date: string; responsible: string; animal: string;
  category: string; categoryTouched: boolean; diagnosis: VetResult; conduct: VetConduct; cycling: VetCycling;
  management: "10" | "11"; protocolStart: string; days: string; discard: VetDiscardReason;
  coverage: string; gestation: string; calving: string; bull: string; method: VetMethod; confirm: boolean; edit: boolean;
  stepDone: "" | "yes" | "no"; stepDate: string; stepBull: string; notes: string;
}

const NEW = "__new";

function blank(client: string, date: string, responsible: string): Form {
  return {
    client, newClient: "", date, responsible, animal: "", category: "", categoryTouched: false, diagnosis: "", conduct: "",
    cycling: "cycling", management: "10", protocolStart: "", days: "", discard: "", coverage: "", gestation: "", calving: "",
    bull: "", method: "", confirm: false, edit: false, stepDone: "", stepDate: "", stepBull: "", notes: "",
  };
}

export function protocolAlertsText(t: Translate, fmt: { fd5: (d?: string | null) => string }, management: number, start: string) {
  const removal = management - 2;
  return [
    `${fmt.fd5(addDays(start, removal))} · ${t("vet.next.alert_removal", { day: removal })}`,
    `${fmt.fd5(addDays(start, management))} · ${t("vet.next.alert_inseminate", { day: management })}`,
  ].join(" | ");
}

export function ProtocolInfo({ t, management }: { t: Translate; management: number }) {
  return (
    <div className={styles.box}>
      <b>{t("vet.launch.protocolBox", { days: management })}</b>
      <ul>
        <li><b>D0:</b> {t("vet.launch.d0")}</li>
        <li><b>D{management - 2}:</b> {t("vet.launch.dRemoval")}</li>
        <li><b>D{management}:</b> {t("vet.launch.dInseminate")}</li>
      </ul>
      <p className={styles.muted} style={{ marginTop: 6 }}>{t("vet.launch.prescription")}</p>
    </div>
  );
}

export function CyclingInfo({ t, cycling }: { t: Translate; cycling: VetCycling }) {
  return (
    <div className={styles.box}>
      <b>{t(cycling === "not_cycling" ? "vet.cycling.not_cycling" : "vet.cycling.cycling")}</b>
      <p className={styles.muted} style={{ marginTop: 6 }}>{t(cycling === "not_cycling" ? "vet.launch.notCyclingHint" : "vet.launch.cyclingHint")}</p>
    </div>
  );
}

/** Success text for every save branch (prototype VET.msg). */
export function savedMessage(t: Translate, fmt: { fd: (d?: string | null) => string }, result: VetRegisterResult) {
  const animal = result.animal.identifier;
  const p = result.procedure;
  if (result.branch === "protocol_step") {
    const step = t("vet.removalStep", { day: p.step_day ?? 8 });
    return p.not_done ? t("vet.msg.stepNotDone", { step, animal }) : t("vet.msg.stepDone", { step, animal, date: fmt.fd(p.date) });
  }
  if (result.branch === "iatf_insemination") {
    return p.kind === "insemination" ? t("vet.msg.iatfDone", { animal, date: fmt.fd(p.date), next: fmt.fd(result.alerts[0]?.date) }) : t("vet.msg.iatfNotDone", { animal });
  }
  if (result.branch === "insemination") return t("vet.msg.insemination", { animal, date: fmt.fd(p.date), next: fmt.fd(result.alerts[0]?.date) });
  const outcome = p.result === "pregnant" ? resultLabel(t, "pregnant").toLowerCase() : `${resultLabel(t, "open").toLowerCase()}${p.conduct ? `, ${conductLabel(t, p.conduct).toLowerCase()}` : ""}`;
  const base = t(result.animal_created ? "vet.msg.savedNew" : "vet.msg.saved", { animal, result: outcome });
  return base + (result.alerts.length ? t("vet.msg.alertsCreated", { count: result.alerts.length }) : "");
}

export function VetLaunch({ ctx, preset }: { ctx: VetContext; preset: LaunchPreset }) {
  const { t, fmt, clients, today, workspace } = ctx;
  const [form, setForm] = useState<Form>(() => {
    const initial = blank(preset.client || clients[0]?.id || NEW, today, workspace.settings.last_responsible);
    return { ...initial, animal: preset.animal || "" };
  });
  // A lookup is only valid for the client and animal it was made for.
  const [lookupState, setLookupState] = useState<{ key: string; data: VetLookup } | null>(null);
  const lookupKey = `${form.client}|${form.animal.trim()}`;
  const lookup = lookupState?.key === lookupKey ? lookupState.data : null;
  const setLookup = (value: null) => setLookupState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Form>) => { setError(""); setForm(f => ({ ...f, ...patch })); };

  useEffect(() => {
    const q = form.animal.trim();
    if (!q || form.client === NEW) return;
    const controller = new AbortController();
    const key = `${form.client}|${q}`;
    const timer = window.setTimeout(() => {
      veterinaryService.lookup(form.client, q, controller.signal).then(result => {
        setLookupState({ key, data: result });
        setForm(f => {
          const next = { ...f, confirm: false, edit: false, stepDone: "" as const };
          if (result.found && !f.categoryTouched && result.category) next.category = result.category;
          if (result.pending_step) next.stepDate = result.pending_step.date > today ? today : result.pending_step.date;
          if (result.status === "protocol" && result.source) {
            next.stepDate = result.source.insemination_date > today ? today : result.source.insemination_date;
            next.stepBull = result.source.bull || "";
          }
          if (result.default_coverage_method && !f.method) next.method = result.default_coverage_method;
          return next;
        });
      }).catch(() => undefined);
    }, 400);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [form.animal, form.client, today]);

  const found = !!lookup?.found;
  const hasHistory = found && (lookup?.procedures_count || 0) > 0;
  const pendingStep = found ? lookup?.pending_step : null;
  const inProtocol = found && !pendingStep && lookup?.status === "protocol";
  const source = found ? lookup?.source : null;
  const confirming = form.diagnosis === "pregnant" && !!source && !form.edit && !inProtocol;
  const management = form.management === "11" ? 11 : 10;
  const protocolStart = form.protocolStart || form.date;
  const defaultDays = form.conduct === "observe_heat" ? 21 : 10;
  const returnDays = form.days !== "" ? (parseInt(form.days, 10) || 0) : defaultDays;

  // Pregnancy values from a previous protocol/insemination are proposed until the user corrects them.
  const confirmation = useMemo(() => {
    if (!confirming || !source) return null;
    const coverage = form.coverage || source.insemination_date;
    return { coverage, gestation: String(Math.max(0, diffDays(form.date, coverage))), calving: form.calving || addDays(coverage, GESTATION_DAYS), bull: form.bull || source.bull };
  }, [confirming, source, form.coverage, form.calving, form.bull, form.date]);

  const setCoverage = (value: string) => set(value ? { coverage: value, gestation: String(Math.max(0, diffDays(form.date, value))), calving: addDays(value, GESTATION_DAYS) } : { coverage: "", gestation: "", calving: "" });
  const setGestation = (value: string) => {
    const days = parseInt(value, 10);
    if (Number.isNaN(days)) return set({ gestation: value, coverage: "", calving: "" });
    const coverage = addDays(form.date, -days);
    set({ gestation: value, coverage, calving: addDays(coverage, GESTATION_DAYS) });
  };
  const setCalving = (value: string) => {
    if (!value) return set({ calving: "", coverage: "", gestation: "" });
    const coverage = addDays(value, -GESTATION_DAYS);
    set({ calving: value, coverage, gestation: String(diffDays(form.date, coverage)) });
  };

  const save = async () => {
    if (form.client === NEW && !form.newClient.trim()) return setError(t("vet.clients.nameRequired"));
    const payload: VetRegisterPayload = {
      client: form.client === NEW ? null : form.client, new_client_name: form.client === NEW ? form.newClient.trim() : "",
      date: form.date, responsible: form.responsible, animal: form.animal.trim(), notes: form.notes,
    };
    if (pendingStep || inProtocol) {
      Object.assign(payload, { step_done: form.stepDone, step_date: form.stepDone === "yes" ? form.stepDate : null, step_bull: form.stepBull });
    } else {
      Object.assign(payload, {
        category: form.category, diagnosis: form.diagnosis, conduct: form.diagnosis === "open" ? form.conduct : "",
        cycling: form.cycling, management_days: management, protocol_start: protocolStart,
        return_days: form.conduct === "observe_heat" || form.conduct === "induction" ? returnDays : null, discard_reason: form.discard,
        coverage_method: form.diagnosis === "pregnant" ? form.method : "", confirm_pregnancy: form.confirm, edit: form.edit,
        coverage_date: confirmation?.coverage || form.coverage || null, gestation_days: form.gestation === "" ? null : parseInt(form.gestation, 10),
        calving_date: confirmation?.calving || form.calving || null, bull: confirmation?.bull ?? form.bull,
      });
    }
    setSaving(true);
    try {
      const result = await veterinaryService.register(payload);
      ctx.notify(savedMessage(t, fmt, result));
      setForm(blank(result.client.id, form.date, form.responsible));
      setLookup(null);
      await ctx.reload();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(vetError(err, t("vet.saveError")));
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean, label: string, onClick: () => void, extra = "") => (
    <button key={label} type="button" className={`${styles.chip} ${on ? styles.chipOn : ""} ${extra}`} aria-pressed={on} onClick={onClick}>{label}</button>
  );
  const stepNumber = hasHistory ? 2 : 3;

  return (
    <>
      {workspace.open_alerts > 0 && (
        <button type="button" className={styles.banner} onClick={() => ctx.go("al")}>
          <Bell size={16} aria-hidden="true" /> {t("vet.launch.alertsBanner", { count: workspace.open_alerts })}
        </button>
      )}
      <p className={styles.muted} style={{ margin: "0 0 12px" }}>{t("vet.launch.subtitle")}</p>

      <section className={styles.panel}>
        <div className={styles.panelHead}><h2><CalendarDays size={18} className={styles.ok} aria-hidden="true" /> {t("vet.launch.data")}</h2></div>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>{t("vet.launch.client")}</span>
            <select className="form-select" value={form.client} onChange={e => { setLookup(null); setForm(blank(e.target.value, form.date, form.responsible)); }}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.farm_name ? ` · ${c.farm_name}` : ""}</option>)}
              <option value={NEW}>{t("vet.launch.newClient")}</option>
            </select>
            {form.client === NEW && <input className="form-control mt-1" placeholder={t("vet.launch.clientName")} value={form.newClient} onChange={e => set({ newClient: e.target.value })} />}
          </label>
          <label className={styles.field}>
            <span>{t("vet.launch.date")}</span>
            <input type="date" className="form-control" value={form.date} onChange={e => set({ date: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>{t("vet.launch.responsible")}</span>
            <input className="form-control" placeholder={t("vet.launch.responsiblePlaceholder")} value={form.responsible} onChange={e => set({ responsible: e.target.value })} />
          </label>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><h2><span className={styles.step}>1</span>{t("vet.launch.animal")}</h2></div>
        <p className={styles.hint}>{t("vet.launch.animalHint")}</p>
        <input className="form-control form-control-lg" autoComplete="off" placeholder={t("vet.launch.animalPlaceholder")} value={form.animal} onChange={e => { setLookup(null); set({ animal: e.target.value, categoryTouched: false, diagnosis: "", conduct: "" }); }} />
        {form.animal.trim() && form.client !== NEW && (
          <div className={styles.muted} style={{ marginTop: 6 }} aria-live="polite">
            {found && lookup ? (
              <>
                <span className={styles.ok}>{t("vet.launch.known")}</span> · {categoryLabel(t, lookup.category || "")}
                {lookup.last ? ` · ${t("vet.launch.lastVisit", { date: fmt.fd5(lookup.last.date) })}${lookup.last.result ? ` (${resultLabel(t, lookup.last.result).toLowerCase()})` : ""}` : ""}
                <div style={{ marginTop: 6 }}>{t("vet.launch.situation")}: <StatusPill tone={lookup.status_tone || "neutral"}>{statusLabel(t, lookup.status || "none")}</StatusPill></div>
              </>
            ) : lookup ? t("vet.launch.newAnimal") : null}
          </div>
        )}
        {found && lookup?.last && (
          <>
            {lookup.not_inseminated_date && <div className={styles.alertBox} style={{ marginTop: 10 }}>{t("vet.launch.notInseminated", { date: fmt.fd(lookup.not_inseminated_date) })}</div>}
            <div className={styles.box}>
              <b>{t("vet.launch.asInAnimals")}</b>
              <ul>
                <li><b>{t("vet.launch.situation")}:</b> {statusLabel(t, lookup.status || "none")}</li>
                <li><b>{t("vet.launch.lastProcedure")}:</b> {lastShort(t, fmt, lookup.last)}</li>
                <li><b>{t("vet.launch.nextProcedure")}:</b> {nextLabel(t, lookup.next)} · {deadlineMark(t, fmt, lookup.next?.date || null, today)}</li>
              </ul>
            </div>
            {pendingStep ? (
              <div className={styles.box}>
                <b>{t("vet.launch.inProtocol")}</b>
                <ul>
                  <li><b>{t("vet.launch.protocol")}:</b> {source?.kind === "protocol" ? protocolOrigin(t, fmt, source) : t("vet.conduct.iatf_protocol")}</li>
                  <li><b>{t("vet.launch.nextManagement")}:</b> {t("vet.launch.plannedOn", { step: t("vet.next.alert_removal", { day: pendingStep.day ?? 8 }), date: fmt.fd(pendingStep.date) })}</li>
                </ul>
              </div>
            ) : inProtocol ? (
              <div className={styles.box}>
                <b>{t("vet.launch.inProtocol")}</b>
                <ul>
                  <li><b>{t("vet.launch.protocol")}:</b> {source?.kind === "protocol" ? protocolOrigin(t, fmt, source) : t("vet.conduct.iatf_protocol")}</li>
                  <li><b>{t("vet.launch.expectedInsemination")}:</b> {fmt.fd(source?.insemination_date)}</li>
                </ul>
              </div>
            ) : (
              <div className={styles.box}>
                <b>{t("vet.launch.alreadyDone")}</b>
                {source ? (
                  <ul>
                    <li><b>{t("vet.launch.procedure")}:</b> {source.kind === "protocol" ? protocolOrigin(t, fmt, source) : `${t("vet.launch.insemination")}${source.bull ? ` · ${source.bull}` : ""}`}</li>
                    <li>
                      <b>{source.kind === "protocol" ? t("vet.launch.expectedInsemination") : t("vet.launch.insemination")}:</b>{" "}
                      {source.kind === "protocol"
                        ? `${fmt.fd(source.insemination_date)}${source.insemination_date <= form.date ? t("vet.launch.dateArrived") : ""}`
                        : t(source.insemination_date <= form.date ? "vet.launch.doneOn" : "vet.launch.plannedFor", { date: fmt.fd(source.insemination_date) })}
                      {source.bull ? t("vet.launch.bullInfo", { bull: source.bull }) : ""}
                    </li>
                  </ul>
                ) : null}
                <p className={styles.muted} style={{ marginTop: 6 }}>
                  {source ? t("vet.launch.confirmHint") : t("vet.launch.lastVisitLine", { date: fmt.fd(lookup.last.date), result: lookup.last.result ? resultLabel(t, lookup.last.result) : t("vet.next.new"), text: procedureText(t, fmt, lookup.last, today) })}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {(pendingStep || inProtocol) ? (
        <section className={styles.panel}>
          <p style={{ fontWeight: 700, margin: "0 0 8px" }}>
            {pendingStep ? t("vet.launch.removalDone", { day: pendingStep.day ?? 8 }) : t("vet.launch.inseminationDone")}
          </p>
          <div className={styles.chips}>
            {chip(form.stepDone === "yes", t("vet.launch.done"), () => set({ stepDone: "yes" }), styles.big)}
            {chip(form.stepDone === "no", t("vet.launch.notDone"), () => set({ stepDone: "no" }), `${styles.big} ${styles.chipWarn}`)}
          </div>
          {form.stepDone === "yes" && (
            <div className={styles.grid} style={{ marginTop: 10 }}>
              <label className={styles.field}>
                <span>{pendingStep ? t("vet.launch.doneDate") : t("vet.launch.inseminationDate")}</span>
                <input type="date" className="form-control" max={today} value={form.stepDate} onChange={e => set({ stepDate: e.target.value })} />
              </label>
              {inProtocol && (
                <label className={styles.field}>
                  <span>{t("vet.launch.bullSemen")}</span>
                  <input className="form-control" value={form.stepBull} onChange={e => set({ stepBull: e.target.value })} />
                </label>
              )}
            </div>
          )}
          {form.stepDone === "yes" && <p className={styles.muted} style={{ marginTop: 6 }}>{pendingStep ? t("vet.launch.removalHint") : t("vet.launch.inseminationDoneHint")}</p>}
          {form.stepDone === "no" && <p className={styles.muted} style={{ marginTop: 8 }}>{t("vet.launch.staysInProtocol")}</p>}
        </section>
      ) : (
        <>
          {!hasHistory && (
            <section className={styles.panel}>
              <div className={styles.panelHead}><h2><span className={styles.step}>2</span>{t("vet.launch.category")}</h2></div>
              <p className={styles.hint}>{t("vet.launch.categoryHint")}</p>
              <div className={styles.chips}>{CATEGORIES.map(c => chip(form.category === c, categoryLabel(t, c), () => set({ category: c, categoryTouched: true })))}</div>
            </section>
          )}
          <section className={styles.panel}>
            <div className={styles.panelHead}><h2><span className={styles.step}>{stepNumber}</span>{t("vet.launch.diagnosis")}</h2></div>
            <p className={styles.hint}>{t("vet.launch.diagnosisHint")}</p>
            <div className={styles.chips}>
              {chip(form.diagnosis === "pregnant", t("vet.result.pregnant"), () => set({ diagnosis: "pregnant" }), styles.big)}
              {chip(form.diagnosis === "open", t("vet.result.open"), () => set({ diagnosis: "open" }), `${styles.big} ${styles.chipDanger}`)}
            </div>
          </section>

          {form.diagnosis === "open" && (
            <section className={styles.panel}>
              <div className={styles.panelHead}><h2><span className={styles.step}>{stepNumber + 1}</span>{t("vet.launch.conduct")}</h2></div>
              <div className={styles.chips}>{OPEN_CONDUCTS.map(c => chip(form.conduct === c, conductLabel(t, c), () => set({ conduct: c, days: "" })))}</div>
              {form.conduct === "iatf_protocol" && (
                <div style={{ marginTop: 12 }}>
                  <span className={styles.muted}>{t("vet.launch.animalSituation")}</span>
                  <div className={styles.chips} style={{ marginTop: 4 }}>
                    {chip(form.cycling === "cycling", t("vet.cycling.cycling"), () => set({ cycling: "cycling" }))}
                    {chip(form.cycling === "not_cycling", t("vet.cycling.not_cycling"), () => set({ cycling: "not_cycling" }))}
                  </div>
                  <CyclingInfo t={t} cycling={form.cycling} />
                  <span className={styles.muted} style={{ display: "block", marginTop: 12 }}>{t("vet.launch.management")}</span>
                  <div className={styles.chips} style={{ marginTop: 4 }}>
                    {chip(form.management === "10", t("vet.days", { count: 10 }), () => set({ management: "10" }))}
                    {chip(form.management === "11", t("vet.days", { count: 11 }), () => set({ management: "11" }))}
                  </div>
                  <ProtocolInfo t={t} management={management} />
                  <label className={styles.field} style={{ maxWidth: 220, marginTop: 12 }}>
                    <span>{t("vet.launch.protocolStart")}</span>
                    <input type="date" className="form-control" max={today} value={protocolStart} onChange={e => set({ protocolStart: e.target.value })} />
                  </label>
                  <p className={styles.muted} style={{ marginTop: 8 }}>{t("vet.launch.alertsToCreate", { list: protocolAlertsText(t, fmt, management, protocolStart) })}</p>
                </div>
              )}
              {(form.conduct === "observe_heat" || form.conduct === "induction") && (
                <div style={{ marginTop: 12 }}>
                  <label className={styles.field} style={{ maxWidth: 220 }}>
                    <span>{t(form.conduct === "observe_heat" ? "vet.launch.heatDays" : "vet.launch.returnDays")}</span>
                    <input className="form-control" inputMode="numeric" value={form.days === "" ? String(defaultDays) : form.days} onChange={e => set({ days: e.target.value })} />
                  </label>
                  <p className={styles.muted} style={{ marginTop: 8 }}>{t("vet.launch.alertOn", { date: fmt.fd5(addDays(form.date, returnDays)), title: t(form.conduct === "observe_heat" ? "vet.next.observe_heat" : "vet.next.induction_review") })}</p>
                </div>
              )}
              {form.conduct === "discard" && (
                <label className={styles.field} style={{ maxWidth: 260, marginTop: 12 }}>
                  <span>{t("vet.launch.discardReason")}</span>
                  <select className="form-select" value={form.discard} onChange={e => set({ discard: e.target.value as VetDiscardReason })}>
                    <option value="">{t("vet.select")}</option>
                    {DISCARD_REASONS.map(r => <option key={r} value={r}>{discardLabel(t, r)}</option>)}
                  </select>
                </label>
              )}
            </section>
          )}

          {form.diagnosis === "pregnant" && (
            <section className={styles.panel}>
              <div className={styles.panelHead}><h2><span className={styles.step}>{stepNumber + 1}</span>{t(confirming ? "vet.launch.confirmation" : "vet.launch.gestation")}</h2></div>
              <div className={styles.box} style={{ marginTop: 0, marginBottom: 12 }}>
                <b>{t("vet.launch.method")}</b>
                <div className={styles.chips} style={{ marginTop: 6 }}>{METHODS.map(m => chip(form.method === m, methodLabel(t, m), () => set({ method: m })))}</div>
              </div>
              {confirming && confirmation && source && lookup ? (
                <>
                  <div className={styles.box}>
                    <b>{t("vet.launch.procedureData")}</b>
                    <ul>
                      <li><b>{t("vet.launch.animal")}:</b> {lookup.identifier} · {categoryLabel(t, lookup.category || "")}</li>
                      <li><b>{t("vet.launch.procedure")}:</b> {source.kind === "protocol" ? protocolOrigin(t, fmt, source) : t("vet.launch.insemination")}</li>
                      <li><b>{t("vet.launch.inseminationOn")}:</b> {fmt.fd(confirmation.coverage)}</li>
                      <li><b>{t("vet.launch.bullSemen")}:</b> {confirmation.bull || t("vet.notInformed")}</li>
                      <li><b>{t("vet.launch.gestationAge")}:</b> {t("vet.days", { count: confirmation.gestation })}</li>
                      <li><b>{t("vet.launch.expectedCalving")}:</b> {fmt.fd(confirmation.calving)}</li>
                    </ul>
                  </div>
                  <label className={styles.check}><input type="checkbox" checked={form.confirm} onChange={e => set({ confirm: e.target.checked })} /> {t("vet.launch.confirmPregnancy")}</label>
                  <button type="button" className="btn btn-link px-0 mt-2" onClick={() => set({ edit: true, coverage: confirmation.coverage, gestation: confirmation.gestation, calving: confirmation.calving, bull: confirmation.bull })}>{t("vet.launch.fixData")}</button>
                </>
              ) : (
                <>
                  <div className={styles.grid}>
                    <label className={styles.field}><span>{t("vet.launch.coverageDate")}</span><input type="date" className="form-control" value={form.coverage} onChange={e => setCoverage(e.target.value)} /></label>
                    <label className={styles.field}><span>{t("vet.launch.gestationDays")}</span><input className="form-control" inputMode="numeric" value={form.gestation} onChange={e => setGestation(e.target.value)} /></label>
                    <label className={styles.field}><span>{t("vet.launch.bullUsed")}</span><input className="form-control" value={form.bull} onChange={e => set({ bull: e.target.value })} /></label>
                    <label className={styles.field}><span>{t("vet.launch.calving")}</span><input type="date" className="form-control" value={form.calving} onChange={e => setCalving(e.target.value)} /></label>
                  </div>
                  <p className={styles.muted} style={{ marginTop: 8 }}>{t("vet.launch.gestationHint")}</p>
                </>
              )}
            </section>
          )}
        </>
      )}

      <section className={styles.panel}>
        <label className={styles.field}>
          <span><NotebookPen size={14} aria-hidden="true" /> {t("vet.launch.notes")}</span>
          <input className="form-control" value={form.notes} onChange={e => set({ notes: e.target.value })} />
        </label>
        {error && <div role="alert" className="alert alert-danger py-2 mt-3 mb-0">{error}</div>}
        <button type="button" className={`btn btn-agro ${styles.save}`} disabled={saving} onClick={() => void save()}>
          <Save size={18} aria-hidden="true" /> {confirming ? t("vet.launch.confirmPregnancy") : t("vet.launch.save")}
        </button>
      </section>
    </>
  );
}
