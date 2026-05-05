// app/api/events/[id]/stock/transfer-out/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildTransferOutExcel } from "@/lib/export-excel";
import { getAllEvents } from "@/lib/events";

function safeFileName(name: string) {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);

  if (!Number.isFinite(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  const events = await getAllEvents();
  const event = events.find((row) => row.id === eventId);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const data = await buildTransferOutExcel(eventId, event.name);
  const fileName = safeFileName(event.name);

  return new NextResponse(data, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}-transfer-out.xlsx"`,
    },
  });
}