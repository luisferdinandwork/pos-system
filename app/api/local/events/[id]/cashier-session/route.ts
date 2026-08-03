// app/api/local/events/[id]/cashier-session/route.ts
// GET  → finds the active Neon cashier session for this event whose cashierName
//        matches the currently logged-in user (from next-auth session). Returns
//        no session (404) if there's no exact match — never guesses by falling
//        back to someone else's open session.
//        The POS uses this to auto-attach cashierName + cashierSessionId to sales.
// PUT  → closes the logged-in cashier's own active session (called on POS logout)
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
import {
  cacheCloudCashierSession,
  getCachedCloudCashierSession,
} from "@/lib/local-pos";

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

  // The cloud DB (Neon) may be unreachable while the local POS itself is up
  // and running offline. Without a fallback, every reload while offline
  // silently drops the cashier's already-open session and sales fall back
  // to "anonymous" — fall back to the last session we successfully saw for
  // this event instead of failing outright.
  try {
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

    // Only ever attach a session that actually belongs to this logged-in
    // cashier. Falling back to "some other open session" here used to
    // silently misattribute sales/cash-drawer counts to the wrong person
    // whenever the name match failed (or no session had been opened for
    // this cashier yet) — better to report "no session" and let the POS
    // show the anonymous-cashier state than lie about who's selling.
    const matched = userName
      ? openSessions.find(s => s.cashierName.trim() === userName.trim()) ?? null
      : openSessions.length === 1
        ? openSessions[0]
        : null;

    if (!matched) return NextResponse.json(null, { status: 404 });

    cacheCloudCashierSession(eventId, matched);

    return NextResponse.json(matched);
  } catch (error) {
    console.error("[LocalCashierSessionRoute] Cloud lookup failed, falling back to cache:", error);

    const cached = getCachedCloudCashierSession(eventId, userName);

    return NextResponse.json(cached, { status: cached ? 200 : 404 });
  }
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

  // Same rule as GET: never close a session that isn't this logged-in
  // cashier's own — closing "the most recent open session" as a fallback
  // could end someone else's shift and wipe their drawer-count context.
  const session = userName
    ? openSessions.find(s => s.cashierName.trim() === userName.trim()) ?? null
    : openSessions.length === 1
      ? openSessions[0]
      : null;

  if (!session)
    return NextResponse.json(
      { error: "No active session found for the logged-in cashier." },
      { status: 404 }
    );

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