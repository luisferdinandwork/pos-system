// app/api/events/[id]/products/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildEventItemExcel } from "@/lib/export-excel";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id }  = await params;
  const eventId = Number(id);

  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  const data = await buildEventItemExcel(eventId);

  return new NextResponse(data, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="event-${eventId}-items.xlsx"`,
    },
  });
}