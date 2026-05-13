// app/api/events/[id]/products/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildEventItemExcel, toSafeFilename } from "@/lib/export-excel";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId)) return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });

  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const safeName   = eventRow?.name ? toSafeFilename(eventRow.name) : `event_${eventId}`;

  const data = await buildEventItemExcel(eventId);
  return new NextResponse(data as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}_items.xlsx"`,
    },
  });
}