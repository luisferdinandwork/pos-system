// lib/local-pos.ts
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";
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
import {
  createTransaction,
  setReceiptPrintCountAtLeast,
  voidTransaction,
} from "@/lib/transactions";
import {
  formatEventTransactionDisplayId,
  getTransactionMonthPrefix,
  normalizeEventCode,
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
  cashierName?: string | null;
  createdAt?: string;
};

export type VoidLocalTransactionResult = {
  clientTxnId: string;
  voidedAt: string;
  cloudVoided: boolean;
  cloudError?: string;
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

  if (!event?.code) {
    throw new Error(
      "Local event is missing its event code. Prepare the event offline again."
    );
  }

  try {
    return normalizeEventCode(event.code);
  } catch {
    throw new Error(
      "Local event has an invalid event code. Prepare the event offline again."
    );
  }
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

// better-sqlite3 rejects a single statement once its bound parameter count
// crosses SQLite's variable limit (999 on many builds). Bulk inserts built
// from `array.map(...)` scale params as rows * columns, so wide tables with
// enough rows (e.g. an event with 100+ items) can blow past that — chunk
// them into batches that stay safely under the limit regardless of column count.
const SQLITE_INSERT_BATCH_SIZE = 50;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
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

  // Any local sale that hasn't reached the cloud yet is still holding its
  // stock reservation locally. Re-preparing this event (the manual "Refresh"
  // button, or the auto re-pull that runs right after a sync) must not
  // silently hand that reserved stock back by overwriting it with the fresh
  // cloud value — otherwise a pending/failed sale's items look available
  // again and can be oversold.
  // A sale that's been voided (a reversing row now exists for it) no longer
  // holds a real stock reservation — voidLocalTransaction() already added its
  // stock back directly. Excluding it here (instead of relying on a status
  // flip that no longer happens on the original row) stops re-prepare from
  // double-subtracting that stock and stranding a phantom reservation.
  const voidedOriginalIds = localDb
    .select({ voidOfClientTxnId: localTransactions.voidOfClientTxnId })
    .from(localTransactions)
    .where(
      and(
        eq(localTransactions.eventId, eventId),
        sql`${localTransactions.voidOfClientTxnId} IS NOT NULL`
      )
    )
    .all()
    .map((row) => row.voidOfClientTxnId)
    .filter((id): id is string => Boolean(id));

  const reservedByItem = new Map<number, number>();
  const reservedRows = localDb
    .select({
      eventItemId: localTransactionItems.eventItemId,
      quantity: localTransactionItems.quantity,
    })
    .from(localTransactionItems)
    .innerJoin(
      localTransactions,
      eq(localTransactionItems.clientTxnId, localTransactions.clientTxnId)
    )
    .where(
      and(
        eq(localTransactions.eventId, eventId),
        inArray(localTransactions.syncStatus, ["pending", "failed"]),
        sql`${localTransactions.voidOfClientTxnId} IS NULL`,
        voidedOriginalIds.length > 0
          ? notInArray(localTransactions.clientTxnId, voidedOriginalIds)
          : sql`1=1`
      )
    )
    .all();

  for (const row of reservedRows) {
    reservedByItem.set(
      row.eventItemId,
      (reservedByItem.get(row.eventItemId) ?? 0) + Number(row.quantity ?? 0)
    );
  }

  localDb.transaction((tx) => {
    tx.delete(localPromos).where(eq(localPromos.eventId, eventId)).run();
    tx.delete(localEventItems).where(eq(localEventItems.eventId, eventId)).run();
    tx.delete(localEvents).where(eq(localEvents.id, eventId)).run();

    // Event item/promo ids mirror the cloud DB's global serial ids. If the
    // cloud DB was reset and reseeded, those serials can restart and collide
    // with stale rows still cached locally under a different event id — purge
    // any such leftovers before inserting so the id-based primary keys stay valid.
    for (const chunk of chunkArray(items.map((item) => item.id), SQLITE_INSERT_BATCH_SIZE)) {
      if (chunk.length > 0) {
        tx.delete(localEventItems).where(inArray(localEventItems.id, chunk)).run();
      }
    }

    for (const chunk of chunkArray(promos.map((promo) => promo.id), SQLITE_INSERT_BATCH_SIZE)) {
      if (chunk.length > 0) {
        tx.delete(localPromos).where(inArray(localPromos.id, chunk)).run();
      }
    }

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

    for (const chunk of chunkArray(items, SQLITE_INSERT_BATCH_SIZE)) {
      tx.insert(localEventItems)
        .values(
          chunk.map((item) => {
            const freshStock = Number(item.stock ?? 0);
            const reserved = reservedByItem.get(item.id) ?? 0;

            return {
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
              stock: freshStock - reserved,
              originalStock: freshStock,
            };
          })
        )
        .run();
    }

    for (const chunk of chunkArray(promos, SQLITE_INSERT_BATCH_SIZE)) {
      tx.insert(localPromos)
        .values(
          chunk.map((promo) => ({
            id: promo.id,
            eventId,
            name: promo.name,
            dataJson: JSON.stringify(promo),
          }))
        )
        .run();
    }

    tx.delete(localPaymentMethods).run();

    for (const chunk of chunkArray(paymentMethods, SQLITE_INSERT_BATCH_SIZE)) {
      tx.insert(localPaymentMethods)
        .values(
          chunk.map((method) => ({
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

    for (const chunk of chunkArray(payload.items, SQLITE_INSERT_BATCH_SIZE)) {
      tx.insert(localTransactionItems)
        .values(
          chunk.map((item) => ({
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
    }

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
// Void local transaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Voids a local transaction the same way the cloud does it (see
 * lib/transactions.ts::voidTransaction, which this mirrors on purpose):
 * 1. The original row is NEVER mutated in place — it stays "completed" so
 *    it keeps showing as a normal sale. Only voidedAt/voidedBy/voidReason
 *    are stamped on it (audit trail + the "already voided" guard).
 * 2. A new reversing row is inserted (status="void", voidOfClientTxnId
 *    pointing back at the original) with negative amounts and negative
 *    line-item quantities/subtotals, mirroring the original's items.
 * 3. Stock is added back on local_event_items immediately, regardless of
 *    connectivity.
 *
 * Keeping this additive — instead of the old "flip status on the same row"
 * model — is what makes the local POS export (buildLocalTransactionsExcel)
 * match the full-event export shape, and makes local revenue/items-sold
 * stats net out a void automatically via SUM() instead of staying wrong.
 *
 * If the original transaction was already synced to Neon (serverTransactionId
 * is set), this also voids it there — which is where the real reversing
 * ledger entry (transactions row + stock_transactions row) lives. If that
 * cloud call fails (e.g. offline), voidSyncStatus is marked "failed" so
 * syncLocalVoidsToNeon() retries it automatically on the next sync.
 */
export async function voidLocalTransaction(
  clientTxnId: string,
  options: { voidedBy?: string | null; voidReason?: string | null } = {}
): Promise<VoidLocalTransactionResult> {
  const original = localDb
    .select()
    .from(localTransactions)
    .where(eq(localTransactions.clientTxnId, clientTxnId))
    .limit(1)
    .get();

  if (!original) {
    throw new Error(`Local transaction "${clientTxnId}" not found.`);
  }

  if ((original as any).voidOfClientTxnId != null) {
    throw new Error("Cannot void a void entry.");
  }

  const existingVoidEntry = localDb
    .select({ clientTxnId: localTransactions.clientTxnId })
    .from(localTransactions)
    .where(eq(localTransactions.voidOfClientTxnId, clientTxnId))
    .limit(1)
    .get();

  if (existingVoidEntry) {
    throw new Error("Transaction is already voided.");
  }

  const items = localDb
    .select()
    .from(localTransactionItems)
    .where(eq(localTransactionItems.clientTxnId, clientTxnId))
    .all();

  const now = nowIso();
  const voidClientTxnId = `VOID-${clientTxnId}`;

  localDb.transaction((tx) => {
    tx.update(localTransactions)
      .set({
        voidedAt: now,
        voidedBy: options.voidedBy ?? null,
        voidReason: options.voidReason ?? null,
      } as any)
      .where(eq(localTransactions.clientTxnId, clientTxnId))
      .run();

    tx.insert(localTransactions)
      .values({
        clientTxnId: voidClientTxnId,
        displayId: `VOID-${original.displayId ?? clientTxnId}`,
        eventId: original.eventId,
        eventCode: original.eventCode,
        cashierSessionId: original.cashierSessionId,
        cashierName: options.voidedBy ?? original.cashierName,
        totalAmount: String(-Number(original.totalAmount)),
        discount: String(-Number(original.discount)),
        finalAmount: String(-Number(original.finalAmount)),
        cashTendered: null,
        changeAmount: null,
        paymentMethod: original.paymentMethod,
        paymentReference: original.paymentReference,
        createdAt: now,
        // This row is a local-only bookkeeping mirror of the cloud reversal —
        // it never gets pushed through createTransaction(), so it's never a
        // sale that needs to sync. getUnsyncedLocalTransactions() also
        // excludes it explicitly via voidOfClientTxnId.
        syncStatus: "synced",
        receiptPrintCount: 0,
        status: "void",
        voidedAt: now,
        voidedBy: options.voidedBy ?? null,
        voidReason: options.voidReason ?? null,
        voidOfClientTxnId: clientTxnId,
      } as any)
      .run();

    for (const chunk of chunkArray(items, SQLITE_INSERT_BATCH_SIZE)) {
      tx.insert(localTransactionItems)
        .values(
          chunk.map((item) => ({
            clientTxnId: voidClientTxnId,
            eventItemId: item.eventItemId,
            itemId: item.itemId,
            productName: item.productName,
            quantity: -item.quantity,
            unitPrice: item.unitPrice,
            discountAmt: item.discountAmt,
            finalPrice: item.finalPrice,
            subtotal: String(-Number(item.subtotal)),
            promoApplied: item.promoApplied,
          }))
        )
        .run();
    }

    for (const item of items) {
      const localItem = tx
        .select()
        .from(localEventItems)
        .where(eq(localEventItems.id, item.eventItemId))
        .limit(1)
        .get();

      if (localItem) {
        const nextStock = Number(localItem.stock ?? 0) + Math.abs(item.quantity);

        tx.update(localEventItems)
          .set({ stock: nextStock })
          .where(eq(localEventItems.id, item.eventItemId))
          .run();
      }
    }

    tx.insert(localSyncLogs)
      .values({
        eventId: original.eventId,
        message: `Voided local transaction ${clientTxnId}${
          options.voidReason ? `: ${options.voidReason}` : ""
        }`,
        createdAt: now,
      })
      .run();
  });

  if (!original.serverTransactionId) {
    // Nothing in the cloud to void RIGHT NOW — voidSyncStatus stays null
    // (not "needs retry") since there's no cloud void to retry yet. The sale
    // itself is still queued to sync normally (getUnsyncedLocalTransactions
    // no longer excludes voided originals), and once it lands, the "voided
    // mid-sync" check in syncLocalTransactionsToNeon() picks up that it's
    // already voided and immediately queues the matching cloud void.
    return { clientTxnId, voidedAt: now, cloudVoided: false };
  }

  try {
    const cloudResult = await voidTransaction(Number(original.serverTransactionId), {
      voidedBy: options.voidedBy ?? null,
      voidReason: options.voidReason ?? null,
    });

    localDb
      .update(localTransactions)
      .set({ voidSyncStatus: "synced", voidSyncError: null } as any)
      .where(eq(localTransactions.clientTxnId, clientTxnId))
      .run();

    // Link the local reversing row to the real cloud void entry for
    // traceability — best-effort, not load-bearing for anything else.
    localDb
      .update(localTransactions)
      .set({ serverTransactionId: cloudResult.voidTransactionId } as any)
      .where(eq(localTransactions.clientTxnId, voidClientTxnId))
      .run();

    return { clientTxnId, voidedAt: now, cloudVoided: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to void on cloud.";

    // Marked "failed" (not left null) so syncLocalVoidsToNeon() picks this up
    // and retries automatically on the next sync — this used to have no
    // retry path at all, so an offline void just stayed unsynced forever.
    localDb
      .update(localTransactions)
      .set({ voidSyncStatus: "failed", voidSyncError: message } as any)
      .where(eq(localTransactions.clientTxnId, clientTxnId))
      .run();

    localDb
      .insert(localSyncLogs)
      .values({
        eventId: original.eventId,
        message: `Cloud void failed for ${clientTxnId}: ${message}`,
        createdAt: nowIso(),
      })
      .run();

    return { clientTxnId, voidedAt: now, cloudVoided: false, cloudError: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry cloud voids that failed to sync
// ─────────────────────────────────────────────────────────────────────────────

export async function syncLocalVoidsToNeon(eventId: number) {
  // Note: this no longer filters on status="voided" — the original row's
  // status stays "completed" under the additive void model (see
  // voidLocalTransaction). voidSyncStatus is only ever set to "failed" when
  // a void actually happened, so that alone is sufficient to find rows that
  // still need their cloud void reconciled.
  const pending = localDb
    .select()
    .from(localTransactions)
    .where(
      and(
        eq(localTransactions.eventId, eventId),
        eq(localTransactions.voidSyncStatus, "failed"),
        sql`${localTransactions.serverTransactionId} IS NOT NULL`
      )
    )
    .all();

  const results: { clientTxnId: string; ok: boolean; error?: string }[] = [];

  for (const txn of pending) {
    try {
      const cloudResult = await voidTransaction(Number(txn.serverTransactionId), {
        voidedBy: (txn as any).voidedBy ?? null,
        voidReason: (txn as any).voidReason ?? null,
      });

      localDb
        .update(localTransactions)
        .set({ voidSyncStatus: "synced", voidSyncError: null } as any)
        .where(eq(localTransactions.clientTxnId, txn.clientTxnId))
        .run();

      // Link the local reversing row to the real cloud void entry, same as
      // the happy path in voidLocalTransaction — best-effort traceability.
      localDb
        .update(localTransactions)
        .set({ serverTransactionId: cloudResult.voidTransactionId } as any)
        .where(eq(localTransactions.voidOfClientTxnId, txn.clientTxnId))
        .run();

      localDb
        .insert(localSyncLogs)
        .values({
          eventId,
          message: `Synced void for local transaction ${txn.clientTxnId} to cloud`,
          createdAt: nowIso(),
        })
        .run();

      results.push({ clientTxnId: txn.clientTxnId, ok: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to void on cloud.";

      // A prior attempt may have actually reached the cloud even though the
      // response never made it back here (dropped connection mid-request) —
      // voidTransaction() then throws "already been voided" on retry. Treat
      // that as reconciled instead of retrying forever.
      const alreadyVoided = message.toLowerCase().includes("already been voided");

      localDb
        .update(localTransactions)
        .set({
          voidSyncStatus: alreadyVoided ? "synced" : "failed",
          voidSyncError: alreadyVoided ? null : message,
        } as any)
        .where(eq(localTransactions.clientTxnId, txn.clientTxnId))
        .run();

      localDb
        .insert(localSyncLogs)
        .values({
          eventId,
          message: alreadyVoided
            ? `Void for ${txn.clientTxnId} already existed on cloud — marked synced`
            : `Failed to sync void for ${txn.clientTxnId}: ${message}`,
          createdAt: nowIso(),
        })
        .run();

      results.push({
        clientTxnId: txn.clientTxnId,
        ok: alreadyVoided,
        error: alreadyVoided ? undefined : message,
      });
    }
  }

  return {
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cashier session helpers
// ─────────────────────────────────────────────────────────────────────────────

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
// Cloud cashier session cache (offline fallback)
// ─────────────────────────────────────────────────────────────────────────────
// Cashier sessions are opened/closed on the cloud only (an admin action from
// the event detail page) — this is NOT a local-session-creation mechanism.
// It's a read-through mirror of the last cloud session seen, so reopening the
// local POS while the cloud DB is unreachable doesn't drop an already-open
// session's attribution. Rows here are always syncStatus "synced" so
// syncLocalCashierSessionsToNeon() (which only pushes "pending" rows) never
// touches them.

export type CloudCashierSessionShape = {
  id: number;
  eventId: number;
  cashierName: string;
  openingCash: string | number;
  closingCash?: string | number | null;
  openedAt: string | Date | null;
  closedAt?: string | Date | null;
  notes?: string | null;
};

export function cacheCloudCashierSession(
  eventId: number,
  session: CloudCashierSessionShape
) {
  const existing = localDb
    .select({ id: localCashierSessions.id })
    .from(localCashierSessions)
    .where(eq(localCashierSessions.serverSessionId, session.id))
    .limit(1)
    .get();

  const values = {
    serverSessionId: session.id,
    eventId,
    cashierName: session.cashierName,
    openingCash: String(session.openingCash ?? 0),
    closingCash:
      session.closingCash != null ? String(session.closingCash) : null,
    openedAt: session.openedAt ? String(session.openedAt) : nowIso(),
    closedAt: session.closedAt ? String(session.closedAt) : null,
    notes: session.notes ?? null,
    syncStatus: "synced",
  };

  if (existing) {
    localDb
      .update(localCashierSessions)
      .set(values)
      .where(eq(localCashierSessions.id, existing.id))
      .run();
  } else {
    localDb.insert(localCashierSessions).values(values).run();
  }
}

export function getCachedCloudCashierSession(
  eventId: number,
  preferredCashierName?: string | null
) {
  const openCached = localDb
    .select()
    .from(localCashierSessions)
    .where(
      and(
        eq(localCashierSessions.eventId, eventId),
        eq(localCashierSessions.syncStatus, "synced"),
        sql`${localCashierSessions.serverSessionId} IS NOT NULL`,
        sql`${localCashierSessions.closedAt} IS NULL`
      )
    )
    .orderBy(sql`${localCashierSessions.openedAt} desc`)
    .all();

  if (openCached.length === 0) return null;

  // Same rule as the live cashier-session route: don't fall back to some
  // other cached cashier's session when the preferred name doesn't match —
  // that would silently attach this cashier's offline sales to someone
  // else's shift.
  const matched = preferredCashierName
    ? openCached.find(
        (row) => row.cashierName.trim() === preferredCashierName.trim()
      ) ?? null
    : openCached.length === 1
      ? openCached[0]
      : null;

  if (!matched) return null;

  // Shaped like the cloud cashierSessions row the client already expects —
  // its `id` must be the cloud session id, since that's what gets written
  // straight onto local_transactions.cashierSessionId at checkout time.
  return {
    id: matched.serverSessionId,
    eventId: matched.eventId,
    cashierName: matched.cashierName,
    openingCash: matched.openingCash,
    closingCash: matched.closingCash,
    openedAt: matched.openedAt,
    closedAt: matched.closedAt,
    notes: matched.notes,
  };
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
  // Reversing (void) rows are a local-only bookkeeping mirror of the cloud
  // ledger, not a sale the cashier ever rang up — exclude them from the
  // history list they see/print/void from. buildLocalTransactionsExcel()
  // queries local_transactions directly (not this function) so they still
  // show up in the export, matching the cloud export's shape.
  return localDb
    .select()
    .from(localTransactions)
    .where(
      and(
        eq(localTransactions.eventId, eventId),
        sql`${localTransactions.voidOfClientTxnId} IS NULL`
      )
    )
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
    .select({
      id: localTransactionItems.id,
      clientTxnId: localTransactionItems.clientTxnId,
      eventItemId: localTransactionItems.eventItemId,
      itemId: localTransactionItems.itemId,
      baseItemNo: localEventItems.baseItemNo,
      productName: localTransactionItems.productName,
      color: localEventItems.color,
      variantCode: localEventItems.variantCode,
      quantity: localTransactionItems.quantity,
      unitPrice: localTransactionItems.unitPrice,
      discountAmt: localTransactionItems.discountAmt,
      finalPrice: localTransactionItems.finalPrice,
      subtotal: localTransactionItems.subtotal,
      promoApplied: localTransactionItems.promoApplied,
    })
    .from(localTransactionItems)
    .leftJoin(localEventItems, eq(localTransactionItems.eventItemId, localEventItems.id))
    .where(eq(localTransactionItems.clientTxnId, clientTxnId))
    .orderBy(localTransactionItems.id)
    .all();
}

export async function getUnsyncedLocalTransactions(eventId: number) {
  // A sale that was voided before it ever got a chance to sync (e.g. rung up
  // and voided entirely while offline) is still pushed here like any other
  // pending sale — it does NOT get excluded. It used to be, on the theory
  // that "nothing to reconcile" if the sale never reached the cloud, but that
  // meant a sale-then-void done fully offline would silently never sync at
  // all: no error, just permanently invisible to the cloud, which broke
  // parity between the local POS export and the cloud events export (the
  // local export always shows the pair; the cloud export showed nothing).
  // Instead this sale syncs normally via createTransaction() below, and the
  // "voided mid-sync" check right after picks up that it's already voided
  // locally and immediately queues the matching cloud void — so a sale
  // voided offline now reaches the cloud as a real sale + real void, in the
  // same sync pass, exactly like any other void does.
  const txns = localDb
    .select()
    .from(localTransactions)
    .where(
      and(
        eq(localTransactions.eventId, eventId),
        inArray(localTransactions.syncStatus, ["pending", "failed"]),
        // Reversing rows are local-only bookkeeping, never a sale to push.
        sql`${localTransactions.voidOfClientTxnId} IS NULL`
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
    // The local SQLite increment above already committed — a transaction
    // that's synced but whose cloud round trip fails here (offline, cloud
    // DB unreachable, etc.) must not lose that local increment. Without
    // this try/catch the whole function throws, the API route 500s, and
    // the client falls back to a separate localStorage counter that drifts
    // from the real (correctly incremented) SQLite count.
    try {
      const updated = await setReceiptPrintCountAtLeast(
        Number(txn.serverTransactionId),
        nextCount
      );

      cloudSync = {
        transactionId: updated.transactionId,
        localPrintCount: nextCount,
        cloudBefore: Number(updated.receiptPrintCount ?? 0),
        inserted: 0,
        cloudAfter: Number(updated.receiptPrintCount ?? 0),
      };
    } catch (error) {
      localDb
        .insert(localSyncLogs)
        .values({
          eventId: txn.eventId,
          message: `Failed to sync receipt print count for ${clientTxnId} to cloud: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          createdAt: nowIso(),
        })
        .run();
    }
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
// ─────────────────────────────────────────────────────────────────────────────

export async function syncLocalTransactionsToNeon(eventId: number) {
  // Kept for local-only sessions (none are created today — cashier sessions
  // are opened/closed on the cloud only, see
  // app/api/local/events/[id]/cashier-session/route.ts) so this stays a
  // harmless no-op rather than something that needs removing later.
  const sessionSync = await syncLocalCashierSessionsToNeon(eventId);

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

      // cashierSessionId on a local transaction is already the cloud
      // cashier_sessions.id (sessions are opened/closed on the cloud only),
      // so it's passed straight through instead of remapping through local
      // session ids — remapping through the local `local_cashier_sessions`
      // table silently dropped this on every sync, since nothing writes to
      // that table when sessions are cloud-managed.
      const serverCashierSessionId = txn.cashierSessionId ?? null;

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

      // This sale may already have been voided locally before this sync ever
      // ran — most commonly a sale rung up AND voided entirely while offline
      // (voidLocalTransaction() found serverTransactionId still null at void
      // time and correctly concluded there was nothing in the cloud yet to
      // void), but also possible as a narrow mid-flight race if the cashier
      // catches the mistake in the moment this create() call is in flight.
      // Either way, without this check the row would just be marked "synced"
      // and left as a live, un-voided sale in the cloud forever with nothing
      // to retry it — silently breaking parity with the local export, which
      // always shows the sale+void pair. voidedAt is stamped on the original
      // in the same atomic transaction as the reversing row, so it's the
      // reliable "already voided, cloud void not yet reconciled" signal.
      const latestLocal = localDb
        .select({
          voidedAt: localTransactions.voidedAt,
          voidSyncStatus: localTransactions.voidSyncStatus,
        })
        .from(localTransactions)
        .where(eq(localTransactions.clientTxnId, txn.clientTxnId))
        .limit(1)
        .get();

      const voidedMidSync =
        latestLocal?.voidedAt != null && latestLocal?.voidSyncStatus == null;

      localDb
        .update(localTransactions)
        .set({
          syncStatus:          "synced",
          serverTransactionId: created.id,
          syncError:           null,
          ...(voidedMidSync
            ? {
                voidSyncStatus: "failed",
                voidSyncError:
                  "Voided locally while this sale was still syncing — cloud void queued for retry.",
              }
            : {}),
        } as any)
        .where(eq(localTransactions.clientTxnId, txn.clientTxnId))
        .run();

      if (voidedMidSync) {
        localDb
          .insert(localSyncLogs)
          .values({
            eventId,
            message: `Local transaction ${txn.clientTxnId} was voided while syncing — queued cloud void retry.`,
            createdAt: nowIso(),
          })
          .run();
      }

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

  const voidSync = await syncLocalVoidsToNeon(eventId);
  const drawerSync = await syncLocalCashDrawerCountsToNeon(eventId);
  const receiptPrintSync = await syncLocalReceiptPrintCountsToNeon(eventId);

  return {
    success: results.every((result) => result.ok) && voidSync.failed === 0,
    total:   results.length,
    synced:  results.filter((result) => result.ok).length,
    failed:  results.filter((result) => !result.ok).length,
    results,
    sessionSync,
    voidSync,
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

  // revenue/discount/itemsSold sum across ALL rows including reversing
  // (void) entries on purpose — their negative amounts net a voided sale's
  // totals out automatically, same as the cloud's getEventStats(). txnCount
  // excludes reversing rows so a sale-then-void doesn't count as two
  // transactions, mirroring the cloud's `filter (where voidOfTransactionId
  // is null)`.
  return {
    txnCount:       txns.filter((txn) => !(txn as any).voidOfClientTxnId).length,
    revenue:        txns.reduce((sum, txn) => sum + Number(txn.finalAmount ?? 0), 0),
    discount:       txns.reduce((sum, txn) => sum + Number(txn.discount ?? 0), 0),
    itemsSold:      items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    todayTxnCount:  todayTxns.filter((txn) => !(txn as any).voidOfClientTxnId).length,
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
        or(
          inArray(localTransactions.syncStatus, ["pending", "failed"]),
          // voidSyncStatus is only ever set once a void has actually
          // happened, regardless of the original row's status, so this
          // alone is enough to catch a cloud void still awaiting retry.
          eq(localTransactions.voidSyncStatus, "failed")
        )
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