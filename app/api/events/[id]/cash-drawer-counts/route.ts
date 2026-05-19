// app/api/events/[id]/cash-drawer-counts/route.ts
// GET  → returns counts list + active session (from cashier_sessions) + expected cash
// POST → saves a new drawer count
// DELETE → removes a count by countId query param
//
// Expected cash formula:
//   openingCash (from active session)
//   + cashSales (sum of finalAmount where paymentMethod starts with "Cash" or "Tunai", scoped to session openedAt)
//   − changeGiven (sum of changeAmount for those same transactions)
//
// The session is pulled from cashier_sessions (Neon), not self-reported.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cashDrawerCounts, cashierSessions, transactions } from "@/lib/db/schema";
import { and, eq, gte, isNull, desc, sql } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId))
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

  // ── Find the most recent open cashier session for this event ──────────────
  const [activeSession] = await db
    .select()
    .from(cashierSessions)
    .where(
      and(
        eq(cashierSessions.eventId, eventId),
        isNull(cashierSessions.closedAt)
      )
    )
    .orderBy(desc(cashierSessions.openedAt))
    .limit(1);

  const openingCash = Number(activeSession?.openingCash ?? 0);
  const sessionStart = activeSession?.openedAt ?? null;

  // ── Cash transactions since this session opened ───────────────────────────
  // "Cash" payment: paymentMethod ilike 'cash%' or 'tunai%'
  // Scope to transactions created after the session opened
  const cashTxns = await db
    .select({
      finalAmount: transactions.finalAmount,
      changeAmount: transactions.changeAmount,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.eventId, eventId),
        sql`lower(${transactions.paymentMethod}) like 'cash%'
            or lower(${transactions.paymentMethod}) like 'tunai%'`,
        ...(sessionStart
          ? [gte(transactions.createdAt, new Date(sessionStart))]
          : [])
      )
    );

  const cashSales  = cashTxns.reduce((s, t) => s + Number(t.finalAmount  ?? 0), 0);
  const changeGiven = cashTxns.reduce((s, t) => s + Number(t.changeAmount ?? 0), 0);

  // Expected = opening float + cash received − change given back
  // cashTendered = finalAmount + changeAmount, so:
  //   cash received into drawer  = sum of cashTendered = finalAmount + changeAmount
  //   change handed back         = sum of changeAmount
  //   net cash in drawer         = sum of finalAmount  (= cashTendered - change)
  // Therefore: expected = openingCash + cashSales (net cash, already = cashTendered - change)
  const expectedCash = openingCash + cashSales;

  // ── All drawer counts for this event ────────────────────────────────────────
  const counts = await db
    .select()
    .from(cashDrawerCounts)
    .where(eq(cashDrawerCounts.eventId, eventId))
    .orderBy(desc(cashDrawerCounts.countedAt));

  return NextResponse.json({
    counts,
    activeSession: activeSession
      ? {
          id:          activeSession.id,
          cashierName: activeSession.cashierName,
          openingCash: activeSession.openingCash,
          openedAt:    activeSession.openedAt,
        }
      : null,
    expectedCash,
    openingCash,
    cashSales,
    changeGiven,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId))
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

  const body         = await req.json().catch(() => ({}));
  const actualCash   = Number(body.actualCash   ?? 0);
  const expectedCash = Number(body.expectedCash ?? 0);
  const difference   = actualCash - expectedCash;

  const [row] = await db
    .insert(cashDrawerCounts)
    .values({
      eventId,
      cashierSessionId: body.cashierSessionId ?? null,
      countedBy:        body.countedBy        ?? null,
      expectedCash:     String(expectedCash),
      actualCash:       String(actualCash),
      difference:       String(difference),
      reason:           body.reason ?? "count",
      notes:            body.notes  ?? null,
      countedAt:        new Date(),
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId))
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const countId = Number(searchParams.get("countId"));
  if (!Number.isFinite(countId) || countId <= 0)
    return NextResponse.json({ error: "Invalid countId" }, { status: 400 });

  await db
    .delete(cashDrawerCounts)
    .where(
      and(
        eq(cashDrawerCounts.id, countId),
        eq(cashDrawerCounts.eventId, eventId)
      )
    );

  return NextResponse.json({ success: true });
}