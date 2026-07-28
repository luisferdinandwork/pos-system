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
import {
  closeLocalCashierSession,
  getActiveLocalCashierSession,
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

  const activeSession = getActiveLocalCashierSession(eventId);

  if (!activeSession)
    return NextResponse.json(null, { status: 404 });

  // Prepared cloud sessions are cached in SQLite. A locally opened session is
  // already scoped to this POS, so the most recent active one is the fallback.
  if (!userName || activeSession.cashierName === userName) {
    return NextResponse.json(activeSession);
  }

  return NextResponse.json(activeSession);
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

  const session = getActiveLocalCashierSession(eventId);

  if (!session)
    return NextResponse.json({ error: "No active session found" }, { status: 404 });

  const closed = closeLocalCashierSession(
    session.id,
    body.closingCash != null ? Number(body.closingCash) : undefined,
    body.notes ? String(body.notes) : undefined
  );

  return NextResponse.json(closed);
}
