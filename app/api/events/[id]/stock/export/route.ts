// app/api/events/[id]/stock/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildStockExcel, toSafeFilename } from "@/lib/export-excel";
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
  if (!eventRow) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const data     = await buildStockExcel(eventId, eventRow.name);
  const safeName = toSafeFilename(eventRow.name);

  return new NextResponse(data as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}_transfer_in_template.xlsx"`,
    },
  });
}