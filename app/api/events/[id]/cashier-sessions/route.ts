// app/api/events/[id]/cashier-sessions/route.ts
// GET  → list all cashier sessions for this event (open + closed)
// POST → open a new session, assigning a registered event user

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cashierSessions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId))
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

  const rows = await db
    .select()
    .from(cashierSessions)
    .where(eq(cashierSessions.eventId, eventId))
    .orderBy(desc(cashierSessions.openedAt));

  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId))
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const cashierName = String(body.cashierName ?? "").trim();
  const openingCash = Number(body.openingCash ?? 0);
  const notes       = body.notes ? String(body.notes).trim() : null;

  if (!cashierName)
    return NextResponse.json({ error: "cashierName is required" }, { status: 400 });

  const [session] = await db
    .insert(cashierSessions)
    .values({
      eventId,
      cashierName,
      openingCash: String(openingCash),
      openedAt:    new Date(),
      notes,
    })
    .returning();

  return NextResponse.json(session, { status: 201 });
}