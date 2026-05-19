// app/api/events/[id]/cashier-sessions/[sessionId]/route.ts
// PUT  → close an open session (set closedAt, optional closingCash + notes)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cashierSessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id, sessionId } = await params;
  const eventId   = Number(id);
  const sessId    = Number(sessionId);

  if (!Number.isFinite(eventId) || !Number.isFinite(sessId))
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });

  const body        = await req.json().catch(() => ({}));
  const closingCash = body.closingCash != null ? String(Number(body.closingCash)) : null;
  const notes       = body.notes ? String(body.notes).trim() : null;

  const [updated] = await db
    .update(cashierSessions)
    .set({
      closedAt:    new Date(),
      closingCash: closingCash ?? undefined,
      notes:       notes ?? undefined,
    })
    .where(
      and(
        eq(cashierSessions.id, sessId),
        eq(cashierSessions.eventId, eventId)
      )
    )
    .returning();

  if (!updated)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  return NextResponse.json(updated);
}