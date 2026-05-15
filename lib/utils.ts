// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge Tailwind classes — used by all shadcn/ui components
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Format as Indonesian Rupiah
export function formatRupiah(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "Rp 0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(num);
}

// Format a plain input value with Indonesian thousands separators.
// Example: "100000" -> "100.000"
export function formatRupiahInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  const num = Number(digits);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(num);
}

// Parse a formatted Rupiah input back into a number.
// Example: "100.000" -> 100000
export function parseRupiahInput(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  const num = Number(digits);
  return Number.isFinite(num) ? num : 0;
}

// Format date to readable Indonesian locale string
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Format date only (no time)
export function formatDateOnly(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// Generate a unique item ID
export function generateItemId(): string {
  return `SKU-${Date.now()}`;
}

// Safe parseFloat — never returns NaN
export function safeFloat(val: string | number | null | undefined, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? fallback : n;
}

// Calculate discount percentage between retail and net
export function discountPct(retailPrice: number | string, netPrice: number | string): number {
  const retail = safeFloat(retailPrice);
  const net    = safeFloat(netPrice);
  if (retail <= 0 || net >= retail) return 0;
  return Math.round((1 - net / retail) * 100);
}

// Format a compact number for dashboard stats (e.g. 1.2M, 500K)
export function formatCompact(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000)     return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000)         return `${(num / 1_000).toFixed(0)}K`;
  return String(num);
}

// Clamp a number between min and max
export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

// Build a URL for an event-scoped path
export function eventPath(eventId: number, path = ""): string {
  return `/events/${eventId}${path ? `/${path.replace(/^\//, "")}` : ""}`;
}

// ── Transaction display ID ────────────────────────────────────────────────────
// Format: yyyyMM + zero-padded 5-digit sequence
// e.g. sequence 1 in January 2026 → "20260100001"
// e.g. sequence 123 in May 2026   → "20260500123"
export function formatTransactionDisplayId(
  date: Date | string,
  sequence: number
): string {
  const d    = typeof date === "string" ? new Date(date) : date;
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const seq  = String(sequence).padStart(5, "0");
  return `${yyyy}${mm}${seq}`;
}

// Parse yyyyMM prefix out of a displayId for filtering/grouping
export function parseDisplayIdMonth(displayId: string): string {
  return displayId.slice(0, 6);
}

// ── Cash change calculator ────────────────────────────────────────────────────
// Returns the change to give back to the customer.
export function calculateChange(
  cashTendered: number | string,
  totalAmount:  number | string
): number {
  const tendered = typeof cashTendered === "string" ? parseRupiahInput(cashTendered) : safeFloat(cashTendered);
  const total    = typeof totalAmount === "string" ? parseRupiahInput(totalAmount) : safeFloat(totalAmount);
  return Math.max(0, tendered - total);
}

// Suggest practical Rupiah cash amounts to tender for a given total.
// Uses cashier-friendly notes/rounding instead of tiny Rp1.000 steps.
const IDR_QUICK_ROUNDS = [5000, 10000, 20000, 50000, 100000, 200000, 500000];

export function suggestedCashAmounts(total: number): number[] {
  const cleanTotal = Math.max(0, Math.round(total));
  if (cleanTotal <= 0) return [];

  const suggestions = new Set<number>();

  // Exact amount first, useful when customer pays exact cash.
  suggestions.add(cleanTotal);

  // Practical rounded amounts based on Indonesian cash notes.
  for (const round of IDR_QUICK_ROUNDS) {
    const rounded = Math.ceil(cleanTotal / round) * round;
    if (rounded >= cleanTotal) suggestions.add(rounded);
  }

  // If the total is small, include common notes that cashiers actually receive.
  for (const note of [20000, 50000, 100000]) {
    if (note >= cleanTotal) suggestions.add(note);
  }

  // Larger totals often use big notes / bundles.
  if (cleanTotal > 100000) {
    for (const note of [200000, 300000, 500000, 1000000]) {
      if (note >= cleanTotal) suggestions.add(note);
    }
  }

  return [...suggestions]
    .filter(v => v >= cleanTotal)
    .sort((a, b) => a - b)
    .slice(0, 6);
}
