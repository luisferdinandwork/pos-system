// app/api/users/[id]/events/route.ts
import { NextResponse } from "next/server";
import { assignUserToEvent, unassignUserFromEvent } from "@/lib/auth-users";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = parseId(id);
  const body = await request.json();
  const eventId = parseId(body.eventId);

  if (!userId || !eventId) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  await assignUserToEvent(userId, eventId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = parseId(id);
  const url = new URL(request.url);
  const eventId = parseId(url.searchParams.get("eventId"));

  if (!userId || !eventId) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  await unassignUserFromEvent(userId, eventId);
  return NextResponse.json({ ok: true });
}
