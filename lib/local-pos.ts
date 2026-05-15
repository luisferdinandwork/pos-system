// lib/local-pos.ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { localDb } from "@/lib/local-db";
import {
  localEvents,
  localEventItems,
  localPaymentMethods,
  localPromos,
  localTransactions,
  localTransactionItems,
  localSyncLogs,
} from "@/lib/local-db/schema";

import { getAllEvents, getEventItems } from "@/lib/events";
import { getPromosByEvent } from "@/lib/promos";
import { getActivePaymentMethods } from "@/lib/payment-methods";
import { createTransaction } from "@/lib/transactions";

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
  eventId: number;
  items: LocalCartItemPayload[];
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentReference?: string | null;
  // Cash payment fields
  cashTendered?: number | null;
  changeAmount?: number | null;
  // Cashier session (optional)
  cashierSessionId?: number | null;
  createdAt?: string;
};

function nowIso() {
  return new Date().toISOString();
}

export function makeLocalClientTxnId(eventId: number) {
  return `LOCAL-EV${eventId}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function toNumber(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Copies one event from Neon into local SQLite.
 * This is what you run before the event starts.
 */
export async function prepareEventOffline(eventId: number) {
  const [events, items, promos, paymentMethods] = await Promise.all([
    getAllEvents(),
    getEventItems(eventId),
    getPromosByEvent(eventId),
    getActivePaymentMethods(),
  ]);

  const event = events.find((row) => row.id === eventId);

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
            // ── NEW: persist EDC sub-type fields ──────────────────────────
            edcMethod: (method as any).edcMethod ?? null,
            edcMachineId: (method as any).edcMachineId ?? null,
            // ─────────────────────────────────────────────────────────────
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

/**
 * Reads event data from local SQLite.
 */
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

/**
 * Saves a POS sale into local SQLite (offline-capable).
 * Now supports cash tendered / change and cashier session tracking.
 */
export async function createLocalTransaction(payload: LocalTransactionPayload) {
  if (!payload.clientTxnId) {
    throw new Error("clientTxnId is required.");
  }

  if (!payload.items.length) {
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

    // Deduct stock for each item
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

    // Insert transaction row — include cash fields + cashier session
    const txn = tx
      .insert(localTransactions)
      .values({
        clientTxnId:      payload.clientTxnId,
        eventId:          payload.eventId,
        cashierSessionId: payload.cashierSessionId ?? null,
        totalAmount:      String(payload.totalAmount),
        discount:         String(payload.discount),
        finalAmount:      String(payload.finalAmount),
        paymentMethod:    payload.paymentMethod,
        paymentReference: payload.paymentReference ?? null,
        cashTendered:     payload.cashTendered != null ? String(payload.cashTendered) : null,
        changeAmount:     payload.changeAmount  != null ? String(payload.changeAmount)  : null,
        createdAt:        payload.createdAt ?? nowIso(),
        syncStatus:       "pending",
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
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          discountAmt: String(item.discountAmt),
          finalPrice: String(item.finalPrice),
          subtotal: String(item.subtotal),
          promoApplied: item.promoApplied,
        }))
      )
      .run();

    return txn;
  });

  return result;
}

export async function getLocalTransactionsByEvent(eventId: number) {
  return localDb
    .select()
    .from(localTransactions)
    .where(eq(localTransactions.eventId, eventId))
    .orderBy(sql`${localTransactions.createdAt} desc`)
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

/**
 * Sends unsynced local transactions to Neon.
 */
export async function syncLocalTransactionsToNeon(eventId: number) {
  const pending = await getUnsyncedLocalTransactions(eventId);

  const results: {
    clientTxnId: string;
    ok: boolean;
    transactionId?: number;
    error?: string;
  }[] = [];

  for (const txn of pending) {
    try {
      const created = await createTransaction({
        clientTxnId:      txn.clientTxnId,
        eventId,
        cashierSessionId: txn.cashierSessionId ?? null,
        totalAmount:      toNumber(txn.totalAmount),
        discount:         toNumber(txn.discount),
        finalAmount:      toNumber(txn.finalAmount),
        paymentMethod:    txn.paymentMethod,
        paymentReference: txn.paymentReference,
        cashTendered:     txn.cashTendered != null ? toNumber(txn.cashTendered) : null,
        changeAmount:     txn.changeAmount  != null ? toNumber(txn.changeAmount)  : null,
        createdAt:        txn.createdAt,
        items: txn.items.map((item) => ({
          eventItemId:  item.eventItemId,
          itemId:       item.itemId,
          productName:  item.productName,
          quantity:     item.quantity,
          unitPrice:    toNumber(item.unitPrice),
          discountAmt:  toNumber(item.discountAmt),
          finalPrice:   toNumber(item.finalPrice),
          subtotal:     toNumber(item.subtotal),
          promoApplied: item.promoApplied,
        })),
      });

      localDb
        .update(localTransactions)
        .set({
          syncStatus: "synced",
          serverTransactionId: created.id,
          syncError: null,
        })
        .where(eq(localTransactions.clientTxnId, txn.clientTxnId))
        .run();

      results.push({
        clientTxnId: txn.clientTxnId,
        ok: true,
        transactionId: created.id,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sync transaction.";

      localDb
        .update(localTransactions)
        .set({
          syncStatus: "failed",
          syncError: message,
        })
        .where(eq(localTransactions.clientTxnId, txn.clientTxnId))
        .run();

      results.push({
        clientTxnId: txn.clientTxnId,
        ok: false,
        error: message,
      });
    }
  }

  localDb
    .insert(localSyncLogs)
    .values({
      eventId,
      message: `Sync complete. ${results.filter((r) => r.ok).length} synced, ${
        results.filter((r) => !r.ok).length
      } failed.`,
      createdAt: nowIso(),
    })
    .run();

  return {
    success: results.every((result) => result.ok),
    total: results.length,
    synced: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}

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

  const txnCount = txns.length;
  const revenue = txns.reduce((sum, txn) => sum + Number(txn.finalAmount ?? 0), 0);
  const discount = txns.reduce((sum, txn) => sum + Number(txn.discount ?? 0), 0);
  const itemsSold = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);

  const todayTxnCount  = todayTxns.length;
  const todayRevenue   = todayTxns.reduce((sum, txn) => sum + Number(txn.finalAmount ?? 0), 0);
  const todayDiscount  = todayTxns.reduce((sum, txn) => sum + Number(txn.discount ?? 0), 0);
  const todayItemsSold = todayItems.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);

  const totalUnits = stockItems.reduce((sum, item) => sum + Number(item.stock ?? 0), 0);
  const totalItems = stockItems.length;

  return {
    txnCount,
    revenue,
    discount,
    itemsSold,
    todayTxnCount,
    todayRevenue,
    todayDiscount,
    todayItemsSold,
    totalUnits,
    totalItems,
  };
}

export function getLatestPreparedLocalEvent() {
  const event = localDb
    .select()
    .from(localEvents)
    .orderBy(sql`${localEvents.preparedAt} desc`)
    .limit(1)
    .get();

  return event ?? null;
}

export async function getLocalPOSState() {
  const event = getLatestPreparedLocalEvent();

  if (!event) {
    return { hasPreparedEvent: false, event: null, pendingSyncCount: 0 };
  }

  const [pendingRow] = localDb
    .select({ count: sql<number>`count(${localTransactions.clientTxnId})` })
    .from(localTransactions)
    .where(
      and(
        eq(localTransactions.eventId, event.id),
        inArray(localTransactions.syncStatus, ["pending", "failed"])
      )
    )
    .all();

  return {
    hasPreparedEvent: true,
    event,
    pendingSyncCount: Number(pendingRow?.count ?? 0),
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

  const eventsWithPending = preparedEvents.map((event) => {
    const pendingRow = localDb
      .select({ count: sql<number>`count(${localTransactions.clientTxnId})` })
      .from(localTransactions)
      .where(
        and(
          eq(localTransactions.eventId, event.id),
          inArray(localTransactions.syncStatus, ["pending", "failed"])
        )
      )
      .get();

    return {
      ...event,
      pendingSyncCount: Number(pendingRow?.count ?? 0),
    };
  });

  return { events: eventsWithPending };
}

export function getLocalPendingSyncCount(eventId: number) {
  const row = localDb
    .select({ count: sql<number>`count(${localTransactions.clientTxnId})` })
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
    tx.delete(localTransactions).where(eq(localTransactions.eventId, eventId)).run();
    tx.delete(localPromos).where(eq(localPromos.eventId, eventId)).run();
    tx.delete(localEventItems).where(eq(localEventItems.eventId, eventId)).run();
    tx.delete(localSyncLogs).where(eq(localSyncLogs.eventId, eventId)).run();
    tx.delete(localEvents).where(eq(localEvents.id, eventId)).run();
  });

  return {
    success: true,
    eventId,
    deletedClientTransactions: clientTxnIds.length,
  };
}