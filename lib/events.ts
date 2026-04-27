// lib/events.ts
import { db } from "@/lib/db";
import { events, eventItems } from "@/lib/db/schema";
import { eq, sql, inArray } from "drizzle-orm";

export type Event    = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type EventItem    = typeof eventItems.$inferSelect;
export type NewEventItem = typeof eventItems.$inferInsert;

export const EVENT_STATUSES = [
  { value: "draft",  label: "Draft",  color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  { value: "active", label: "Active", color: "#16a34a", bg: "rgba(22,163,74,0.1)"   },
  { value: "closed", label: "Closed", color: "#dc2626", bg: "rgba(220,38,38,0.1)"   },
] as const;

// ── Events CRUD ───────────────────────────────────────────────────────────────

export async function getAllEvents(): Promise<Event[]> {
  return db.select().from(events).orderBy(sql`${events.createdAt} desc`);
}

export async function getEventById(id: number): Promise<Event | null> {
  const r = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return r[0] ?? null;
}

export async function createEvent(data: NewEvent): Promise<Event> {
  const r = await db.insert(events).values(data).returning();
  return r[0];
}

export async function updateEvent(id: number, data: Partial<NewEvent>): Promise<Event> {
  const r = await db.update(events).set(data).where(eq(events.id, id)).returning();
  return r[0];
}

export async function deleteEvent(id: number): Promise<void> {
  await db.delete(events).where(eq(events.id, id));
  // event_items, transactions, promos cascade automatically
}

// ── Event Items CRUD ──────────────────────────────────────────────────────────
// "Event items" are the products that belong to a specific event.
// There is no global product catalog — each event owns its own copy of every item.

export async function getEventItems(eventId: number): Promise<EventItem[]> {
  return db
    .select()
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId))
    .orderBy(eventItems.name);
}

export async function getEventItemById(id: number): Promise<EventItem | null> {
  const r = await db.select().from(eventItems).where(eq(eventItems.id, id)).limit(1);
  return r[0] ?? null;
}

export async function getEventItemByItemId(
  eventId: number,
  itemId:  string
): Promise<EventItem | null> {
  const r = await db
    .select()
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId))
    .then((rows) => rows.filter((i) => i.itemId === itemId));
  return r[0] ?? null;
}

export async function addEventItem(
  eventId: number,
  data: Omit<NewEventItem, "eventId">
): Promise<EventItem> {
  // If the same itemId already exists in this event, update instead of inserting
  const existing = await getEventItemByItemId(eventId, data.itemId);
  if (existing) {
    return updateEventItem(existing.id, data);
  }
  const r = await db
    .insert(eventItems)
    .values({ ...data, eventId })
    .returning();
  return r[0];
}

export async function updateEventItem(
  id:   number,
  data: Partial<Omit<NewEventItem, "eventId">>
): Promise<EventItem> {
  const r = await db
    .update(eventItems)
    .set(data)
    .where(eq(eventItems.id, id))
    .returning();
  return r[0];
}

export async function removeEventItem(id: number): Promise<void> {
  await db.delete(eventItems).where(eq(eventItems.id, id));
  // stock_entries, promo_items, transaction_items cascade automatically
}

// ── Bulk upsert (used by Excel import) ───────────────────────────────────────

export async function bulkUpsertEventItems(
  eventId: number,
  rows: {
    itemId:      string;
    baseItemNo?: string;
    name:        string;
    color?:      string;
    variantCode?: string;
    unit?:       string;
    netPrice:    string;
    retailPrice: string;
    stock:       number;
  }[]
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  let inserted = 0, updated = 0;
  const errors: string[] = [];

  if (rows.length === 0) return { inserted, updated, errors };

  // Load all existing event items for this event in one query
  const existingRows = await db
    .select({ id: eventItems.id, itemId: eventItems.itemId })
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId));

  // itemId → event_item.id
  const existingMap = new Map<string, number>(
    existingRows.map((r) => [r.itemId, r.id])
  );

  for (const row of rows) {
    const trimmedItemId = row.itemId.trim();
    if (!trimmedItemId) continue;

    const netPrice    = parseFloat(row.netPrice);
    const retailPrice = parseFloat(row.retailPrice);

    if (isNaN(netPrice) || netPrice <= 0) {
      errors.push(`"${trimmedItemId}" has invalid net price`);
      continue;
    }

    const payload: Omit<NewEventItem, "eventId"> = {
      itemId:      trimmedItemId,
      baseItemNo:  row.baseItemNo  ?? trimmedItemId,
      name:        row.name.trim(),
      color:       row.color       ?? null,
      variantCode: row.variantCode ?? null,
      unit:        row.unit        ?? "PCS",
      netPrice:    String(netPrice),
      retailPrice: String(retailPrice > 0 ? retailPrice : netPrice),
      stock:       row.stock > 0 ? row.stock : 0,
    };

    try {
      const existingId = existingMap.get(trimmedItemId);
      if (existingId) {
        await db
          .update(eventItems)
          .set(payload)
          .where(eq(eventItems.id, existingId));
        updated++;
      } else {
        const [newItem] = await db
          .insert(eventItems)
          .values({ ...payload, eventId })
          .returning();
        existingMap.set(trimmedItemId, newItem.id);
        inserted++;
      }
    } catch (e) {
      errors.push(`"${trimmedItemId}": ${String(e)}`);
    }
  }

  return { inserted, updated, errors };
}