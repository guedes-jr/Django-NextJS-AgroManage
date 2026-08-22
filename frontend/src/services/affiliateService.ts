import { apiClient } from "@/services/api";
import type { Theme } from "@/lib/theme";

export interface AffiliateAccount {
  full_name: string;
  email: string;
  phone: string;
  theme: Theme;
}

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
  async account() {
    const { data } = await apiClient.get<AffiliateAccount>("/affiliates/me/profile/");
    return data;
  },
  async updateAccount(payload: Partial<AffiliateAccount>) {
    const { data } = await apiClient.patch<AffiliateAccount>(
      "/affiliates/me/profile/",
      payload,
    );
    return data;
  },
  async changePassword(payload: {
    current_password: string;
    new_password: string;
    new_password_confirm: string;
  }) {
    const { data } = await apiClient.post<{ detail: string; relogin_required: boolean }>(
      "/affiliates/me/change-password/",
      payload,
    );
    return data;
  },
  async referrals(status?: AffiliateReferral["status"]) {
    const query = status ? `&status=${status}` : "";
    const { data } = await apiClient.get<Page<AffiliateReferral>>(
      `/affiliates/me/referrals/?page_size=100${query}`,
    );
    return data;
  },
  async commissions(status?: AffiliateCommission["status"]) {
    const query = status ? `&status=${status}` : "";
    const { data } = await apiClient.get<Page<AffiliateCommission>>(
      `/affiliates/me/commissions/?page_size=100${query}`,
    );
    return data;
  },
};
