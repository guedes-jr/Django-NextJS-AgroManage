import { apiClient } from "@/services/api";

const VISITOR_ID_KEY = "affiliate_visitor_id";
const ATTRIBUTION_TOKEN_KEY = "affiliate_attribution_token";

interface TrackingResponse {
  attribution_token: string;
  affiliate_code: string;
  is_new_attribution: boolean;
}

const createVisitorId = (): string => {
  const existing = localStorage.getItem(VISITOR_ID_KEY);
  if (existing) return existing;

  const visitorId = crypto.randomUUID();
  localStorage.setItem(VISITOR_ID_KEY, visitorId);
  return visitorId;
};

export const trackAffiliateReferral = async (
  code: string,
  searchParams: URLSearchParams,
): Promise<void> => {
  const { data } = await apiClient.post<TrackingResponse>("/public/affiliates/track/", {
    code,
    visitor_id: createVisitorId(),
    landing_path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || "",
    utm_source: searchParams.get("utm_source") || "",
    utm_medium: searchParams.get("utm_medium") || "",
    utm_campaign: searchParams.get("utm_campaign") || "",
  });
  localStorage.setItem(ATTRIBUTION_TOKEN_KEY, data.attribution_token);
};

export const getAttributionToken = (): string =>
  localStorage.getItem(ATTRIBUTION_TOKEN_KEY) || "";

export const clearAttributionToken = (): void => {
  localStorage.removeItem(ATTRIBUTION_TOKEN_KEY);
};
