// lib/stock.ts
import { db } from "@/lib/db";
import {
  stockEntries,
  eventItems,
  transactions,
  transactionItems,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type StockEntry = typeof stockEntries.$inferSelect;

export type StockSummary = {
  totalItems: number;
  outOfStock: number;
  lowStock: number;

  /**
   * Current remaining stock.
   * Source: event_items.stock
   */
  totalUnits: number;

  /**
   * Units already sold.
   * Source: transaction_items.quantity
   */
  soldUnits: number;

  /**
   * Used by your existing dashboard as the sales denominator.
   * New proper logic:
   * originalUnits = current remaining stock + sold units
   */
  originalUnits: number;

  /**
   * Clearer alias for originalUnits.
   */
  totalAvailableUnits: number;

  /**
   * Current remaining inventory value.
   * Formula: current stock × net price
   */
  remainingValue: number;

  /**
   * Total inventory value that has been available for sale.
   * Formula: remaining value + sold inventory value
   */
  totalStockValue: number;
};

export type EventInventorySummary = StockSummary & {
  eventId: number;
};

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Get the current stock level for a single event item.
 * Reads from the denormalized `stock` column on event_items for speed.
 */
export async function getStockForEventItem(eventItemId: number): Promise<number> {
  const r = await db
    .select({ stock: eventItems.stock })
    .from(eventItems)
    .where(eq(eventItems.id, eventItemId))
    .limit(1);

  return toNumber(r[0]?.stock);
}

/**
 * Get stock levels for all items in an event.
 * Returns a map of { eventItemId → stockLevel }.
 */
export async function getStockLevelsForEvent(
  eventId: number
): Promise<Record<number, number>> {
  const rows = await db
    .select({
      id: eventItems.id,
      stock: eventItems.stock,
    })
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId));

  return Object.fromEntries(
    rows.map((row) => [row.id, toNumber(row.stock)])
  );
}

/**
 * Get all event items for a specific event with their current stock.
 * Used by the per-event stock management tab.
 */
export async function getItemsWithStockForEvent(eventId: number) {
  return db
    .select()
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId))
    .orderBy(eventItems.name);
}

/**
 * Get the full stock_entries history for one event item.
 */
export async function getStockHistory(
  eventItemId: number
): Promise<StockEntry[]> {
  return db
    .select()
    .from(stockEntries)
    .where(eq(stockEntries.eventItemId, eventItemId))
    .orderBy(sql`${stockEntries.createdAt} desc`);
}

/**
 * Get aggregated stock stats for one event.
 *
 * Important logic:
 * - totalUnits = current remaining stock
 * - soldUnits = units sold in transactions
 * - originalUnits = current remaining stock + sold units
 *
 * This makes restock correctly increase the denominator
 * used in "sold / total stock" dashboard stats.
 */
export async function getStockSummaryForEvent(
  eventId: number
): Promise<StockSummary> {
  const [stockRow] = await db
    .select({
      totalItems: sql<number>`
        count(${eventItems.id})
      `,

      outOfStock: sql<number>`
        coalesce(
          sum(case when ${eventItems.stock} <= 0 then 1 else 0 end),
          0
        )
      `,

      lowStock: sql<number>`
        coalesce(
          sum(case when ${eventItems.stock} > 0 and ${eventItems.stock} <= 5 then 1 else 0 end),
          0
        )
      `,

      totalUnits: sql<number>`
        coalesce(sum(${eventItems.stock}), 0)
      `,

      remainingValue: sql<number>`
        coalesce(sum(${eventItems.stock} * ${eventItems.netPrice}::numeric), 0)
      `,
    })
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId));

  const [soldRow] = await db
    .select({
      soldUnits: sql<number>`
        coalesce(sum(${transactionItems.quantity}), 0)
      `,

      soldStockValue: sql<number>`
        coalesce(sum(${transactionItems.quantity} * ${eventItems.netPrice}::numeric), 0)
      `,
    })
    .from(transactionItems)
    .innerJoin(
      transactions,
      eq(transactionItems.transactionId, transactions.id)
    )
    .innerJoin(
      eventItems,
      eq(transactionItems.eventItemId, eventItems.id)
    )
    .where(eq(transactions.eventId, eventId));

  const totalUnits = toNumber(stockRow?.totalUnits);
  const soldUnits = toNumber(soldRow?.soldUnits);

  const remainingValue = toNumber(stockRow?.remainingValue);
  const soldStockValue = toNumber(soldRow?.soldStockValue);

  const totalAvailableUnits = totalUnits + soldUnits;
  const totalStockValue = remainingValue + soldStockValue;

  return {
    totalItems: toNumber(stockRow?.totalItems),
    outOfStock: toNumber(stockRow?.outOfStock),
    lowStock: toNumber(stockRow?.lowStock),

    totalUnits,
    soldUnits,

    originalUnits: totalAvailableUnits,
    totalAvailableUnits,

    remainingValue,
    totalStockValue,
  };
}

/**
 * Cross-event inventory summary for the parent dashboard.
 *
 * Same logic as getStockSummaryForEvent, but grouped by event.
 */
export async function getInventorySummaryForAllEvents(): Promise<EventInventorySummary[]> {
  const stockRows = await db
    .select({
      eventId: eventItems.eventId,

      totalItems: sql<number>`
        count(${eventItems.id})
      `,

      outOfStock: sql<number>`
        coalesce(
          sum(case when ${eventItems.stock} <= 0 then 1 else 0 end),
          0
        )
      `,

      lowStock: sql<number>`
        coalesce(
          sum(case when ${eventItems.stock} > 0 and ${eventItems.stock} <= 5 then 1 else 0 end),
          0
        )
      `,

      totalUnits: sql<number>`
        coalesce(sum(${eventItems.stock}), 0)
      `,

      remainingValue: sql<number>`
        coalesce(sum(${eventItems.stock} * ${eventItems.netPrice}::numeric), 0)
      `,
    })
    .from(eventItems)
    .groupBy(eventItems.eventId);

  const soldRows = await db
    .select({
      eventId: transactions.eventId,

      soldUnits: sql<number>`
        coalesce(sum(${transactionItems.quantity}), 0)
      `,

      soldStockValue: sql<number>`
        coalesce(sum(${transactionItems.quantity} * ${eventItems.netPrice}::numeric), 0)
      `,
    })
    .from(transactionItems)
    .innerJoin(
      transactions,
      eq(transactionItems.transactionId, transactions.id)
    )
    .innerJoin(
      eventItems,
      eq(transactionItems.eventItemId, eventItems.id)
    )
    .groupBy(transactions.eventId);

  const soldMap = new Map(
    soldRows.map((row) => [
      Number(row.eventId),
      {
        soldUnits: toNumber(row.soldUnits),
        soldStockValue: toNumber(row.soldStockValue),
      },
    ])
  );

  return stockRows.map((row) => {
    const eventId = Number(row.eventId);

    const sold = soldMap.get(eventId) ?? {
      soldUnits: 0,
      soldStockValue: 0,
    };

    const totalUnits = toNumber(row.totalUnits);
    const remainingValue = toNumber(row.remainingValue);

    const totalAvailableUnits = totalUnits + sold.soldUnits;
    const totalStockValue = remainingValue + sold.soldStockValue;

    return {
      eventId,

      totalItems: toNumber(row.totalItems),
      outOfStock: toNumber(row.outOfStock),
      lowStock: toNumber(row.lowStock),

      totalUnits,
      soldUnits: sold.soldUnits,

      originalUnits: totalAvailableUnits,
      totalAvailableUnits,

      remainingValue,
      totalStockValue,
    };
  });
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Add stock manually or through import.
 *
 * This function:
 * 1. Writes stock_entries history.
 * 2. Updates event_items.stock.
 *
 * Important:
 * eventItems.stock is what POS/dashboard reads as current stock.
 */
export async function addStockEntry(
  eventItemId: number,
  quantity: number,
  note: string,
  source: "manual" | "import" | "sale" = "manual"
): Promise<StockEntry> {
  if (!Number.isFinite(eventItemId)) {
    throw new Error("Invalid event item ID.");
  }

  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new Error("Quantity must not be zero.");
  }

  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: eventItems.id,
        stock: eventItems.stock,
      })
      .from(eventItems)
      .where(eq(eventItems.id, eventItemId))
      .limit(1);

    if (!item) {
      throw new Error("Event item not found.");
    }

    const nextStock = toNumber(item.stock) + quantity;

    // if (nextStock < 0) {
    //   throw new Error("Stock cannot be negative.");
    // }

    const [entry] = await tx
      .insert(stockEntries)
      .values({
        eventItemId,
        quantity,
        note,
        source,
      })
      .returning();

    await tx
      .update(eventItems)
      .set({
        stock: nextStock,
      })
      .where(eq(eventItems.id, eventItemId));

    return entry;
  });
}

/**
 * Deduct stock after a completed sale.
 *
 * This is used by createTransaction().
 */
export async function deductStock(
  eventItemId: number,
  quantity: number,
  referenceId?: number | null
) {
  const [item] = await db
    .select()
    .from(eventItems)
    .where(eq(eventItems.id, eventItemId))
    .limit(1);

  if (!item) {
    throw new Error("Event item not found.");
  }

  const currentStock = Number(item.stock ?? 0);
  const nextStock = currentStock - Number(quantity);

  const [updated] = await db
    .update(eventItems)
    .set({
      stock: nextStock,
    })
    .where(eq(eventItems.id, eventItemId))
    .returning();

  await db.insert(stockEntries).values({
    eventItemId,
    quantity: -Math.abs(Number(quantity)),
    note: referenceId
      ? `Sale transaction #${referenceId}`
      : "Sale deduction",
    source: "sale",
    createdAt: new Date(),
  });

  return updated;
}

/**
 * Snapshot stock at event close.
 */
export async function snapshotEventStock(eventId: number): Promise<void> {
  const items = await db
    .select({
      id: eventItems.id,
      stock: eventItems.stock,
    })
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId));

  for (const item of items) {
    await db.insert(stockEntries).values({
      eventItemId: item.id,
      quantity: 0,
      note: `Event closed — stock snapshot: ${item.stock}`,
      source: "manual",
    });
  }
}

/**
 * Recompute event_items.stock from stock_entries.
 *
 * Use this only if the denormalized stock column becomes inconsistent.
 */
export async function recalcStock(eventItemId: number): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`
        coalesce(sum(${stockEntries.quantity}), 0)
      `,
    })
    .from(stockEntries)
    .where(eq(stockEntries.eventItemId, eventItemId));

  const total = toNumber(row?.total);

  await db
    .update(eventItems)
    .set({
      stock: total,
    })
    .where(eq(eventItems.id, eventItemId));

  return total;
}

/**
 * Optional helper to validate event ownership before stock changes.
 */
export async function assertEventItemBelongsToEvent(
  eventId: number,
  eventItemId: number
): Promise<void> {
  const [item] = await db
    .select({
      id: eventItems.id,
    })
    .from(eventItems)
    .where(
      and(
        eq(eventItems.id, eventItemId),
        eq(eventItems.eventId, eventId)
      )
    )
    .limit(1);

  if (!item) {
    throw new Error("Item does not belong to this event.");
  }
}