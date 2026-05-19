// lib/local-pos.ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { localDb } from "@/lib/local-db";
import {
  localEvents,
  localEventItems,
  localPaymentMethods,
  localPromos,
  localCashierSessions,
  localCashDrawerCounts,
  localTransactions,
  localTransactionItems,
  localSyncLogs,
} from "@/lib/local-db/schema";

import { getAllEvents, getEventItems } from "@/lib/events";
import { getPromosByEvent } from "@/lib/promos";
import { getActivePaymentMethods } from "@/lib/payment-methods";
import { createTransaction, setReceiptPrintCountAtLeast } from "@/lib/transactions";
import {
  formatEventTransactionDisplayId,
  getTransactionMonthPrefix,
  parseEventTransactionSequence,
} from "@/lib/transaction-ids";
import { db } from "@/lib/db";
import { cashierSessions, cashDrawerCounts } from "@/lib/db/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LocalCartItemPayload = {
  eventItemId: number;
  itemId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmt: number;
  finalPrice: number;
  subtotal: number;
  promoApplied: string | null;
};

export type LocalTransactionPayload = {
  clientTxnId: string;
  displayId?: string | null;
  eventId: number;
  items: LocalCartItemPayload[];
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentReference?: string | null;
  cashTendered?: number | null;
  changeAmount?: number | null;
  cashierSessionId?: number | null;
  // Cashier name stamped at sale time — survives even before session sync
  cashierName?: string | null;
  createdAt?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function makeLocalClientTxnId(eventCodeOrId: string | number) {
  return `LOCAL-EV${eventCodeOrId}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export function getLocalEventCode(eventId: number) {
  const event = localDb
    .select({ code: localEvents.code })
    .from(localEvents)
    .where(eq(localEvents.id, eventId))
    .limit(1)
    .get();

  if (!event?.code || !/^\d{4}$/.test(event.code)) {
    throw new Error(
      "Local event is missing the 4-digit event code. Prepare the event offline again."
    );
  }

  return event.code;
}

export function generateLocalDisplayId(eventId: number, date = new Date()) {
  const eventCode = getLocalEventCode(eventId);
  const prefix = getTransactionMonthPrefix(eventCode, date);

  const rows = localDb
    .select({ displayId: localTransactions.displayId })
    .from(localTransactions)
    .where(eq(localTransactions.eventId, eventId))
    .all();

  const lastSeq = rows
    .map((row) => String(row.displayId ?? ""))
    .filter((displayId) => displayId.startsWith(prefix))
    .reduce((max, displayId) => Math.max(max, parseEventTransactionSequence(displayId)), 0);

  return formatEventTransactionDisplayId(eventCode, date, lastSeq + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prepare local event data
// ─────────────────────────────────────────────────────────────────────────────

export async function prepareEventOffline(eventId: number) {
  const [allEvents, items, promos, paymentMethods] = await Promise.all([
    getAllEvents(),
    getEventItems(eventId),
    getPromosByEvent(eventId),
    getActivePaymentMethods(),
  ]);

  const event = allEvents.find((row) => row.id === eventId);

  if (!event) {
    throw new Error("Event not found.");
  }

  localDb.transaction((tx) => {
    tx.delete(localPromos).where(eq(localPromos.eventId, eventId)).run();
    tx.delete(localEventItems).where(eq(localEventItems.eventId, eventId)).run();
    tx.delete(localEvents).where(eq(localEvents.id, eventId)).run();

    tx.insert(localEvents)
      .values({
        id: event.id,
        code: event.code,
        verifierCode: event.verifierCode,
        name: event.name,
        status: event.status,
        location: event.location,
        startDate: event.startDate ? String(event.startDate) : null,
        endDate: event.endDate ? String(event.endDate) : null,
        dataJson: JSON.stringify(event),
        preparedAt: nowIso(),
      })
      .run();

    if (items.length > 0) {
      tx.insert(localEventItems)
        .values(
          items.map((item) => ({
            id: item.id,
            eventId: item.eventId,
            itemId: item.itemId,
            baseItemNo: item.baseItemNo,
            name: item.name,
            color: item.color,
            variantCode: item.variantCode,
            unit: item.unit ?? "PCS",
            netPrice: String(item.netPrice),
            retailPrice: String(item.retailPrice),
            stock: Number(item.stock ?? 0),
            originalStock: Number(item.stock ?? 0),
          }))
        )
        .run();
    }

    if (promos.length > 0) {
      tx.insert(localPromos)
        .values(
          promos.map((promo) => ({
            id: promo.id,
            eventId,
            name: promo.name,
            dataJson: JSON.stringify(promo),
          }))
        )
        .run();
    }

    tx.delete(localPaymentMethods).run();

    if (paymentMethods.length > 0) {
      tx.insert(localPaymentMethods)
        .values(
          paymentMethods.map((method) => ({
            id: method.id,
            name: method.name,
            type: method.type,
            edcMethod: (method as any).edcMethod ?? null,
            edcMachineId: (method as any).edcMachineId ?? null,
            provider: method.provider,
            accountInfo: method.accountInfo,
            isActive: method.isActive ? 1 : 0,
            sortOrder: Number(method.sortOrder ?? 0),
          }))
        )
        .run();
    }

    tx.insert(localSyncLogs)
      .values({
        eventId,
        message: `Prepared offline data for ${event.name}`,
        createdAt: nowIso(),
      })
      .run();
  });

  return getLocalEventBundle(eventId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Read local event data
// ─────────────────────────────────────────────────────────────────────────────

export async function getLocalEventBundle(eventId: number) {
  const event = localDb
    .select()
    .from(localEvents)
    .where(eq(localEvents.id, eventId))
    .limit(1)
    .get();

  if (!event) {
    throw new Error("Event is not prepared offline yet.");
  }

  const items = localDb
    .select()
    .from(localEventItems)
    .where(eq(localEventItems.eventId, eventId))
    .orderBy(localEventItems.name)
    .all();

  const promos = localDb
    .select()
    .from(localPromos)
    .where(eq(localPromos.eventId, eventId))
    .all();

  const paymentMethods = localDb
    .select()
    .from(localPaymentMethods)
    .where(eq(localPaymentMethods.isActive, 1))
    .orderBy(localPaymentMethods.sortOrder)
    .all();

  return {
    event,
    items,
    promos: promos.map((promo) => JSON.parse(promo.dataJson)),
    paymentMethods,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Create local transaction
// ─────────────────────────────────────────────────────────────────────────────

export async function createLocalTransaction(payload: LocalTransactionPayload) {
  if (!payload.clientTxnId) {
    throw new Error("clientTxnId is required.");
  }

  if (!payload.items || payload.items.length === 0) {
    throw new Error("Transaction must have at least one item.");
  }

  const result = localDb.transaction((tx) => {
    const existing = tx
      .select()
      .from(localTransactions)
      .where(eq(localTransactions.clientTxnId, payload.clientTxnId))
      .limit(1)
      .get();

    if (existing) {
      return existing;
    }

    for (const item of payload.items) {
      const localItem = tx
        .select()
        .from(localEventItems)
        .where(
          and(
            eq(localEventItems.id, item.eventItemId),
            eq(localEventItems.eventId, payload.eventId)
          )
        )
        .limit(1)
        .get();

      if (!localItem) {
        throw new Error(`Item ${item.itemId} not found locally.`);
      }

      const currentStock = Number(localItem.stock ?? 0);
      const nextStock = currentStock - Number(item.quantity);

      tx.update(localEventItems)
        .set({ stock: nextStock })
        .where(eq(localEventItems.id, item.eventItemId))
        .run();
    }

    const eventCode = getLocalEventCode(payload.eventId);
    const createdAt = payload.createdAt ?? nowIso();

    const txn = tx
      .insert(localTransactions)
      .values({
        clientTxnId: payload.clientTxnId,
        displayId:
          payload.displayId ??
          generateLocalDisplayId(payload.eventId, new Date(createdAt)),
        eventId: payload.eventId,
        eventCode,
        cashierSessionId: payload.cashierSessionId ?? null,
        cashierName: payload.cashierName ?? null,
        totalAmount: String(payload.totalAmount),
        discount: String(payload.discount),
        finalAmount: String(payload.finalAmount),
        paymentMethod: payload.paymentMethod,
        paymentReference: payload.paymentReference ?? null,
        cashTendered:
          payload.cashTendered != null ? String(payload.cashTendered) : null,
        changeAmount:
          payload.changeAmount != null ? String(payload.changeAmount) : null,
        createdAt,
        syncStatus: "pending",
        receiptPrintCount: 0,
      })
      .returning()
      .get();

    tx.insert(localTransactionItems)
      .values(
        payload.items.map((item) => ({
          clientTxnId: payload.clientTxnId,
          eventItemId: item.eventItemId,
          itemId: item.itemId,
          productName: item.productName,
          quantity: Number(item.quantity),
          unitPrice: String(item.unitPrice),
          discountAmt: String(item.discountAmt),
          finalPrice: String(item.finalPrice),
          subtotal: String(item.subtotal),
          promoApplied: item.promoApplied ?? null,
        }))
      )
      .run();

    tx.insert(localSyncLogs)
      .values({
        eventId: payload.eventId,
        message: `Saved local transaction ${payload.clientTxnId}`,
        createdAt: nowIso(),
      })
      .run();

    return txn;
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cashier session helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the most recent open (unclosed) local cashier session for an event,
 * or null if none exists.
 */
export function getActiveLocalCashierSession(eventId: number) {
  return (
    localDb
      .select()
      .from(localCashierSessions)
      .where(
        and(
          eq(localCashierSessions.eventId, eventId),
          sql`${localCashierSessions.closedAt} IS NULL`
        )
      )
      .orderBy(sql`${localCashierSessions.openedAt} desc`)
      .limit(1)
      .get() ?? null
  );
}

/**
 * Opens a new local cashier session. Returns the created row.
 */
export function openLocalCashierSession(
  eventId: number,
  cashierName: string,
  openingCash = 0
) {
  return localDb
    .insert(localCashierSessions)
    .values({
      eventId,
      cashierName,
      openingCash: String(openingCash),
      openedAt: nowIso(),
      syncStatus: "pending",
    })
    .returning()
    .get();
}

/**
 * Closes a local cashier session by id.
 */
export function closeLocalCashierSession(
  sessionId: number,
  closingCash?: number,
  notes?: string
) {
  return localDb
    .update(localCashierSessions)
    .set({
      closedAt: nowIso(),
      closingCash: closingCash != null ? String(closingCash) : null,
      notes: notes ?? null,
    })
    .where(eq(localCashierSessions.id, sessionId))
    .returning()
    .get();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash drawer count helpers
// ─────────────────────────────────────────────────────────────────────────────

export function createLocalCashDrawerCount(params: {
  eventId: number;
  cashierSessionId?: number | null;
  countedBy?: string | null;
  expectedCash: number;
  actualCash: number;
  reason?: string;
  notes?: string | null;
}) {
  const diff = params.actualCash - params.expectedCash;

  return localDb
    .insert(localCashDrawerCounts)
    .values({
      eventId:          params.eventId,
      cashierSessionId: params.cashierSessionId ?? null,
      countedBy:        params.countedBy ?? null,
      expectedCash:     String(params.expectedCash),
      actualCash:       String(params.actualCash),
      difference:       String(diff),
      reason:           params.reason ?? "count",
      notes:            params.notes ?? null,
      countedAt:        nowIso(),
      syncStatus:       "pending",
    })
    .returning()
    .get();
}

export function getLocalCashDrawerCounts(eventId: number) {
  return localDb
    .select()
    .from(localCashDrawerCounts)
    .where(eq(localCashDrawerCounts.eventId, eventId))
    .orderBy(sql`${localCashDrawerCounts.countedAt} desc`)
    .all();
}

// ─────────────────────────────────────────────────────────────────────────────
// Local transaction reads
// ─────────────────────────────────────────────────────────────────────────────

export async function getLocalTransactionsByEvent(eventId: number) {
  return localDb
    .select()
    .from(localTransactions)
    .where(eq(localTransactions.eventId, eventId))
    .orderBy(sql`${localTransactions.createdAt} desc`)
    .all();
}

export async function getLocalTransactionByClientTxnId(clientTxnId: string) {
  const txn = localDb
    .select()
    .from(localTransactions)
    .where(eq(localTransactions.clientTxnId, clientTxnId))
    .limit(1)
    .get();

  return txn ?? null;
}

export async function getLocalTransactionItems(clientTxnId: string) {
  return localDb
    .select()
    .from(localTransactionItems)
    .where(eq(localTransactionItems.clientTxnId, clientTxnId))
    .orderBy(localTransactionItems.id)
    .all();
}

export async function getUnsyncedLocalTransactions(eventId: number) {
  const txns = localDb
    .select()
    .from(localTransactions)
    .where(
      and(
        eq(localTransactions.eventId, eventId),
        inArray(localTransactions.syncStatus, ["pending", "failed"])
      )
    )
    .orderBy(localTransactions.createdAt)
    .all();

  if (txns.length === 0) return [];

  const ids = txns.map((txn) => txn.clientTxnId);

  const items = localDb
    .select()
    .from(localTransactionItems)
    .where(inArray(localTransactionItems.clientTxnId, ids))
    .all();

  return txns.map((txn) => ({
    ...txn,
    items: items.filter((item) => item.clientTxnId === txn.clientTxnId),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Receipt print count helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function incrementLocalReceiptPrintCount(clientTxnId: string) {
  const txn = await getLocalTransactionByClientTxnId(clientTxnId);

  if (!txn) {
    throw new Error(`Local transaction "${clientTxnId}" not found.`);
  }

  const nextCount = Number(txn.receiptPrintCount ?? 0) + 1;

  localDb
    .update(localTransactions)
    .set({ receiptPrintCount: nextCount })
    .where(eq(localTransactions.clientTxnId, clientTxnId))
    .run();

  let cloudSync:
    | {
        transactionId: number;
        localPrintCount: number;
        cloudBefore: number;
        inserted: number;
        cloudAfter: number;
      }
    | null = null;

  if (txn.serverTransactionId) {
    const updated = await setReceiptPrintCountAtLeast(
      Number(txn.serverTransactionId),
      nextCount
    );

    cloudSync = {
      transactionId: updated.id,
      localPrintCount: nextCount,
      cloudBefore: Number(updated.receiptPrintCount ?? 0),
      inserted: 0,
      cloudAfter: Number(updated.receiptPrintCount ?? 0),
    };
  }

  return {
    clientTxnId,
    serverTransactionId: txn.serverTransactionId ?? null,
    receiptPrintCount: nextCount,
    cloudSync,
  };
}

export async function syncLocalReceiptPrintCountsToNeon(eventId: number) {
  const txns = localDb
    .select()
    .from(localTransactions)
    .where(eq(localTransactions.eventId, eventId))
    .all();

  const rowsToSync = txns.filter(
    (txn) =>
      txn.serverTransactionId != null &&
      Number(txn.receiptPrintCount ?? 0) > 0
  );

  const results: {
    clientTxnId: string;
    serverTransactionId: number;
    localPrintCount: number;
    cloudBefore: number;
    inserted: number;
    cloudAfter: number;
  }[] = [];

  for (const txn of rowsToSync) {
    const result = await setReceiptPrintCountAtLeast(
      Number(txn.serverTransactionId),
      Number(txn.receiptPrintCount ?? 0)
    );

    results.push({
      clientTxnId: txn.clientTxnId,
      serverTransactionId: Number(txn.serverTransactionId),
      localPrintCount: Number(txn.receiptPrintCount ?? 0),
      cloudBefore: Number(result.receiptPrintCount ?? 0),
      inserted: 0,
      cloudAfter: Number(result.receiptPrintCount ?? 0),
    });
  }

  return {
    eventId,
    processed: results.length,
    inserted: results.reduce((sum, row) => sum + row.inserted, 0),
    results,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync cashier sessions to Neon
// Must run BEFORE syncing transactions so serverSessionId FK can be resolved.
// ─────────────────────────────────────────────────────────────────────────────

export async function syncLocalCashierSessionsToNeon(eventId: number) {
  const pending = localDb
    .select()
    .from(localCashierSessions)
    .where(
      and(
        eq(localCashierSessions.eventId, eventId),
        eq(localCashierSessions.syncStatus, "pending")
      )
    )
    .all();

  const results: {
    localId: number;
    ok: boolean;
    serverSessionId?: number;
    error?: string;
  }[] = [];

  for (const session of pending) {
    try {
      const created = await db
        .insert(cashierSessions)
        .values({
          eventId,
          cashierName:  session.cashierName,
          openingCash:  session.openingCash,
          closingCash:  session.closingCash ?? undefined,
          openedAt:     session.openedAt ? new Date(session.openedAt) : undefined,
          closedAt:     session.closedAt ? new Date(session.closedAt) : undefined,
          notes:        session.notes,
        })
        .returning()
        .then((rows) => rows[0]);

      localDb
        .update(localCashierSessions)
        .set({ syncStatus: "synced", serverSessionId: created.id })
        .where(eq(localCashierSessions.id, session.id))
        .run();

      results.push({ localId: session.id, ok: true, serverSessionId: created.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to sync session.";

      localDb
        .update(localCashierSessions)
        .set({ syncStatus: "failed" })
        .where(eq(localCashierSessions.id, session.id))
        .run();

      results.push({ localId: session.id, ok: false, error: msg });
    }
  }

  return {
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync cash drawer counts to Neon
// ─────────────────────────────────────────────────────────────────────────────

export async function syncLocalCashDrawerCountsToNeon(eventId: number) {
  const pending = localDb
    .select()
    .from(localCashDrawerCounts)
    .where(
      and(
        eq(localCashDrawerCounts.eventId, eventId),
        eq(localCashDrawerCounts.syncStatus, "pending")
      )
    )
    .all();

  const results: {
    localId: number;
    ok: boolean;
    serverCountId?: number;
    error?: string;
  }[] = [];

  for (const count of pending) {
    try {
      // Resolve server session id from the local session, if applicable
      let serverSessionId: number | null = null;

      if (count.cashierSessionId) {
        const localSession = localDb
          .select()
          .from(localCashierSessions)
          .where(eq(localCashierSessions.id, count.cashierSessionId))
          .limit(1)
          .get();

        serverSessionId = localSession?.serverSessionId ?? null;
      }

      const created = await db
        .insert(cashDrawerCounts)
        .values({
          eventId,
          cashierSessionId: serverSessionId ?? undefined,
          countedBy:    count.countedBy,
          expectedCash: count.expectedCash,
          actualCash:   count.actualCash,
          difference:   count.difference,
          reason:       count.reason,
          notes:        count.notes,
          countedAt:    count.countedAt ? new Date(count.countedAt) : undefined,
        })
        .returning()
        .then((rows) => rows[0]);

      localDb
        .update(localCashDrawerCounts)
        .set({ syncStatus: "synced", serverCountId: created.id, syncError: null })
        .where(eq(localCashDrawerCounts.id, count.id))
        .run();

      results.push({ localId: count.id, ok: true, serverCountId: created.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to sync drawer count.";

      localDb
        .update(localCashDrawerCounts)
        .set({ syncStatus: "failed", syncError: msg })
        .where(eq(localCashDrawerCounts.id, count.id))
        .run();

      results.push({ localId: count.id, ok: false, error: msg });
    }
  }

  return {
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync local SQLite transactions to Neon
// Order: sessions → transactions → drawer counts → receipt print counts
// ─────────────────────────────────────────────────────────────────────────────

export async function syncLocalTransactionsToNeon(eventId: number) {
  // 1. Sync cashier sessions first so we have serverSessionId for transactions
  const sessionSync = await syncLocalCashierSessionsToNeon(eventId);

  // 2. Build a local-id → server-id map for resolved sessions
  const sessionRows = localDb
    .select()
    .from(localCashierSessions)
    .where(eq(localCashierSessions.eventId, eventId))
    .all();

  const sessionMap = new Map<number, number>();
  for (const s of sessionRows) {
    if (s.serverSessionId) sessionMap.set(s.id, s.serverSessionId);
  }

  // 3. Sync pending transactions
  const pending = await getUnsyncedLocalTransactions(eventId);

  const results: {
    clientTxnId: string;
    ok: boolean;
    transactionId?: number;
    displayId?: string | null;
    receiptPrintCount?: number;
    receiptPrintsSynced?: number;
    error?: string;
  }[] = [];

  for (const txn of pending) {
    try {
      if (!txn.items || txn.items.length === 0) {
        throw new Error("Local transaction has no items.");
      }

      // Resolve server cashier session id (null for anonymous / unsynced sessions)
      const serverCashierSessionId =
        txn.cashierSessionId != null
          ? (sessionMap.get(txn.cashierSessionId) ?? null)
          : null;

      const created = await createTransaction({
        clientTxnId:      txn.clientTxnId,
        displayId:        txn.displayId,
        eventId,
        cashierSessionId: serverCashierSessionId,
        cashierName:      (txn as any).cashierName ?? null,
        totalAmount:      toNumber(txn.totalAmount),
        discount:         toNumber(txn.discount),
        finalAmount:      toNumber(txn.finalAmount),
        paymentMethod:    txn.paymentMethod,
        paymentReference: txn.paymentReference,
        cashTendered:
          txn.cashTendered != null ? toNumber(txn.cashTendered) : null,
        changeAmount:
          txn.changeAmount != null ? toNumber(txn.changeAmount) : null,
        receiptPrintCount: Number(txn.receiptPrintCount ?? 0),
        createdAt: txn.createdAt,

        items: txn.items.map((item) => ({
          eventItemId:  item.eventItemId,
          itemId:       item.itemId,
          productName:  item.productName,
          quantity:     Number(item.quantity),
          unitPrice:    toNumber(item.unitPrice),
          discountAmt:  toNumber(item.discountAmt),
          finalPrice:   toNumber(item.finalPrice),
          subtotal:     toNumber(item.subtotal),
          promoApplied: item.promoApplied ?? null,
        })),
      });

      localDb
        .update(localTransactions)
        .set({
          syncStatus:          "synced",
          serverTransactionId: created.id,
          syncError:           null,
        })
        .where(eq(localTransactions.clientTxnId, txn.clientTxnId))
        .run();

      const receiptSync =
        Number(txn.receiptPrintCount ?? 0) > 0
          ? await setReceiptPrintCountAtLeast(
              created.id,
              Number(txn.receiptPrintCount ?? 0)
            )
          : null;

      localDb
        .insert(localSyncLogs)
        .values({
          eventId,
          message: `Synced local transaction ${txn.clientTxnId} to cloud transaction #${created.id}`,
          createdAt: nowIso(),
        })
        .run();

      results.push({
        clientTxnId:        txn.clientTxnId,
        ok:                 true,
        transactionId:      created.id,
        displayId:          created.displayId ?? null,
        receiptPrintCount:  Number(txn.receiptPrintCount ?? 0),
        receiptPrintsSynced: receiptSync ? Number(receiptSync.receiptPrintCount ?? 0) : 0,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sync transaction.";

      localDb
        .update(localTransactions)
        .set({ syncStatus: "failed", syncError: message })
        .where(eq(localTransactions.clientTxnId, txn.clientTxnId))
        .run();

      localDb
        .insert(localSyncLogs)
        .values({
          eventId,
          message: `Failed to sync local transaction ${txn.clientTxnId}: ${message}`,
          createdAt: nowIso(),
        })
        .run();

      results.push({
        clientTxnId: txn.clientTxnId,
        ok: false,
        error: message,
      });
    }
  }

  // 4. Sync cash drawer counts (after sessions so FK resolves)
  const drawerSync = await syncLocalCashDrawerCountsToNeon(eventId);

  // 5. Sync receipt print counts for any newly-synced transactions
  const receiptPrintSync = await syncLocalReceiptPrintCountsToNeon(eventId);

  return {
    success: results.every((result) => result.ok),
    total:   results.length,
    synced:  results.filter((result) => result.ok).length,
    failed:  results.filter((result) => !result.ok).length,
    results,
    sessionSync,
    drawerSync,
    receiptPrintCountSync: {
      inserted: receiptPrintSync.inserted,
      processed: receiptPrintSync.processed,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local stats
// ─────────────────────────────────────────────────────────────────────────────

export async function getLocalEventStats(eventId: number) {
  const txns = localDb
    .select()
    .from(localTransactions)
    .where(eq(localTransactions.eventId, eventId))
    .all();

  const txnIds = txns.map((txn) => txn.clientTxnId);

  const items =
    txnIds.length > 0
      ? localDb
          .select()
          .from(localTransactionItems)
          .where(inArray(localTransactionItems.clientTxnId, txnIds))
          .all()
      : [];

  const stockItems = localDb
    .select()
    .from(localEventItems)
    .where(eq(localEventItems.eventId, eventId))
    .all();

  const todayPrefix = new Date().toISOString().slice(0, 10);

  const todayTxns = txns.filter((txn) =>
    String(txn.createdAt ?? "").startsWith(todayPrefix)
  );

  const todayTxnIds = todayTxns.map((txn) => txn.clientTxnId);

  const todayItems = items.filter((item) =>
    todayTxnIds.includes(item.clientTxnId)
  );

  return {
    txnCount:       txns.length,
    revenue:        txns.reduce((sum, txn) => sum + Number(txn.finalAmount ?? 0), 0),
    discount:       txns.reduce((sum, txn) => sum + Number(txn.discount ?? 0), 0),
    itemsSold:      items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    todayTxnCount:  todayTxns.length,
    todayRevenue:   todayTxns.reduce((sum, txn) => sum + Number(txn.finalAmount ?? 0), 0),
    todayDiscount:  todayTxns.reduce((sum, txn) => sum + Number(txn.discount ?? 0), 0),
    todayItemsSold: todayItems.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    totalUnits:     stockItems.reduce((sum, item) => sum + Number(item.stock ?? 0), 0),
    totalItems:     stockItems.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local POS state
// ─────────────────────────────────────────────────────────────────────────────

export function getLatestPreparedLocalEvent() {
  const event = localDb
    .select()
    .from(localEvents)
    .orderBy(sql`${localEvents.preparedAt} desc`)
    .limit(1)
    .get();

  return event ?? null;
}

export function getLocalPendingSyncCount(eventId: number) {
  const row = localDb
    .select({
      count: sql<number>`count(${localTransactions.clientTxnId})`,
    })
    .from(localTransactions)
    .where(
      and(
        eq(localTransactions.eventId, eventId),
        inArray(localTransactions.syncStatus, ["pending", "failed"])
      )
    )
    .get();

  return Number(row?.count ?? 0);
}

export async function getLocalPOSState() {
  const event = getLatestPreparedLocalEvent();

  if (!event) {
    return {
      hasPreparedEvent: false,
      event: null,
      pendingSyncCount: 0,
    };
  }

  return {
    hasPreparedEvent: true,
    event,
    pendingSyncCount: getLocalPendingSyncCount(event.id),
  };
}

export function getPreparedLocalEvents() {
  return localDb
    .select()
    .from(localEvents)
    .orderBy(sql`${localEvents.preparedAt} desc`)
    .all();
}

export async function getLocalPreparedEventsState() {
  const preparedEvents = getPreparedLocalEvents();

  return {
    events: preparedEvents.map((event) => ({
      ...event,
      pendingSyncCount: getLocalPendingSyncCount(event.id),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete local POS data
// ─────────────────────────────────────────────────────────────────────────────

export function deleteLocalEventData(
  eventId: number,
  options?: { force?: boolean }
) {
  const force = options?.force ?? false;
  const pendingCount = getLocalPendingSyncCount(eventId);

  if (pendingCount > 0 && !force) {
    throw new Error(
      `This local POS still has ${pendingCount} unsynced sale${
        pendingCount > 1 ? "s" : ""
      }. Sync first or use force delete.`
    );
  }

  const txns = localDb
    .select({ clientTxnId: localTransactions.clientTxnId })
    .from(localTransactions)
    .where(eq(localTransactions.eventId, eventId))
    .all();

  const clientTxnIds = txns.map((txn) => txn.clientTxnId);

  localDb.transaction((tx) => {
    if (clientTxnIds.length > 0) {
      tx.delete(localTransactionItems)
        .where(inArray(localTransactionItems.clientTxnId, clientTxnIds))
        .run();
    }

    tx.delete(localTransactions)
      .where(eq(localTransactions.eventId, eventId))
      .run();

    tx.delete(localCashDrawerCounts)
      .where(eq(localCashDrawerCounts.eventId, eventId))
      .run();

    tx.delete(localCashierSessions)
      .where(eq(localCashierSessions.eventId, eventId))
      .run();

    tx.delete(localPromos)
      .where(eq(localPromos.eventId, eventId))
      .run();

    tx.delete(localEventItems)
      .where(eq(localEventItems.eventId, eventId))
      .run();

    tx.delete(localSyncLogs)
      .where(eq(localSyncLogs.eventId, eventId))
      .run();

    tx.delete(localEvents)
      .where(eq(localEvents.id, eventId))
      .run();
  });

  return {
    success: true,
    eventId,
    deletedClientTransactions: clientTxnIds.length,
  };
}