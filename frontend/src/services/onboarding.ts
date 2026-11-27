import apiClient from "./api";
import { parsePublicPlanCatalog, type PublicPlanSegment } from "./publicPlanCatalog";

/** First access, end of the free trial and welcome tour (backend apps/billing/onboarding.py). */
export type BillingCycle = "monthly" | "yearly";
export type PaymentMethod = "pix" | "boleto" | "credit_card";
export type SegmentSelection = { segment_code: string; quantity: number | null };

export type PriceLine = { segment_code: string; name: string; tier_label: string; base: string; on_request: boolean; total: string; quantity?: number | null };
export type PriceBreakdown = {
  currency: string; billing_cycle: BillingCycle; lines: PriceLine[]; gross: string; subtotal: string; discount_total: string; total: string;
  subscription_discounts: { id: string; description: string; amount: string }[];
};
export type OnboardingSummary = {
  price: PriceBreakdown; billing_cycle: BillingCycle; months: number; cycle_total: string; unpriced: string[];
  trial_days: number; trial_ends_at: string; coupon_applied: boolean; coupon_error: string; terms_version: string;
};
export type OnboardingState = { pending: boolean; can_complete: boolean; trial_days: number; terms_version: string };

/** A segment priced by size needs a quantity (tiers with a range). */
export const isSized = (segment: PublicPlanSegment) => segment.tiers.some(tier => tier.min !== null || tier.max !== null);

export async function getOnboardingCatalog() {
  const [{ data: state }, { data: catalog }] = await Promise.all([
    apiClient.get<OnboardingState>("/organizations/me/onboarding/"),
    apiClient.get<unknown>("/public/plan-segments/"),
  ]);
  return { state, segments: parsePublicPlanCatalog(catalog) };
}

export async function previewOnboarding(segments: SegmentSelection[], billingCycle: BillingCycle, coupon: string, signal?: AbortSignal) {
  return (await apiClient.post<OnboardingSummary>("/organizations/me/onboarding/preview/", { segments, billing_cycle: billingCycle, coupon }, { signal })).data;
}

export async function completeOnboarding(segments: SegmentSelection[], billingCycle: BillingCycle, coupon: string, termsVersion: string) {
  return (await apiClient.post<{ summary: OnboardingSummary; trial_ends_at: string }>("/organizations/me/onboarding/complete/", {
    segments, billing_cycle: billingCycle, coupon, accepted_terms: true, terms_version: termsVersion,
  })).data;
}

export async function savePaymentMethod(method: PaymentMethod) {
  return (await apiClient.put<{ preferred_payment_method: PaymentMethod }>("/organizations/me/subscription/payment-method/", { payment_method: method })).data;
}

export async function subscribe(method: PaymentMethod) {
  return (await apiClient.post<{ invoice: { id: string; number: string; total: string; due_date: string } | null }>("/organizations/me/subscription/subscribe/", { payment_method: method })).data;
}

export async function finishWelcomeTour() {
  await apiClient.post("/auth/welcome-tour/");
}

/** First validation message of a DRF error, inside or outside the API error envelope. */
export function apiMessage(error: unknown): string | null {
  let detail: unknown = (error as { response?: { data?: { error?: { detail?: unknown } } } })?.response?.data;
  detail = (detail as { error?: { detail?: unknown } })?.error?.detail ?? detail;
  for (let depth = 0; depth < 4 && detail && typeof detail === "object"; depth += 1) {
    detail = Array.isArray(detail) ? detail[0] : (detail as Record<string, unknown>).detail ?? Object.values(detail as Record<string, unknown>)[0];
  }
  return typeof detail === "string" && detail ? detail : null;
}
