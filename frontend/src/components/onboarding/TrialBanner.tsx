"use client";

import "./onboarding.css";
import Link from "next/link";
import { useState } from "react";

import { useOrganizationLocale } from "@/lib/locale";
import { SUBSCRIBE_PATH, type OrganizationAccess } from "@/services/organizationAccess";

const DAY = 24 * 60 * 60 * 1000;

/** Days left in the free trial, with the way to choose the payment method or subscribe (admin). */
export function TrialBanner({ access }: { access: OrganizationAccess | null }) {
  const { t } = useOrganizationLocale();
  // Read once per mount; the layout remounts the banner on navigation and refreshes access.
  const [now] = useState(() => Date.now());
  if (!access?.trial_ends_at || access.access_stage) return null;
  const days = Math.max(0, Math.ceil((new Date(access.trial_ends_at).getTime() - now) / DAY));
  return <div className="trial-banner" role="status">
    <span>{days <= 1 ? t("trial.bannerToday") : t("trial.bannerDays", { days })}</span>
    {access.role === "admin" && <Link href={SUBSCRIBE_PATH}>{t("trial.bannerAction")}</Link>}
  </div>;
}
