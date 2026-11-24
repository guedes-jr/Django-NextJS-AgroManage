"use client";

import { useState } from "react";

import { PLATFORM_STAFF } from "@/services/platformApi";
import type { PlatformStaff } from "@/types/platform";

/** Platform owners and administrators may change customer data; the API enforces the same rule. */
export function usePlatformCanManage() {
  const [canManage] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const role = (JSON.parse(localStorage.getItem(PLATFORM_STAFF) || "{}") as PlatformStaff).role;
      return role === "platform_owner" || role === "platform_admin";
    } catch {
      return false;
    }
  });
  return canManage;
}

/** First readable message from the API error envelope ({error: {detail: {field: [...]}}}). */
export function platformErrorFields(error: unknown): Record<string, string> {
  const data = (error as { response?: { data?: { error?: { detail?: unknown }; detail?: unknown } } })?.response?.data;
  const detail = data?.error?.detail ?? data;
  if (!detail || typeof detail !== "object") return {};
  return Object.fromEntries(
    Object.entries(detail as Record<string, unknown>)
      .map(([key, value]) => [key, Array.isArray(value) ? String(value[0] ?? "") : typeof value === "string" ? value : ""])
      .filter(([, value]) => value),
  );
}
