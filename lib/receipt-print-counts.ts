// lib/receipt-print-counts.ts
// Shared client helpers for receipt print counts.
//
// Local/offline POS transactions:
//   POST /api/local/transactions/[clientTxnId]/receipt-print
//
// Cloud/synced transactions:
//   GET  /api/transactions/[id]/receipt-print
//   POST /api/transactions/[id]/receipt-print
//
// The localStorage functions are kept only as fallback for old local counts.

export function localReceiptPrintCountKey(clientTxnId: string) {
  return `receipt-print-count:${clientTxnId}`;
}

export function getLocalReceiptPrintCountFallback(clientTxnId: string): number {
  if (typeof window === "undefined") return 0;

  const raw = window.localStorage.getItem(
    localReceiptPrintCountKey(clientTxnId)
  );

  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function setLocalReceiptPrintCountFallback(
  clientTxnId: string,
  count: number
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    localReceiptPrintCountKey(clientTxnId),
    String(Math.max(0, Math.trunc(Number(count ?? 0))))
  );
}

/**
 * Backward-compatible alias.
 * Existing UI can still call getLocalReceiptPrintCount().
 */
export function getLocalReceiptPrintCount(clientTxnId: string): number {
  return getLocalReceiptPrintCountFallback(clientTxnId);
}

/**
 * Backward-compatible alias.
 */
export function setLocalReceiptPrintCount(clientTxnId: string, count: number) {
  setLocalReceiptPrintCountFallback(clientTxnId, count);
}

/**
 * Fallback only. The preferred method is incrementLocalReceiptPrintCount(),
 * which writes to local SQLite via API.
 */
export function incrementLocalReceiptPrintCountFallback(
  clientTxnId: string
): number {
  const next = getLocalReceiptPrintCountFallback(clientTxnId) + 1;
  setLocalReceiptPrintCountFallback(clientTxnId, next);
  return next;
}

/**
 * Preferred local POS print count increment.
 * This writes into local SQLite local_transactions.receipt_print_count.
 * If the transaction is already synced, the server helper also syncs the count
 * into Neon receipt_print_logs.
 */
export async function incrementLocalReceiptPrintCount(
  clientTxnId: string
): Promise<number> {
  const res = await fetch(
    `/api/local/transactions/${encodeURIComponent(clientTxnId)}/receipt-print`,
    {
      method: "POST",
    }
  );

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return incrementLocalReceiptPrintCountFallback(clientTxnId);
  }

  const next = Number(data?.receiptPrintCount ?? 0);

  if (Number.isFinite(next)) {
    setLocalReceiptPrintCountFallback(clientTxnId, next);
    return next;
  }

  return incrementLocalReceiptPrintCountFallback(clientTxnId);
}

export async function fetchCloudReceiptPrintCount(
  transactionId: number
): Promise<number> {
  const res = await fetch(`/api/transactions/${transactionId}/receipt-print`, {
    cache: "no-store",
  });

  if (!res.ok) return 0;

  const data = await res.json().catch(() => null);

  return Number(data?.printCount ?? data?.count ?? 0);
}

export async function logCloudReceiptPrint(
  transactionId: number,
  printedBy?: string | null
): Promise<number> {
  const current = await fetchCloudReceiptPrintCount(transactionId);

  const res = await fetch(`/api/transactions/${transactionId}/receipt-print`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      printType: current > 0 ? "reprint" : "original",
      printedBy: printedBy ?? null,
    }),
  });

  if (!res.ok) return current;

  const data = await res.json().catch(() => null);

  return Number(data?.printCount ?? data?.count ?? current + 1);
}

export async function syncLocalReceiptPrintCounts(eventId: number) {
  const res = await fetch(
    `/api/local/events/${eventId}/receipt-print-counts/sync`,
    {
      method: "POST",
    }
  );

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to sync local receipt print counts.");
  }

  return data;
}