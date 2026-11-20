"use client";

import { AlertTriangle, Baby, CalendarDays, CalendarRange, CircleCheck, Flame, LayoutGrid, Pill, Plus, Radar, Stethoscope, Syringe, type LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import type { VetStatus } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import type { VetContext } from "./VeterinaryArea";
import { addDays, nextKey, nextLabel, parseDay, statusLabel } from "./vetText";

const STATUS_COLOR: Record<VetStatus, string> = { pregnant: "#16a34a", inseminated: "#2563eb", protocol: "#d97706", open: "#dc2626", attended: "#94a3b8", none: "#cbd5e1" };
const STATUS_ORDER: VetStatus[] = ["pregnant", "inseminated", "protocol", "open", "attended", "none"];

function procedureIcon(code: string): ComponentType<LucideProps> {
  if (code.includes("inseminate")) return Syringe;
  if (code.includes("ultrasound")) return Radar;
  if (code.includes("calving")) return Baby;
  if (code.includes("heat")) return Flame;
  if (code.includes("removal") || code.includes("induction")) return Pill;
  if (code === "first") return Plus;
  return Stethoscope;
}

export function VetSummary({ ctx }: { ctx: VetContext }) {
  const { t, language, fmt, animals, clients, today } = ctx;
  if (!animals.length) {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>{t("vet.summary.empty")}</p>
        <button type="button" className="btn btn-agro mt-2" onClick={() => ctx.go("at")}>{t("vet.tab.launch")}</button>
      </div>
    );
  }

  const week = Array.from({ length: 7 }, (_, i) => ({ day: addDays(today, i), count: 0 }));
  const farms = clients.map(client => {
    const list = animals.filter(a => a.client === client.id);
    const farm = { client, count: list.length, late: 0, today: 0, week: 0, procedures: new Map<string, { label: string; code: string; count: number; late: number }>(), status: {} as Partial<Record<VetStatus, number>> };
    list.forEach(animal => {
      farm.status[animal.status] = (farm.status[animal.status] || 0) + 1;
      if (animal.deadline === "late" || animal.deadline === "today" || animal.deadline === "week") {
        farm[animal.deadline] += 1;
        const key = nextKey(animal.next);
        const entry = farm.procedures.get(key) || { label: nextLabel(t, animal.next), code: animal.next.code, count: 0, late: 0 };
        entry.count += 1;
        if (animal.deadline === "late") entry.late += 1;
        farm.procedures.set(key, entry);
      }
      const slot = week.find(d => d.day === animal.next.date);
      if (slot) slot.count += 1;
    });
    return farm;
  }).filter(f => f.count).sort((a, b) => (b.late - a.late) || (b.today - a.today) || ((b.late + b.today + b.week) - (a.late + a.today + a.week)));

  const late = farms.reduce((s, f) => s + f.late, 0);
  const due = farms.reduce((s, f) => s + f.today, 0);
  const soon = farms.reduce((s, f) => s + f.week, 0);
  const total = farms.reduce((s, f) => s + f.count, 0);
  const urgent = late + due;
  const urgentFarms = farms.filter(f => f.late || f.today).length;
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "vet.summary.morning" : hour < 18 ? "vet.summary.afternoon" : "vet.summary.evening");
  const dateLabel = parseDay(today).toLocaleDateString(language, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const max = Math.max(1, late, ...week.map(d => d.count));

  return (
    <>
      <section className={styles.greeting} aria-label={t("vet.tab.summary")}>
        <small>{greeting} · {dateLabel}</small>
        <h2>{urgent ? t(urgent > 1 ? "vet.summary.urgentMany" : "vet.summary.urgentOne", { count: urgent }) : t("vet.summary.nothingUrgent")}</h2>
        <p>{urgent ? t("vet.summary.inFarms", { count: urgentFarms }) : ""}{t("vet.summary.followed", { animals: total, farms: farms.length })}</p>
        <div className={styles.greetingStats}>
          <div><b>{late}</b><span><AlertTriangle size={12} aria-hidden="true" /> {t("vet.late")}</span></div>
          <div><b>{due}</b><span><CalendarDays size={12} aria-hidden="true" /> {t("vet.today")}</span></div>
          <div><b>{soon}</b><span><CalendarRange size={12} aria-hidden="true" /> {t("vet.week")}</span></div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2><CalendarRange size={18} className={styles.ok} aria-hidden="true" /> {t("vet.summary.weekAgenda")}</h2>
          <span className={styles.muted}>{t("vet.summary.perDay")}</span>
        </div>
        <div className={styles.week}>
          <div className={styles.weekDay}>
            <div className={styles.weekBar}><i style={{ background: "#dc2626", height: late ? Math.max(8, Math.round(late / max * 46)) : 3, opacity: late ? 1 : .25 }} /></div>
            <b className={late ? styles.danger : undefined}>{late}</b><small>{t("vet.summary.lateShort")}</small>
          </div>
          {week.map((d, i) => (
            <div key={d.day} className={styles.weekDay}>
              <div className={styles.weekBar}><i style={{ background: i === 0 ? "#d97706" : "#16a34a", height: d.count ? Math.max(8, Math.round(d.count / max * 46)) : 3, opacity: d.count ? 1 : .25 }} /></div>
              <b>{d.count}</b>
              <small className={i === 0 ? styles.warn : undefined}>{i === 0 ? t("vet.todaySuffix") : parseDay(d.day).toLocaleDateString(language, { weekday: "short", timeZone: "UTC" }).replace(".", "")}</small>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.sectionLabel}><LayoutGrid size={12} aria-hidden="true" /> {t("vet.summary.farms")}</div>
      {farms.map(farm => {
        const color = farm.late ? "#dc2626" : farm.today ? "#d97706" : "#16a34a";
        const tag = farm.late ? t("vet.summary.tagLate", { count: farm.late }) : farm.today ? t("vet.summary.tagToday", { count: farm.today }) : farm.week ? t("vet.summary.tagWeek", { count: farm.week }) : t("vet.summary.upToDate");
        const procedures = [...farm.procedures.values()].sort((a, b) => (b.late - a.late) || (b.count - a.count));
        const order = STATUS_ORDER.filter(s => farm.status[s]);
        return (
          <button key={farm.client.id} type="button" className={`${styles.panel} ${styles.farmCard}`} style={{ boxShadow: `inset 4px 0 0 ${color}` }} onClick={() => ctx.go("an", { client: farm.client.id })}>
            <div className={styles.farmTop}>
              <span className={styles.avatar} style={{ background: color }}>{(farm.client.name.replace(/^fazenda\s+/i, "") || "?").charAt(0).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: ".95rem" }}>{farm.client.name}</b>
                <span className={styles.muted}>{t("vet.summary.animals", { count: farm.count })}{farm.client.farm_name ? ` · ${farm.client.farm_name}` : ""}</span>
              </span>
              <span className={styles.tag} style={{ background: color }}>{tag}</span>
            </div>
            {procedures.length ? procedures.map(p => {
              const Icon = procedureIcon(p.code);
              return (
                <div key={p.label} className={styles.procLine}>
                  <Icon size={18} className={styles.ok} aria-hidden="true" />
                  <span style={{ flex: 1 }}>{p.label}</span>
                  {p.late > 0 && <span className={`${styles.muted} ${styles.danger}`}>{t("vet.summary.tagLate", { count: p.late })}</span>}
                  <b className={styles.procCount} data-late={p.late > 0}>{p.count}</b>
                </div>
              );
            }) : <div className={`${styles.procLine} ${styles.muted}`}><CircleCheck size={16} className={styles.ok} aria-hidden="true" /> {t("vet.summary.nothingPending")}</div>}
            <div className={styles.stack} aria-hidden="true">
              {order.map(s => <div key={s} style={{ width: `${(farm.status[s] || 0) / farm.count * 100}%`, background: STATUS_COLOR[s] }} />)}
            </div>
            <div className={styles.legend}>
              {order.map(s => <span key={s}><i className={styles.dot} style={{ background: STATUS_COLOR[s] }} />{farm.status[s]} {statusLabel(t, s).toLowerCase()}</span>)}
            </div>
          </button>
        );
      })}
      <span className="visually-hidden">{fmt.fd(today)}</span>
    </>
  );
}
