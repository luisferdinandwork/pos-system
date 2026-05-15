// lib/receipt-print-counts.ts
// Shared client helpers for receipt print counts.
//
// Cloud/synced transactions should use:
//   GET/POST /api/transactions/[id]/receipt-print
//
// Local/offline POS transactions do not have a cloud transaction ID yet,
// so their print counts are stored in localStorage until sync.

export function localReceiptPrintCountKey(clientTxnId: string) {
  return `receipt-print-count:${clientTxnId}`;
}

export function getLocalReceiptPrintCount(clientTxnId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(localReceiptPrintCountKey(clientTxnId));
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function setLocalReceiptPrintCount(clientTxnId: string, count: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localReceiptPrintCountKey(clientTxnId), String(Math.max(0, count)));
}

export function incrementLocalReceiptPrintCount(clientTxnId: string): number {
  const next = getLocalReceiptPrintCount(clientTxnId) + 1;
  setLocalReceiptPrintCount(clientTxnId, next);
  return next;
}

export async function fetchCloudReceiptPrintCount(transactionId: number): Promise<number> {
  const res = await fetch(`/api/transactions/${transactionId}/receipt-print`, {
    cache: "no-store",
  });

  if (!res.ok) return 0;

  const data = await res.json().catch(() => null);
  return Number(data?.printCount ?? 0);
}

export async function logCloudReceiptPrint(
  transactionId: number,
  printedBy?: string | null
): Promise<number> {
  const current = await fetchCloudReceiptPrintCount(transactionId);

  const res = await fetch(`/api/transactions/${transactionId}/receipt-print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      printType: current > 0 ? "reprint" : "original",
      printedBy: printedBy ?? null,
    }),
  });

  if (!res.ok) return current;

  const data = await res.json().catch(() => null);
  return Number(data?.printCount ?? current + 1);
}
