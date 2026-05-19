// lib/events.ts
import { db } from "@/lib/db";
import { events, eventItems } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type EventItem = typeof eventItems.$inferSelect;
export type NewEventItem = typeof eventItems.$inferInsert;

export const EVENT_STATUSES = [
  {
    value: "draft",
    label: "Draft",
    color: "#6b7280",
    bg: "rgba(107,114,128,0.1)",
  },
  {
    value: "active",
    label: "Active",
    color: "#16a34a",
    bg: "rgba(22,163,74,0.1)",
  },
  {
    value: "closed",
    label: "Closed",
    color: "#dc2626",
    bg: "rgba(220,38,38,0.1)",
  },
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number]["value"];

// ─────────────────────────────────────────────────────────────────────────────
// Event input types
// Do not use NewEvent directly for create/update forms.
// Drizzle requires code, verifierCode, and name to be guaranteed strings.
// ─────────────────────────────────────────────────────────────────────────────

export type CreateEventInput = {
  code: string;
  name: string;
  verifierCode?: string | null;
  location?: string | null;
  description?: string | null;
  status?: EventStatus | string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
};

export type UpdateEventInput = Partial<CreateEventInput>;

type CreateEventPayload = {
  code: string;
  verifierCode: string;
  name: string;
  location: string | null;
  description: string | null;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
};

type UpdateEventPayload = Partial<CreateEventPayload>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text || null;
}

export function normalizeEventCode(code: string): string {
  const normalized = normalizeText(code);

  if (!/^\d{4}$/.test(normalized)) {
    throw new Error("Event code must be exactly 4 digits.");
  }

  return normalized;
}

export function generateEventVerifierCode(): string {
  const timestampPart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `EV-${timestampPart}-${randomPart}`;
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function assertValidEventStatus(status: string): string {
  const normalized = normalizeText(status || "draft");

  const allowedStatuses = EVENT_STATUSES.map((item) => item.value) as string[];

  if (!allowedStatuses.includes(normalized)) {
    throw new Error(`Invalid event status "${normalized}".`);
  }

  return normalized;
}

function normalizeEventCreatePayload(data: CreateEventInput): CreateEventPayload {
  const name = normalizeText(data.name);

  if (!name) {
    throw new Error("Event name is required.");
  }

  const verifierCode = normalizeText(data.verifierCode);

  return {
    code: normalizeEventCode(data.code),
    verifierCode: verifierCode || generateEventVerifierCode(),
    name,
    location: normalizeNullableText(data.location),
    description: normalizeNullableText(data.description),
    status: assertValidEventStatus(data.status || "draft"),
    startDate: toDateOrNull(data.startDate),
    endDate: toDateOrNull(data.endDate),
    updatedAt: new Date(),
  };
}

function normalizeEventUpdatePayload(data: UpdateEventInput): UpdateEventPayload {
  const payload: UpdateEventPayload = {
    updatedAt: new Date(),
  };

  if (data.code !== undefined) {
    payload.code = normalizeEventCode(data.code);
  }

  if (data.verifierCode !== undefined) {
    const verifierCode = normalizeText(data.verifierCode);

    if (verifierCode) {
      payload.verifierCode = verifierCode;
    }
  }

  if (data.name !== undefined) {
    const name = normalizeText(data.name);

    if (!name) {
      throw new Error("Event name is required.");
    }

    payload.name = name;
  }

  if (data.location !== undefined) {
    payload.location = normalizeNullableText(data.location);
  }

  if (data.description !== undefined) {
    payload.description = normalizeNullableText(data.description);
  }

  if (data.status !== undefined) {
    payload.status = assertValidEventStatus(data.status || "draft");
  }

  if (data.startDate !== undefined) {
    payload.startDate = toDateOrNull(data.startDate);
  }

  if (data.endDate !== undefined) {
    payload.endDate = toDateOrNull(data.endDate);
  }

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Events CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllEvents(): Promise<Event[]> {
  return db.select().from(events).orderBy(sql`${events.createdAt} desc`);
}

export async function getEventById(id: number): Promise<Event | null> {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, id))
    .limit(1);

  return event ?? null;
}

export async function getEventByCode(code: string): Promise<Event | null> {
  const normalizedCode = normalizeEventCode(code);

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.code, normalizedCode))
    .limit(1);

  return event ?? null;
}

export async function getEventByVerifierCode(
  verifierCode: string
): Promise<Event | null> {
  const normalizedVerifierCode = normalizeText(verifierCode);

  if (!normalizedVerifierCode) {
    return null;
  }

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.verifierCode, normalizedVerifierCode))
    .limit(1);

  return event ?? null;
}

export async function createEvent(data: CreateEventInput): Promise<Event> {
  const payload = normalizeEventCreatePayload(data);

  const existingCode = await getEventByCode(payload.code);

  if (existingCode) {
    throw new Error(`Event code "${payload.code}" is already used.`);
  }

  const [event] = await db.insert(events).values(payload).returning();

  return event;
}

export async function updateEvent(
  id: number,
  data: UpdateEventInput
): Promise<Event> {
  const payload = normalizeEventUpdatePayload(data);

  if (payload.code) {
    const existingCode = await getEventByCode(payload.code);

    if (existingCode && existingCode.id !== id) {
      throw new Error(`Event code "${payload.code}" is already used.`);
    }
  }

  const [event] = await db
    .update(events)
    .set(payload)
    .where(eq(events.id, id))
    .returning();

  if (!event) {
    throw new Error("Event not found.");
  }

  return event;
}

export async function deleteEvent(id: number): Promise<void> {
  await db.delete(events).where(eq(events.id, id));
  // event_items, transactions, promos cascade automatically
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Items CRUD
// "Event items" are the products that belong to a specific event.
// There is no global product catalog — each event owns its own copy of every item.
// ─────────────────────────────────────────────────────────────────────────────

export async function getEventItems(eventId: number): Promise<EventItem[]> {
  return db
    .select()
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId))
    .orderBy(eventItems.name);
}

export async function getEventItemById(id: number): Promise<EventItem | null> {
  const [item] = await db
    .select()
    .from(eventItems)
    .where(eq(eventItems.id, id))
    .limit(1);

  return item ?? null;
}

export async function getEventItemByItemId(
  eventId: number,
  itemId: string
): Promise<EventItem | null> {
  const normalizedItemId = normalizeText(itemId);

  if (!normalizedItemId) {
    return null;
  }

  const [item] = await db
    .select()
    .from(eventItems)
    .where(
      sql`${eventItems.eventId} = ${eventId}
        AND trim(${eventItems.itemId}) = ${normalizedItemId}`
    )
    .limit(1);

  return item ?? null;
}

export async function addEventItem(
  eventId: number,
  data: Omit<NewEventItem, "eventId" | "id" | "createdAt">
): Promise<EventItem> {
  const existing = await getEventItemByItemId(eventId, data.itemId);

  if (existing) {
    return updateEventItem(existing.id, data);
  }

  const [item] = await db
    .insert(eventItems)
    .values({
      ...data,
      eventId,
    })
    .returning();

  return item;
}

export async function updateEventItem(
  id: number,
  data: Partial<Omit<NewEventItem, "eventId" | "id" | "createdAt">>
): Promise<EventItem> {
  const [item] = await db
    .update(eventItems)
    .set(data)
    .where(eq(eventItems.id, id))
    .returning();

  if (!item) {
    throw new Error("Event item not found.");
  }

  return item;
}

export async function removeEventItem(id: number): Promise<void> {
  await db.delete(eventItems).where(eq(eventItems.id, id));
  // stock_entries, promo_items, transaction_items cascade automatically
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk upsert
// Used by Excel import.
// ─────────────────────────────────────────────────────────────────────────────

export async function bulkUpsertEventItems(
  eventId: number,
  rows: {
    itemId: string;
    baseItemNo?: string;
    name: string;
    color?: string;
    variantCode?: string;
    unit?: string;
    netPrice: string;
    retailPrice: string;
    stock: number;
  }[]
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  if (rows.length === 0) {
    return { inserted, updated, errors };
  }

  const cleanedRows = rows
    .map((row) => ({
      itemId: normalizeText(row.itemId),
      baseItemNo: normalizeText(row.baseItemNo),
      name: normalizeText(row.name),
      color: normalizeText(row.color),
      variantCode: normalizeText(row.variantCode),
      unit: normalizeText(row.unit) || "PCS",
      netPrice: normalizeText(row.netPrice),
      retailPrice: normalizeText(row.retailPrice),
      stock: Number.isFinite(Number(row.stock))
        ? Math.trunc(Number(row.stock))
        : 0,
    }))
    .filter((row) => row.itemId && row.name);

  /**
   * If the uploaded Excel accidentally has duplicate Reference No.,
   * keep the last row and report it.
   */
  const rowsByItemId = new Map<string, (typeof cleanedRows)[number]>();

  for (const row of cleanedRows) {
    if (rowsByItemId.has(row.itemId)) {
      errors.push(
        `Duplicate Reference No. "${row.itemId}" found in Excel. Last row was used.`
      );
    }

    rowsByItemId.set(row.itemId, row);
  }

  const uniqueRows = [...rowsByItemId.values()];

  const existingRows = await db
    .select({
      id: eventItems.id,
      itemId: eventItems.itemId,
    })
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId));

  const existingMap = new Map<string, number>(
    existingRows.map((row) => [normalizeText(row.itemId), row.id])
  );

  for (const row of uniqueRows) {
    const netPrice = Number(row.netPrice);
    const retailPrice = Number(row.retailPrice);

    if (!Number.isFinite(netPrice) || netPrice <= 0) {
      errors.push(`"${row.itemId}" has invalid BAZAR PRICE.`);
      continue;
    }

    const payload: Omit<NewEventItem, "eventId" | "id" | "createdAt"> = {
      itemId: row.itemId,
      baseItemNo: row.baseItemNo || row.itemId,
      name: row.name,
      color: row.color || null,
      variantCode: row.variantCode || null,
      unit: row.unit || "PCS",
      netPrice: String(netPrice),
      retailPrice: String(retailPrice > 0 ? retailPrice : netPrice),
      stock: Number.isFinite(row.stock) ? row.stock : 0,
    };

    try {
      const existingId = existingMap.get(row.itemId);

      if (existingId) {
        await db
          .update(eventItems)
          .set(payload)
          .where(eq(eventItems.id, existingId));

        updated++;
      } else {
        const [newItem] = await db
          .insert(eventItems)
          .values({
            ...payload,
            eventId,
          })
          .returning();

        existingMap.set(row.itemId, newItem.id);
        inserted++;
      }
    } catch (error) {
      errors.push(
        `"${row.itemId}" failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return { inserted, updated, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers for UI/forms
// ─────────────────────────────────────────────────────────────────────────────

export function getEventStatusLabel(status: string): string {
  return (
    EVENT_STATUSES.find((item) => item.value === status)?.label ??
    status ??
    "Unknown"
  );
}

export function isValidEventCode(code: string): boolean {
  return /^\d{4}$/.test(normalizeText(code));
}