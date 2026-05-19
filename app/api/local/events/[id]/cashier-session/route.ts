// app/api/local/events/[id]/cashier-session/route.ts
// GET  → finds the active Neon cashier session for this event whose cashierName
//        matches the currently logged-in user (from next-auth session), OR
//        returns the most recently opened unclosed session if no user match.
//        The POS uses this to auto-attach cashierName + cashierSessionId to sales.
// PUT  → closes the active session (called when cashier logs out of POS)
//
// NOTE: Sessions are now CREATED by admins from the event detail page
//       (POST /api/events/[id]/cashier-sessions). This route is read-only
//       from the POS cashier's perspective.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { cashierSessions } from "@/lib/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId))
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

  // Try to match the logged-in user's name to an open session
  const authSession = await getServerSession(authOptions);
  const userName    = authSession?.user?.name ?? null;

  // All open sessions for this event
  const openSessions = await db
    .select()
    .from(cashierSessions)
    .where(
      and(
        eq(cashierSessions.eventId, eventId),
        isNull(cashierSessions.closedAt)
      )
    )
    .orderBy(desc(cashierSessions.openedAt));

  if (openSessions.length === 0)
    return NextResponse.json(null, { status: 404 });

  // Prefer the session whose cashierName matches the logged-in user
  const matched = userName
    ? openSessions.find(s => s.cashierName === userName) ?? openSessions[0]
    : openSessions[0];

  return NextResponse.json(matched);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId))
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Find the matching open session (same logic as GET)
  const authSession = await getServerSession(authOptions);
  const userName    = authSession?.user?.name ?? null;

  const openSessions = await db
    .select()
    .from(cashierSessions)
    .where(
      and(
        eq(cashierSessions.eventId, eventId),
        isNull(cashierSessions.closedAt)
      )
    )
    .orderBy(desc(cashierSessions.openedAt));

  if (openSessions.length === 0)
    return NextResponse.json({ error: "No active session found" }, { status: 404 });

  const session = userName
    ? openSessions.find(s => s.cashierName === userName) ?? openSessions[0]
    : openSessions[0];

  const [closed] = await db
    .update(cashierSessions)
    .set({
      closedAt:    new Date(),
      closingCash: body.closingCash != null ? String(Number(body.closingCash)) : undefined,
      notes:       body.notes ? String(body.notes) : undefined,
    })
    .where(eq(cashierSessions.id, session.id))
    .returning();

  return NextResponse.json(closed);
}