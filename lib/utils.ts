// lib/utils.ts

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

// Format date to readable Indonesian locale string
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Format date only (no time)
export function formatDateOnly(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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