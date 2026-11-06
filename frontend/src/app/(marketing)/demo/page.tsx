"use client";
import { usePublicLocale } from "@/lib/publicLocale";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Sprout,
  WalletCards,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export default function Page() {
  const { t } = usePublicLocale();
const steps = [
  {
    icon: Sprout,
    title: t("public.setUpTheProperty"),
    text: t("public.createFarmsSectorsCropsAndTeamsToRepresentYourOperation"),
  },
  {
    icon: Boxes,
    title: t("public.recordAMovement"),
    text: t("public.anInputWithdrawalUpdatesStockAndKeepsHistoryTraceable"),
  },
  {
    icon: WalletCards,
    title: t("public.connectFinances"),
    text: t("public.costsAndIncomeBecomePartOfTheManagementOverview"),
  },
  {
    icon: BarChart3,
    title: t("public.trackIndicators"),
    text: t("public.theDashboardTurnsRecordsIntoPrioritiesAndDecisions"),
  },
];
  const [current, setCurrent] = useState(0);
  const step = steps[current];
  const Icon = step.icon;
  return (
    <>
      <MarketingHeader />
      <main>
        <section className="public-page-hero">
          <div className="marketing-container">
            <div className="eyebrow">{t("public.interactiveDemo")}</div>
            <h1>{t("public.exploreTheFazendaMaisWorkflowInMinutes")}</h1>
            <p> {t("public.exploreAFictionalOperationAndSeeHowTheModulesWork")} </p>
          </div>
        </section>
        <section className="marketing-section">
          <div className="marketing-container interactive-demo">
            <nav>
              {steps.map((item, index) => (
                <button
                  className={index === current ? "active" : ""}
                  onClick={() => setCurrent(index)}
                  key={item.title}
                >
                  <span>{index < current ? <CheckCircle2 /> : index + 1}</span>
                  {item.title}
                </button>
              ))}
            </nav>
            <article>
              <div className="feature-icon">
                <Icon />
              </div>
              <div className="eyebrow"> {t("public.step")} {current + 1} {t("public.of")} {steps.length}
              </div>
              <h2>{step.title}</h2>
              <p>{step.text}</p>
              <div className="demo-preview">
                <strong>{t("public.horizonteFarm")}</strong>
                <span>
                  {current === 0
                    ? t("public.2Units8Users")
                    : current === 1
                      ? t("public.stockUpdated36Items")
                      : current === 2
                        ? t("public.monthlyCostsR48320")
                        : t("public.operationUpToDate4Alerts")}
                </span>
              </div>
              <div className="d-flex gap-2">
                <button
                  className="marketing-button secondary"
                  disabled={current === 0}
                  onClick={() => setCurrent((v) => Math.max(0, v - 1))}
                > {t("notifications.previous")} </button>
                {current < steps.length - 1 ? (
                  <button
                    className="marketing-button primary"
                    onClick={() => setCurrent((v) => v + 1)}
                  > {t("public.nextStep")} <ArrowRight size={17} />
                  </button>
                ) : (
                  <Link
                    className="marketing-button primary"
                    href="/contato?utm_source=interactive-demo"
                  > {t("public.seeItWithMyData")} <ArrowRight size={17} />
                  </Link>
                )}
              </div>
            </article>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
