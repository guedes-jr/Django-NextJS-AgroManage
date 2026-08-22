import { apiClient } from "@/services/api";

export interface AffiliateProfile {
  code: string;
  status: "active" | "inactive";
  commission_type: "percentage" | "fixed_amount";
  commission_type_display: string;
  commission_value: string;
  commission_duration: "first_payment" | "first_three_payments" | "permanent";
  currency: string;
  referral_path: string;
  activated_at: string | null;
}

export interface AffiliateDashboard {
  clicks: number;
  unique_visitors: number;
  registrations: number;
  converted_customers: number;
  commissions: {
    total: string;
    pending: string;
    approved: string;
    paid: string;
    cancelled: string;
  };
  reversed_total: string;
}

export interface AffiliateReferral {
  id: string;
  customer: string;
  plan: string;
  status: "visited" | "registered" | "converted";
  status_display: string;
  attributed_at: string;
  registered_at: string | null;
  converted_at: string | null;
}

export interface AffiliateCommission {
  id: string;
  customer: string;
  organization: string;
  plan: string;
  invoice: string;
  transaction_amount: string;
  commission_type_snapshot: "percentage" | "fixed_amount";
  commission_rate_snapshot: string;
  commission_duration_snapshot: "first_payment" | "first_three_payments" | "permanent";
  commission_amount: string;
  currency: string;
  conversion_at: string;
  status: "pending" | "approved" | "paid" | "cancelled";
  status_display: string;
  reversed_amount: string;
}

interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  total_pages: number;
  results: T[];
}

export const affiliateService = {
  async profile() {
    const { data } = await apiClient.get<AffiliateProfile>("/affiliates/me/");
    return data;
  },
  async dashboard() {
    const { data } = await apiClient.get<AffiliateDashboard>("/affiliates/me/dashboard/");
    return data;
  },
  async referrals() {
    const { data } = await apiClient.get<Page<AffiliateReferral>>(
      "/affiliates/me/referrals/?page_size=100",
    );
    return data;
  },
  async commissions() {
    const { data } = await apiClient.get<Page<AffiliateCommission>>(
      "/affiliates/me/commissions/?page_size=100",
    );
    return data;
  },
};
