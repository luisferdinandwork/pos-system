// app/api/events/[id]/report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildEventReportExcel, toSafeFilename } from "@/lib/export-excel";
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

  try {
    const [eventRow] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId)).limit(1);
    const safeName   = eventRow?.name ? toSafeFilename(eventRow.name) : `event_${eventId}`;
    const date       = new Date().toISOString().slice(0, 10);
    const data       = await buildEventReportExcel(eventId);

    return new NextResponse(data as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}_report_${date}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[EventReportRoute] Failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate event report" }, { status: 500 });
  }
}