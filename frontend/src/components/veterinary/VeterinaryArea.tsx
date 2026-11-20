"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, CircleCheck, Coins, FileText, LayoutGrid, PawPrint, Stethoscope, Users, type LucideProps } from "lucide-react";
import { useOrganizationLocale } from "@/lib/locale";
import type { TranslationKey } from "@/lib/localeMessages";
import { veterinaryService, vetError, type VetAnimal, type VetClient, type VetWorkspace } from "@/services/veterinaryService";
import base from "@/components/cattle/cattle.module.css";
import shared from "@/components/livestock/species-module-home.module.css";
import styles from "./veterinary.module.css";
import { formatters, type Fmt, type Translate } from "./vetText";
import { VetSummary } from "./VetSummary";
import { VetLaunch } from "./VetLaunch";
import { VetAnimals } from "./VetAnimals";
import { VetClients } from "./VetClients";
import { VetBilling } from "./VetBilling";
import { VetReport } from "./VetReport";
import { VetAlerts } from "./VetAlerts";

export type VetTab = "res" | "at" | "an" | "cl" | "co" | "rp" | "al";
export interface LaunchPreset { client?: string; animal?: string }

export interface VetContext {
  t: Translate;
  language: string;
  fmt: Fmt;
  workspace: VetWorkspace;
  clients: VetClient[];
  animals: VetAnimal[];
  today: string;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  go: (tab: VetTab, options?: { client?: string; preset?: LaunchPreset }) => void;
  focusClient: string;
  setFocusClient: (id: string) => void;
}

const TABS: Array<[VetTab, ComponentType<LucideProps>, TranslationKey]> = [
  ["res", LayoutGrid, "vet.tab.summary"],
  ["at", Stethoscope, "vet.tab.launch"],
  ["an", PawPrint, "vet.tab.animals"],
  ["cl", Users, "vet.tab.clients"],
  ["co", Coins, "vet.tab.billing"],
  ["rp", FileText, "vet.tab.report"],
  ["al", Bell, "vet.tab.alerts"],
];
const isTab = (value: string | null): value is VetTab => !!value && TABS.some(([key]) => key === value);

export function VeterinaryArea() {
  const { language, t } = useOrganizationLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("aba");
  const tab: VetTab = isTab(requested) ? requested : "res";
  const [workspace, setWorkspace] = useState<VetWorkspace | null>(null);
  const [clients, setClients] = useState<VetClient[]>([]);
  const [animals, setAnimals] = useState<VetAnimal[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preset, setPreset] = useState<LaunchPreset>({});
  const [focusClient, setFocusClient] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    const [ws, cl, an] = await Promise.all([veterinaryService.workspace(signal), veterinaryService.clients(signal), veterinaryService.animals(signal)]);
    setWorkspace(ws);
    setClients(cl);
    setAnimals(an);
    setError("");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([veterinaryService.workspace(controller.signal), veterinaryService.clients(controller.signal), veterinaryService.animals(controller.signal)])
      .then(([ws, cl, an]) => { setWorkspace(ws); setClients(cl); setAnimals(an); setError(""); })
      .catch(err => { if (!controller.signal.aborted) setError(vetError(err, t("vet.error"))); });
    return () => controller.abort();
  }, [t]);

  const reload = useCallback(() => load().catch(err => setError(vetError(err, t("vet.error")))), [load, t]);

  const go = useCallback((next: VetTab, options?: { client?: string; preset?: LaunchPreset }) => {
    if (options?.client !== undefined) setFocusClient(options.client);
    if (options?.preset) setPreset(options.preset);
    else if (next === "at") setPreset({});
    const query = new URLSearchParams(params.toString());
    query.set("aba", next);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [params, pathname, router]);

  const selectTab = (next: VetTab) => {
    setMessage("");
    go(next);
  };

  if (error && !workspace) {
    return (
      <div className={base.page}>
        <div role="alert" className="alert alert-danger d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void reload()}>{t("vet.retry")}</button>
        </div>
      </div>
    );
  }
  if (!workspace) return <div className={base.page}><p className={styles.muted}>{t("vet.loading")}</p></div>;

  const context: VetContext = {
    t, language, fmt: formatters(language), workspace, clients, animals, today: workspace.today, reload,
    notify: setMessage, go, focusClient, setFocusClient,
  };

  return (
    <div className={base.page}>
      <header className={base.header}>
        <div className={base.brand}>
          <div className={shared.titleIcon} aria-hidden="true"><Stethoscope size={26} strokeWidth={1.8} /></div>
          <div>
            <h1>{t("vet.title")}</h1>
            <p>{t("vet.subtitle")}</p>
          </div>
        </div>
      </header>

      <nav className={styles.tabs} aria-label={t("vet.title")}>
        {TABS.map(([key, Icon, label]) => (
          <button key={key} type="button" className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`} aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)}>
            <Icon size={16} aria-hidden="true" /> {t(label)}
            {key === "al" && workspace.open_alerts > 0 && <span className={styles.count}>{workspace.open_alerts}</span>}
          </button>
        ))}
      </nav>

      {message && (
        <div role="status" className="alert alert-success d-flex align-items-center gap-2 py-2">
          <CircleCheck size={18} aria-hidden="true" /> <span>{message}</span>
        </div>
      )}
      {error && <div role="alert" className="alert alert-danger py-2">{error}</div>}

      {tab === "res" && <VetSummary ctx={context} />}
      {tab === "at" && <VetLaunch ctx={context} preset={preset} />}
      {tab === "an" && <VetAnimals ctx={context} />}
      {tab === "cl" && <VetClients ctx={context} />}
      {tab === "co" && <VetBilling ctx={context} />}
      {tab === "rp" && <VetReport ctx={context} />}
      {tab === "al" && <VetAlerts ctx={context} />}
    </div>
  );
}

/** Indicator strip used at the top of the tabs (the prototype's green header, in the system style). */
export function VetKpis({ items }: { items: Array<{ label: string; value: string | number; icon: ComponentType<LucideProps>; tone?: "danger" | "warning" | "info" }> }) {
  return (
    <div className={styles.kpis}>
      {items.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className={styles.kpi} data-tone={tone}>
          <div className={styles.kpiIcon}><Icon size={20} aria-hidden="true" /></div>
          <div style={{ minWidth: 0 }}>
            <span className={styles.kpiValue}>{value}</span>
            <span className={styles.kpiLabel}>{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={styles.pill} data-tone={tone}>{children}</span>;
}
