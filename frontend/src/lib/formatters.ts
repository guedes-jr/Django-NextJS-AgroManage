/**
 * Shared formatting utilities.
 */

import { LOCALE, CURRENCY } from "@/lib/constants";

/**
 * Format a number as BRL currency.
 */
export function formatCurrency(value: number | string, language = LOCALE): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat(language, { style: "currency", currency: CURRENCY }).format(num);
}

/**
 * Format a date string (ISO) to dd/MM/yyyy.
 */
export function formatDate(dateStr: string | null | undefined, language = LOCALE): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(language).format(date);
}

/**
 * Format a date-time string to dd/MM/yyyy HH:mm.
 */
export function formatDateTime(dateStr: string | null | undefined, language = LOCALE): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Format a decimal number with a unit.
 */
export function formatUnit(value: string | number | null, unit: string, language = LOCALE): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `${num.toLocaleString(language)} ${unit}`;
}

/**
 * Truncate a string to a max length.
 */
export function truncate(str: string, max = 50): string {
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

/**
 * Return initials from a full name.
 */
export function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}
