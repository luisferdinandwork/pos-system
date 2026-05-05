// app/api/events/[id]/stock/transfer-out/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { importTransferOutFromExcel } from "@/lib/export-excel";
import { getAllEvents } from "@/lib/events";

export async function POST(
  req: NextRequest,
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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  const result = await importTransferOutFromExcel(data, eventId, event.name);

  return NextResponse.json(result);
}