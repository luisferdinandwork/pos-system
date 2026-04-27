// app/api/products/[itemId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eventItems, events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ── GET /api/products/:itemId ─────────────────────────────────────────────────
// Returns every event_items row that matches the given itemId code,
// joined with event metadata so the caller can see all events it appears in.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;

  const rows = await db
    .select({
      // Item row
      eventItemId: eventItems.id,
      itemId:      eventItems.itemId,
      baseItemNo:  eventItems.baseItemNo,
      name:        eventItems.name,
      color:       eventItems.color,
      variantCode: eventItems.variantCode,
      unit:        eventItems.unit,
      netPrice:    eventItems.netPrice,
      retailPrice: eventItems.retailPrice,
      stock:       eventItems.stock,
      createdAt:   eventItems.createdAt,
      // Event row
      eventId:       events.id,
      eventName:     events.name,
      eventStatus:   events.status,
      eventLocation: events.location,
      eventStartDate: events.startDate,
      eventEndDate:   events.endDate,
    })
    .from(eventItems)
    .innerJoin(events, eq(events.id, eventItems.eventId))
    .where(eq(eventItems.itemId, itemId))
    .orderBy(events.startDate);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: `No event items found for itemId "${itemId}"` },
      { status: 404 }
    );
  }

  // Return the canonical product identity (from first row) + all event appearances
  const first = rows[0];
  return NextResponse.json({
    itemId:      first.itemId,
    baseItemNo:  first.baseItemNo,
    name:        first.name,
    color:       first.color,
    variantCode: first.variantCode,
    unit:        first.unit,
    // All events this itemId appears in
    events: rows.map((r) => ({
      eventItemId:    r.eventItemId,
      eventId:        r.eventId,
      eventName:      r.eventName,
      eventStatus:    r.eventStatus,
      eventLocation:  r.eventLocation,
      eventStartDate: r.eventStartDate,
      eventEndDate:   r.eventEndDate,
      netPrice:       r.netPrice,
      retailPrice:    r.retailPrice,
      stock:          r.stock,
      createdAt:      r.createdAt,
    })),
  });
}