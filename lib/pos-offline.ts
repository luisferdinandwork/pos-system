// lib/pos-offline.ts

export type OfflineEventRow = {
  id: number;
  name: string;
  status: string;
  location: string | null;
};

export type OfflineEventItem = {
  id: number;
  stock: number;
  retailPrice: string;
  netPrice: string;
  itemId: string;
  name: string;
  color: string | null;
  variantCode: string | null;
  unit: string | null;
};

export type OfflinePaymentMethod = {
  id: number;
  name: string;
  type: string;
  provider: string | null;
};

export type OfflinePromo = Record<string, unknown>;

export type OfflineBundle = {
  cachedAt: string;
  event: OfflineEventRow;
  items: OfflineEventItem[];
  promos: OfflinePromo[];
  paymentMethods: OfflinePaymentMethod[];
};

export type OfflineCartItemPayload = {
  eventItemId: number;
  itemId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmt: number;
  finalPrice: number;
  subtotal: number;
  promoApplied: string | null;
  freeQty?: number;
};

export type OfflineTransaction = {
  clientTxnId: string;
  eventId: number;
  items: OfflineCartItemPayload[];
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentReference: string | null;
  createdAt: string;
  syncStatus: "pending" | "synced" | "failed";
  serverTransactionId?: number;
  syncError?: string;
};

function bundleKey(eventId: number) {
  return `pos:offline:bundle:${eventId}`;
}

function txnsKey(eventId: number) {
  return `pos:offline:txns:${eventId}`;
}

export function makeClientTxnId(eventId: number) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `EV${eventId}-${random}`;
}

export function saveOfflineBundle(bundle: OfflineBundle) {
  localStorage.setItem(
    bundleKey(bundle.event.id),
    JSON.stringify(bundle)
  );
}

export function getOfflineBundle(eventId: number): OfflineBundle | null {
  const raw = localStorage.getItem(bundleKey(eventId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as OfflineBundle;
  } catch {
    return null;
  }
}

export function getOfflineTransactions(eventId: number): OfflineTransaction[] {
  const raw = localStorage.getItem(txnsKey(eventId));
  if (!raw) return [];

  try {
    return JSON.parse(raw) as OfflineTransaction[];
  } catch {
    return [];
  }
}

export function saveOfflineTransactions(
  eventId: number,
  transactions: OfflineTransaction[]
) {
  localStorage.setItem(
    txnsKey(eventId),
    JSON.stringify(transactions)
  );
}

export function addOfflineTransaction(transaction: OfflineTransaction) {
  const current = getOfflineTransactions(transaction.eventId);

  saveOfflineTransactions(transaction.eventId, [
    ...current,
    transaction,
  ]);
}

export function getPendingOfflineTransactions(eventId: number) {
  return getOfflineTransactions(eventId).filter(
    (txn) => txn.syncStatus === "pending" || txn.syncStatus === "failed"
  );
}

export function markOfflineTransactionsSynced(
  eventId: number,
  results: {
    clientTxnId: string | null;
    ok: boolean;
    transactionId?: number;
    error?: string;
  }[]
) {
  const current = getOfflineTransactions(eventId);

  const resultMap = new Map(
    results
      .filter((result) => result.clientTxnId)
      .map((result) => [result.clientTxnId as string, result])
  );

  const updated = current.map((txn) => {
    const result = resultMap.get(txn.clientTxnId);

    if (!result) {
      return txn;
    }

    if (result.ok) {
      return {
        ...txn,
        syncStatus: "synced" as const,
        serverTransactionId: result.transactionId,
        syncError: undefined,
      };
    }

    return {
      ...txn,
      syncStatus: "failed" as const,
      syncError: result.error ?? "Failed to sync",
    };
  });

  const unmatchedResults = results.filter(
    (result) =>
      result.clientTxnId &&
      !current.some((txn) => txn.clientTxnId === result.clientTxnId)
  );

  if (unmatchedResults.length > 0) {
    console.warn(
      "[POS Sync] Server returned clientTxnId not found locally:",
      unmatchedResults
    );
  }

  saveOfflineTransactions(eventId, updated);
}

export function applyLocalStockDeduction(
  bundle: OfflineBundle,
  items: OfflineCartItemPayload[]
): OfflineBundle {
  const soldMap = new Map<number, number>();

  for (const item of items) {
    soldMap.set(
      item.eventItemId,
      (soldMap.get(item.eventItemId) ?? 0) + item.quantity
    );
  }

  return {
    ...bundle,
    items: bundle.items.map((item) => {
      const sold = soldMap.get(item.id) ?? 0;

      return {
        ...item,
        stock: Math.max(0, Number(item.stock ?? 0) - sold),
      };
    }),
  };
}