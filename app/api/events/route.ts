// app/api/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAllEvents, createEvent, updateEvent, deleteEvent } from "@/lib/events";

// Convert a datetime-local string → Date | null safely
function toDate(val: string | null | undefined): Date | null {
  if (!val || val.trim() === "") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseEventBody(b: Record<string, unknown>) {
  return {
    name:        b.name        as string,
    location:    (b.location   as string) || null,
    description: (b.description as string) || null,
    status:      (b.status     as string) || "draft",
    startDate:   toDate(b.startDate as string),
    endDate:     toDate(b.endDate   as string),
  };
}

export async function GET() {
  return NextResponse.json(await getAllEvents());
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  return NextResponse.json(await createEvent(parseEventBody(b)), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const b = await req.json();
  return NextResponse.json(await updateEvent(Number(b.id), parseEventBody(b)));
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  await deleteEvent(Number(searchParams.get("id")));
  return NextResponse.json({ success: true });
}