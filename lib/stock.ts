// lib/stock.ts
import { db } from "@/lib/db";
import { stockEntries, eventItems } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export type StockEntry = typeof stockEntries.$inferSelect;

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Get the current stock level for a single event item.
 * Reads from the denormalized `stock` column on event_items for speed.
 * Falls back to summing stock_entries if needed.
 */
export async function getStockForEventItem(eventItemId: number): Promise<number> {
  const r = await db
    .select({ stock: eventItems.stock })
    .from(eventItems)
    .where(eq(eventItems.id, eventItemId))
    .limit(1);
  return Number(r[0]?.stock ?? 0);
}

/**
 * Get stock levels for all items in an event.
 * Returns a map of { eventItemId → stockLevel }.
 */
export async function getStockLevelsForEvent(
  eventId: number
): Promise<Record<number, number>> {
  const rows = await db
    .select({ id: eventItems.id, stock: eventItems.stock })
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId));

  return Object.fromEntries(rows.map((r) => [r.id, Number(r.stock)]));
}

/**
 * Get all event items across all events with their current stock level.
 * Used by the /stock management page.
 */
export async function getAllItemsWithStock() {
  return db
    .select()
    .from(eventItems)
    .orderBy(eventItems.eventId, eventItems.name);
}

/**
 * Get the full stock_entries history for one event item (newest first).
 */
export async function getStockHistory(eventItemId: number): Promise<StockEntry[]> {
  return db
    .select()
    .from(stockEntries)
    .where(eq(stockEntries.eventItemId, eventItemId))
    .orderBy(sql`${stockEntries.createdAt} desc`);
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Add stock manually (e.g. restock, adjustment).
 * Writes a stock_entries row AND updates the denormalized column.
 */
export async function addStockEntry(
  eventItemId: number,
  quantity:    number,
  note:        string,
  source:      "manual" | "import" | "sale" = "manual"
): Promise<StockEntry> {
  const [entry] = await db
    .insert(stockEntries)
    .values({ eventItemId, quantity, note, source })
    .returning();

  await db
    .update(eventItems)
    .set({ stock: sql`stock + ${quantity}` })
    .where(eq(eventItems.id, eventItemId));

  return entry;
}

/**
 * Deduct stock after a completed sale.
 * Writes a negative stock_entries row AND decrements the denormalized column.
 */
export async function deductStock(
  eventItemId:   number,
  quantity:      number,
  transactionId: number
): Promise<void> {
  await db.insert(stockEntries).values({
    eventItemId,
    quantity: -quantity,
    note:     `Sale #${transactionId}`,
    source:   "sale",
  });

  await db
    .update(eventItems)
    .set({ stock: sql`stock - ${quantity}` })
    .where(eq(eventItems.id, eventItemId));
}

/**
 * Recompute the denormalized stock column from stock_entries.
 * Run this after bulk imports or if the denormalized value drifts.
 */
export async function recalcStock(eventItemId: number): Promise<number> {
  const r = await db
    .select({
      total: sql<number>`coalesce(sum(${stockEntries.quantity}), 0)`,
    })
    .from(stockEntries)
    .where(eq(stockEntries.eventItemId, eventItemId));

  const total = Number(r[0]?.total ?? 0);

  await db
    .update(eventItems)
    .set({ stock: total })
    .where(eq(eventItems.id, eventItemId));

  return total;
}