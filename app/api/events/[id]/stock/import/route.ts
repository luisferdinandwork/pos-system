// app/api/events/[id]/stock/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { importStockFromExcel } from "@/lib/export-excel";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId)) return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });

  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!eventRow) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const formData = await req.formData();
  const file     = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const data   = new Uint8Array(await file.arrayBuffer());
  const result = await importStockFromExcel(data, eventId, eventRow.name);
  return NextResponse.json(result);
}