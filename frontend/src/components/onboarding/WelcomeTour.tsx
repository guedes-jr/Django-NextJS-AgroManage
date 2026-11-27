"use client";

import "./onboarding.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LayoutDashboard, Layers, Settings2, Sparkles, type LucideIcon } from "lucide-react";

import { useOrganizationLocale, type TranslationKey } from "@/lib/locale";
import { ACCESS_CHANGED_EVENT } from "@/services/organizationAccess";
import { finishWelcomeTour } from "@/services/onboarding";

const steps: { key: string; Icon: LucideIcon }[] = [
  { key: "welcome", Icon: Sparkles },
  { key: "dashboard", Icon: LayoutDashboard },
  { key: "segments", Icon: Layers },
  { key: "agenda", Icon: CalendarDays },
  { key: "change", Icon: Settings2 },
];
const SUBSCRIPTION_SETTINGS = "/home/settings?tab=subscription";

/** Short welcome tour shown once after the first access; the last step shows how to change segments. */
export function WelcomeTour() {
  const router = useRouter();
  const { t } = useOrganizationLocale();
  const [index, setIndex] = useState(0);
  const [closed, setClosed] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => { title.current?.focus(); }, [index]);

  const close = (target?: string) => {
    setClosed(true);
    // Best effort: if it fails the tour shows again on the next visit.
    void finishWelcomeTour().catch(() => {}).finally(() => window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT)));
    if (target) router.push(target);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (closed) return null;
  const { key, Icon } = steps[index];
  const last = index === steps.length - 1;
  const text = (suffix: string) => t(`tour.${key}.${suffix}` as TranslationKey);

  return <div className="welcome-tour-backdrop">
    <section className="welcome-tour" role="dialog" aria-modal="true" aria-labelledby="welcome-tour-title" aria-describedby="welcome-tour-text">
      <header><span>{t("tour.label")} · {t("tour.step", { current: index + 1, total: steps.length })}</span>
        <button type="button" className="btn btn-link btn-sm p-0" onClick={() => close()}>{t("tour.skip")}</button></header>
      <span className="welcome-tour-icon" aria-hidden="true"><Icon size={22}/></span>
      <h2 id="welcome-tour-title" ref={title} tabIndex={-1}>{text("title")}</h2>
      <p id="welcome-tour-text">{text("text")}</p>
      <footer>
        <div className="welcome-tour-dots" aria-hidden="true">{steps.map((step, position) => <span key={step.key} className={position === index ? "active" : ""}/>)}</div>
        <div>
          {index > 0 && <button type="button" className="btn btn-outline-secondary" onClick={() => setIndex(index - 1)}>{t("tour.back")}</button>}
          {last && <button type="button" className="btn btn-outline-secondary" onClick={() => close(SUBSCRIPTION_SETTINGS)}>{t("tour.change.open")}</button>}
          <button type="button" className="btn btn-primary" onClick={() => last ? close() : setIndex(index + 1)}>{last ? t("tour.finish") : t("tour.next")}</button>
        </div>
      </footer>
    </section>
  </div>;
}
