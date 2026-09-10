import axios from "axios";
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
  const track = () =>
    apiClient.post<TrackingResponse>("/public/affiliates/track/", {
      code,
      visitor_id: createVisitorId(),
      landing_path: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer || "",
      utm_source: searchParams.get("utm_source") || "",
      utm_medium: searchParams.get("utm_medium") || "",
      utm_campaign: searchParams.get("utm_campaign") || "",
    });

  let response;
  try {
    response = await track();
  } catch (error) {
    const responseCode = axios.isAxiosError(error)
      ? (error.response?.data as { code?: string } | undefined)?.code
      : undefined;
    if (responseCode !== "affiliate_visitor_already_registered") throw error;
    localStorage.removeItem(VISITOR_ID_KEY);
    response = await track();
  }

  const { data } = response;
  localStorage.setItem(ATTRIBUTION_TOKEN_KEY, data.attribution_token);
};

export const getAttributionToken = (): string =>
  localStorage.getItem(ATTRIBUTION_TOKEN_KEY) || "";

export const clearAttributionToken = (): void => {
  localStorage.removeItem(ATTRIBUTION_TOKEN_KEY);
};

export const clearAffiliateTracking = (): void => {
  localStorage.removeItem(ATTRIBUTION_TOKEN_KEY);
  localStorage.removeItem(VISITOR_ID_KEY);
};
