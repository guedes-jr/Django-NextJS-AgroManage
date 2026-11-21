/* Translated labels for the Área do veterinário, mirroring the prototype's text builders. */
import type { TranslationKey, TranslationValues } from "@/lib/localeMessages";
import type {
  VetAnimal, VetCategory, VetConduct, VetCycling, VetDiscardReason, VetMethod, VetNext, VetProcedure,
  VetProcedureKind, VetReportKind, VetReportResult, VetSource, VetStatus,
} from "@/services/veterinaryService";

export type Translate = (key: TranslationKey, values?: TranslationValues) => string;

export const CATEGORIES: VetCategory[] = ["vaca_solteira", "vaca_parida", "novilha"];
export const STATUSES: VetStatus[] = ["pregnant", "open", "inseminated", "protocol", "attended", "none"];
export const OPEN_CONDUCTS: Exclude<VetConduct, "">[] = ["iatf_protocol", "observe_heat", "induction", "discard"];
export const DISCARD_REASONS: Exclude<VetDiscardReason, "">[] = ["repeat_open", "age", "low_production", "health", "other"];
export const METHODS: Exclude<VetMethod, "">[] = ["artificial", "natural"];
export const PRICE_KINDS: Array<[VetProcedureKind, string]> = [
  ["insemination", "price_insemination"], ["protocol", "price_protocol"], ["iatf_insemination", "price_iatf_insemination"],
  ["ultrasound", "price_ultrasound"], ["palpation", "price_palpation"], ["other", "price_other"],
];
export const GESTATION_DAYS = 283;

/** Calendar dates are business dates: never shift them with the browser time zone. */
export function parseDay(day: string) {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
}
export function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function addDays(day: string, days: number) {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}
export function diffDays(a: string, b: string) {
  return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 864e5);
}

export function formatters(language: string) {
  const full = new Intl.DateTimeFormat(language, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const short = new Intl.DateTimeFormat(language, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const money = new Intl.NumberFormat(language, { style: "currency", currency: "BRL" });
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  return {
    fd: (day?: string | null) => (day ? full.format(parseDay(day)) : ""),
    fd5: (day?: string | null) => (day ? short.format(parseDay(day)) : ""),
    money: (value: string | number | null | undefined) => money.format(Number(value || 0)),
    number: (value: number) => number.format(value),
    num: (value: number) => decimal.format(value),
    percent: (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${decimal.format(value)}%`),
  };
}
export type Fmt = ReturnType<typeof formatters>;

export const statusLabel = (t: Translate, status: VetStatus) => t(`vet.status.${status}` as TranslationKey);
export const categoryLabel = (t: Translate, category: VetCategory | "") => (category ? t(`vet.category.${category}` as TranslationKey) : "");
export const conductLabel = (t: Translate, conduct: VetConduct | string) => (conduct ? t(`vet.conduct.${conduct}` as TranslationKey) : "");
export const cyclingLabel = (t: Translate, cycling: VetCycling) => (cycling ? t(`vet.cycling.${cycling}` as TranslationKey) : "");
export const kindLabel = (t: Translate, kind: VetProcedureKind) => t(`vet.kind.${kind}` as TranslationKey);
export const reportKindLabel = (t: Translate, kind: VetReportKind) => t(`vet.reportKind.${kind}` as TranslationKey);
export const resultLabel = (t: Translate, result: VetReportResult | "") => (result ? t(`vet.result.${result}` as TranslationKey) : "");
export const methodLabel = (t: Translate, method: VetMethod) => (method ? t(`vet.method.${method}` as TranslationKey) : "");
export const discardLabel = (t: Translate, reason: VetDiscardReason) => (reason ? t(`vet.discard.${reason}` as TranslationKey) : "");

/** Text of the next procedure, as the prototype shows it in Animais/Alertas. */
export function nextLabel(t: Translate, next: VetNext | null | undefined) {
  if (!next) return "—";
  return t(`vet.next.${next.code}` as TranslationKey, { day: next.day ?? "" });
}

/** Key used to filter by next procedure (two removal alerts with different D numbers are distinct). */
export const nextKey = (next: VetNext) => `${next.code}:${next.day ?? ""}`;

export function deadlineMark(t: Translate, fmt: Fmt, day: string | null, today: string) {
  if (!day) return t("vet.noDate");
  const late = day < today;
  return `${fmt.fd5(day)}${late ? ` (${t("vet.lateSuffix")})` : day === today ? ` (${t("vet.todaySuffix")})` : ""}`;
}

export function protocolOrigin(t: Translate, fmt: Fmt, source: Pick<VetSource, "cycling" | "management_days" | "protocol_start">) {
  return t("vet.launch.originProtocol", { cycling: cyclingLabel(t, source.cycling), days: source.management_days ?? 10, date: fmt.fd5(source.protocol_start) });
}

export function gestationNow(procedure: VetProcedure, today: string) {
  if (procedure.result !== "pregnant") return 0;
  if (procedure.coverage_date) return Math.max(0, diffDays(today, procedure.coverage_date));
  return (procedure.gestation_days || 0) + Math.max(0, diffDays(today, procedure.date));
}

/** "O que foi feito" (prototype vkTxt). */
export function procedureText(t: Translate, fmt: Fmt, p: VetProcedure, today: string) {
  if (p.step) return stepText(t, fmt, p);
  if (p.result === "pregnant") {
    const parts: string[] = [];
    if (p.coverage_date) parts.push(`${p.origin_kind ? t("vet.launch.insemination") : t("vet.launch.coverageDate")} ${fmt.fd(p.coverage_date)}`);
    if (p.gestation_days || p.coverage_date) parts.push(t("vet.report.gestationDays", { days: gestationNow(p, today) }));
    if (p.bull) parts.push(`${t("vet.launch.bullUsed")}: ${p.bull}`);
    if (p.calving_date) parts.push(t("vet.report.calvingOn", { date: fmt.fd(p.calving_date) }));
    if (p.coverage_method) parts.push(methodLabel(t, p.coverage_method));
    return parts.join(" · ") || t("vet.result.pregnant");
  }
  if (p.result === "open") {
    let text = conductLabel(t, p.conduct) || t("vet.result.open");
    if (p.cycling) text += ` (${cyclingLabel(t, p.cycling)}, ${t("vet.days", { count: p.management_days ?? 10 })}, ${fmt.fd5(p.protocol_start)})`;
    if (p.return_days) text += ` · ${t("vet.report.inDays", { days: p.return_days })}`;
    if (p.bull && p.conduct === "iatf_protocol") text += ` · ${p.bull}`;
    if (p.discard_reason) text += `: ${discardLabel(t, p.discard_reason)}`;
    return text;
  }
  return `${kindLabel(t, p.kind)}${p.semen ? ` · ${p.semen}` : ""}`;
}

/** Protocol stage answers (D8 removal, IATF insemination done/not done). */
export function stepText(t: Translate, fmt: Fmt, p: VetProcedure) {
  if (p.step === "insemination") {
    if (p.not_done) return t("vet.report.iatfStepNotDone");
    return `${t("vet.reportKind.insemination")}${p.semen ? ` · ${p.semen}` : ""}`;
  }
  const step = t("vet.removalStep", { day: p.step_day ?? 8 });
  if (!p.not_done) return t("vet.report.stepDone", { step, date: fmt.fd(p.date) });
  return [t("vet.report.stepNotDone", { step }), p.rescheduled_to ? t("vet.report.rescheduled", { date: fmt.fd(p.rescheduled_to) }) : ""].filter(Boolean).join(" · ");
}

/** "Detalhes" column of the report (prototype vRDet). */
export function reportDetails(t: Translate, fmt: Fmt, p: VetProcedure & { report_kind: VetReportKind }) {
  if (p.not_done && p.step === "insemination") return t("vet.report.iatfNotDone");
  if (p.kind === "insemination" || p.kind === "iatf_insemination") return t("vet.report.realized");
  const parts: string[] = [];
  if (p.result === "pregnant") {
    if (p.coverage_date) parts.push(t("vet.report.coverageOn", { date: fmt.fd(p.coverage_date) }));
    if (p.gestation_days) parts.push(t("vet.report.gestationDays", { days: p.gestation_days }));
    if (p.calving_date) parts.push(t("vet.report.calvingOn", { date: fmt.fd(p.calving_date) }));
  } else if (p.result === "open") {
    if (p.conduct === "iatf_protocol") parts.push(t("vet.report.protocolDetail", { cycling: cyclingLabel(t, p.cycling), days: p.management_days ?? 10, date: fmt.fd5(p.protocol_start || p.date) }));
    else if (p.return_days) parts.push(t("vet.report.inDays", { days: p.return_days }));
    if (p.discard_reason) parts.push(t("vet.report.reason", { reason: discardLabel(t, p.discard_reason) }));
  } else if (p.step) {
    parts.push(stepText(t, fmt, p));
  }
  return parts.join(" · ");
}

/** "Conduta" column: for pregnancies, how the pregnancy was obtained (prototype vRCd). */
export function reportConduct(t: Translate, origin: string) {
  if (origin === "artificial" || origin === "natural") return methodLabel(t, origin);
  return conductLabel(t, origin);
}

/** "Último procedimento" of the corral list (prototype vAlLast). */
export function lastLabel(t: Translate, fmt: Fmt, last: VetProcedure | null) {
  if (!last) return "—";
  if (last.not_done) return t("vet.alerts.notDoneLast", { date: fmt.fd5(last.date) });
  const result = last.result === "pregnant" ? ` (${t("vet.result.pregnant").toLowerCase()})` : last.result === "open" ? ` (${t("vet.result.open").toLowerCase()})` : "";
  const conduct = last.conduct ? ` → ${conductLabel(t, last.conduct)}` : "";
  return `${kindLabel(t, last.kind)}${result}${conduct} · ${fmt.fd5(last.date)}`;
}

/** "Último procedimento" of the Animals table: kind · date. */
export const lastShort = (t: Translate, fmt: Fmt, last: VetProcedure | null) => (last ? `${kindLabel(t, last.kind)} · ${fmt.fd5(last.date)}` : "—");

/** "Detalhes" of the corral list (prototype vAlDet). */
export function animalDetails(t: Translate, fmt: Fmt, animal: VetAnimal, today: string) {
  const last = animal.last;
  if (!last) return t("vet.alerts.noVisit");
  const parts: string[] = [];
  const source = animal.source;
  if (animal.status === "protocol") {
    if (source) parts.push(source.kind === "protocol" ? protocolOrigin(t, fmt, source) : `${t("vet.reportKind.insemination")}${source.bull ? ` · ${source.bull}` : ""}`);
    if (source?.insemination_date) parts.push(t("vet.alerts.expectedInsemination", { date: fmt.fd5(source.insemination_date) }));
    if (source?.bull) parts.push(t("vet.alerts.bull", { bull: source.bull }));
  } else if (animal.status === "inseminated") {
    parts.push(t("vet.alerts.inseminatedOn", { date: fmt.fd5(last.date), days: Math.max(0, diffDays(today, last.date)) }));
    if (last.semen) parts.push(t("vet.alerts.semen", { bull: last.semen }));
  } else if (animal.status === "pregnant") {
    if (last.gestation_days || last.coverage_date) parts.push(t("vet.report.gestationDays", { days: gestationNow(last, today) }));
    if (last.coverage_date) parts.push(t("vet.alerts.inseminationOn", { date: fmt.fd5(last.coverage_date) }));
    if (last.calving_date) parts.push(t("vet.alerts.calvingOn", { date: fmt.fd5(last.calving_date) }));
    if (last.bull) parts.push(t("vet.alerts.bull", { bull: last.bull }));
  } else if (animal.status === "open" && last.conduct) {
    parts.push(t("vet.alerts.conduct", { conduct: conductLabel(t, last.conduct) }));
  }
  if (last.notes) parts.push(t("vet.alerts.notes", { notes: last.notes }));
  return parts.join(" · ") || "—";
}

/** Same normalization as the prototype search: accents and case ignored. */
export function norm(text: string | null | undefined) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function naturalCompare(a: string, b: string, language: string) {
  return String(a).localeCompare(String(b), language, { numeric: true });
}
