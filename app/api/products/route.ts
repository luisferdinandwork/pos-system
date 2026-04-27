// app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eventItems, events } from "@/lib/db/schema";
import { eq, ilike, or, sql } from "drizzle-orm";

// ── GET /api/products ─────────────────────────────────────────────────────────
// Returns a deduplicated list of products (by itemId) with the events they
// appear in. Supports ?q= for search and ?itemId= for exact lookup.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q      = searchParams.get("q")      ?? "";
  const itemId = searchParams.get("itemId") ?? "";

  // Build the base join: event_items ← events
  const rows = await db
    .select({
      // Item identity
      eventItemId: eventItems.id,
      itemId:      eventItems.itemId,
      baseItemNo:  eventItems.baseItemNo,
      name:        eventItems.name,
      color:       eventItems.color,
      variantCode: eventItems.variantCode,
      unit:        eventItems.unit,
      // Per-event prices and stock
      netPrice:    eventItems.netPrice,
      retailPrice: eventItems.retailPrice,
      stock:       eventItems.stock,
      createdAt:   eventItems.createdAt,
      // Event info
      eventId:     events.id,
      eventName:   events.name,
      eventStatus: events.status,
      eventLocation: events.location,
    })
    .from(eventItems)
    .innerJoin(events, eq(events.id, eventItems.eventId))
    .where(
      itemId
        ? eq(eventItems.itemId, itemId)
        : q
          ? or(
              ilike(eventItems.itemId,     `%${q}%`),
              ilike(eventItems.name,       `%${q}%`),
              ilike(eventItems.baseItemNo, `%${q}%`)
            )
          : undefined
    )
    .orderBy(eventItems.name, eventItems.itemId);

  // Group by itemId so callers can see all events a product code appears in
  const grouped = new Map<
    string,
    {
      itemId:      string;
      baseItemNo:  string | null;
      name:        string;
      color:       string | null;
      variantCode: string | null;
      unit:        string | null;
      events: {
        eventItemId: number;
        eventId:     number;
        eventName:   string;
        eventStatus: string;
        eventLocation: string | null;
        netPrice:    string;
        retailPrice: string;
        stock:       number;
        createdAt:   Date | null;
      }[];
    }
  >();

  for (const row of rows) {
    const key = row.itemId;
    if (!grouped.has(key)) {
      grouped.set(key, {
        itemId:      row.itemId,
        baseItemNo:  row.baseItemNo,
        name:        row.name,
        color:       row.color,
        variantCode: row.variantCode,
        unit:        row.unit,
        events:      [],
      });
    }
    grouped.get(key)!.events.push({
      eventItemId:   row.eventItemId,
      eventId:       row.eventId,
      eventName:     row.eventName,
      eventStatus:   row.eventStatus,
      eventLocation: row.eventLocation,
      netPrice:      row.netPrice,
      retailPrice:   row.retailPrice,
      stock:         row.stock,
      createdAt:     row.createdAt,
    });
  }

  return NextResponse.json(Array.from(grouped.values()));
}