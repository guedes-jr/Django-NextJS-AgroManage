"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { usePublicLocale } from "@/lib/publicLocale";
export default function Page() {
  const { language, t } = usePublicLocale();
  const [farms, setFarms] = useState(1),
    [people, setPeople] = useState(3),
    [hours, setHours] = useState(12),
    [hourValue, setHourValue] = useState(25);
  const result = useMemo(() => {
    const saved = Math.round(hours * 0.55 + farms * 1.5 + people * 0.6);
    return {
      hours: saved,
      month: saved * hourValue,
      year: saved * hourValue * 12,
      plan:
        farms > 3 || people > 10
          ? "Gestão Plus"
          : farms > 1 || people > 3
            ? "Profissional"
            : "Essencial",
    };
  }, [farms, people, hours, hourValue]);
  const money = (value: number) => value.toLocaleString(language, { style: "currency", currency: "BRL" });
  return (
    <>
      <MarketingHeader />
      <main>
        <section className="public-page-hero">
          <div className="marketing-container">
            <div className="eyebrow">
              <Calculator size={16} /> {t("calculator.title")}
            </div>
            <h1>{t("calculator.heading")}</h1>
            <p>{t("calculator.description")}</p>
          </div>
        </section>
        <section className="marketing-section">
          <div className="marketing-container calculator-grid">
            <div className="contact-form form-grid">
              <label>
                <span>{t("calculator.farms")}</span>
                <input
                  type="number"
                  min="1"
                  value={farms}
                  onChange={(e) => setFarms(Number(e.target.value))}
                />
              </label>
              <label>
                <span>{t("calculator.people")}</span>
                <input
                  type="number"
                  min="1"
                  value={people}
                  onChange={(e) => setPeople(Number(e.target.value))}
                />
              </label>
              <label>
                <span>{t("calculator.weeklyHours")}</span>
                <input
                  type="number"
                  min="1"
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                />
              </label>
              <label>
                <span>{t("calculator.hourValue")}</span>
                <input
                  type="number"
                  min="1"
                  value={hourValue}
                  onChange={(e) => setHourValue(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="final-cta-card calculator-result">
              <div>
                <div className="eyebrow light">{t("calculator.estimate")}</div>
                <h2>{t("calculator.monthlyHours", { hours: result.hours })}</h2>
                <p>{t("calculator.resultDescription", { monthly: money(result.month), yearly: money(result.year) })}</p>
                <p>
                  {t("calculator.suggestedPlan")} <strong>{result.plan === "Gestão Plus" ? t("calculator.planPlus") : result.plan === "Profissional" ? t("calculator.planProfessional") : t("calculator.planEssential")}</strong>
                </p>
                <Link
                  className="marketing-button light"
                  href={`/contato?plano=${result.plan.toLowerCase().replace("ã", "a").replace(" ", "-")}&utm_source=calculator`}
                >
                  {t("calculator.cta")} <ArrowRight size={17} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
