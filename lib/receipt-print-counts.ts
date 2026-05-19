// lib/receipt-print-counts.ts
// Shared client helpers for receipt print counts.
//
// Single source of truth:
// - Local/offline POS: local SQLite local_transactions.receipt_print_count
// - Cloud/synced transactions: Neon transactions.receipt_print_count
//
// Local/offline POS transactions:
//   POST /api/local/transactions/[clientTxnId]/receipt-print
//
// Cloud/synced transactions:
//   GET  /api/transactions/[id]/receipt-print
//   POST /api/transactions/[id]/receipt-print
//
// LocalStorage is only kept as a fallback for old browser-side counts.

export type LocalReceiptPrintResult = {
  clientTxnId: string;
  serverTransactionId: number | null;
  receiptPrintCount: number;
  cloudSync?: {
    transactionId: number;
    receiptPrintCount: number;
  } | null;
};

export type CloudReceiptPrintResult = {
  transactionId: number;
  receiptPrintCount: number;
};

export type ReceiptPrintCountsMap = Record<string, number>;

export function localReceiptPrintCountKey(clientTxnId: string) {
  return `receipt-print-count:${clientTxnId}`;
}

export function getLocalReceiptPrintCountFallback(clientTxnId: string): number {
  if (typeof window === "undefined") return 0;

  const raw = window.localStorage.getItem(
    localReceiptPrintCountKey(clientTxnId)
  );

  const count = Number(raw ?? 0);
  return Number.isFinite(count) ? count : 0;
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

/** Backward-compatible alias for older UI code. */
export function getLocalReceiptPrintCount(clientTxnId: string): number {
  return getLocalReceiptPrintCountFallback(clientTxnId);
}

/** Backward-compatible alias for older UI code. */
export function setLocalReceiptPrintCount(clientTxnId: string, count: number) {
  setLocalReceiptPrintCountFallback(clientTxnId, count);
}

/**
 * Fallback only. Preferred path is incrementLocalReceiptPrintCount(),
 * which writes to local SQLite and optionally syncs to Neon.
 */
export function incrementLocalReceiptPrintCountFallback(
  clientTxnId: string
): number {
  const next = getLocalReceiptPrintCountFallback(clientTxnId) + 1;
  setLocalReceiptPrintCountFallback(clientTxnId, next);
  return next;
}

async function readJson(response: Response) {
  return response.json().catch(() => null);
}

function readError(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return fallback;
}

/**
 * Preferred local POS print count increment.
 * Writes into local SQLite local_transactions.receipt_print_count.
 * If the transaction is already synced, the server also updates Neon using
 * setReceiptPrintCountAtLeast() so cloud count never goes backward.
 */
export async function incrementLocalReceiptPrintCount(
  clientTxnId: string
): Promise<LocalReceiptPrintResult> {
  const fallbackBefore = getLocalReceiptPrintCountFallback(clientTxnId);

  const response = await fetch(
    `/api/local/transactions/${encodeURIComponent(clientTxnId)}/receipt-print`,
    { method: "POST" }
  );

  const data = await readJson(response);

  if (!response.ok) {
    const fallbackCount = incrementLocalReceiptPrintCountFallback(clientTxnId);

    return {
      clientTxnId,
      serverTransactionId: null,
      receiptPrintCount: Math.max(fallbackBefore + 1, fallbackCount),
      cloudSync: null,
    };
  }

  const nextCount = Number(data?.receiptPrintCount ?? 0);
  const safeCount = Number.isFinite(nextCount)
    ? nextCount
    : incrementLocalReceiptPrintCountFallback(clientTxnId);

  setLocalReceiptPrintCountFallback(clientTxnId, safeCount);

  return {
    clientTxnId: String(data?.clientTxnId ?? clientTxnId),
    serverTransactionId:
      data?.serverTransactionId != null ? Number(data.serverTransactionId) : null,
    receiptPrintCount: safeCount,
    cloudSync: data?.cloudSync ?? null,
  };
}

export async function fetchCloudReceiptPrintCount(
  transactionId: number
): Promise<number> {
  const response = await fetch(`/api/transactions/${transactionId}/receipt-print`, {
    cache: "no-store",
  });

  const data = await readJson(response);

  if (!response.ok) return 0;

  return Number(
    data?.receiptPrintCount ??
      data?.printCount ??
      data?.count ??
      0
  );
}

export async function incrementCloudReceiptPrintCount(
  transactionId: number
): Promise<CloudReceiptPrintResult> {
  const response = await fetch(`/api/transactions/${transactionId}/receipt-print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(readError(data, "Failed to update receipt print count."));
  }

  return {
    transactionId: Number(data?.transactionId ?? transactionId),
    receiptPrintCount: Number(
      data?.receiptPrintCount ??
        data?.printCount ??
        data?.count ??
        0
    ),
  };
}

/**
 * Backward-compatible alias for existing TransactionsTab code.
 */
export async function logCloudReceiptPrint(
  transactionId: number,
  _printedBy?: string | null
): Promise<number> {
  const result = await incrementCloudReceiptPrintCount(transactionId);
  return result.receiptPrintCount;
}

export async function fetchEventReceiptPrintCounts(
  eventId: number
): Promise<Record<number, number>> {
  const response = await fetch(`/api/events/${eventId}/transactions/print-counts`, {
    cache: "no-store",
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(readError(data, "Failed to load receipt print counts."));
  }

  const raw = data?.counts ?? {};
  const mapped: Record<number, number> = {};

  for (const [transactionId, count] of Object.entries(raw)) {
    mapped[Number(transactionId)] = Number(count ?? 0);
  }

  return mapped;
}

export async function syncLocalReceiptPrintCounts(eventId: number) {
  const response = await fetch(
    `/api/local/events/${eventId}/receipt-print-counts/sync`,
    { method: "POST" }
  );

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      readError(data, "Failed to sync local receipt print counts.")
    );
  }

  return data;
}
