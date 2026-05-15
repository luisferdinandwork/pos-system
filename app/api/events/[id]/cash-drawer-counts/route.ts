// app/api/events/[id]/cash-drawer-counts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  cashDrawerCounts,
  cashierSessions,
  transactions,
} from "@/lib/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

async function getExpectedCash(eventId: number, cashierSessionId?: number | null) {
  const sessionWhere = cashierSessionId
    ? eq(cashierSessions.id, cashierSessionId)
    : and(eq(cashierSessions.eventId, eventId), isNull(cashierSessions.closedAt));

  const [session] = await db
    .select({
      id: cashierSessions.id,
      cashierName: cashierSessions.cashierName,
      openingCash: cashierSessions.openingCash,
      openedAt: cashierSessions.openedAt,
    })
    .from(cashierSessions)
    .where(sessionWhere)
    .orderBy(desc(cashierSessions.openedAt))
    .limit(1);

  if (!session) {
    return {
      activeSession: null,
      expectedCash: 0,
      cashSales: 0,
      openingCash: 0,
    };
  }

  const [cashAgg] = await db
    .select({
      cashSales: sql<number>`coalesce(sum(${transactions.finalAmount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.eventId, eventId),
        eq(transactions.cashierSessionId, session.id),
        sql`lower(coalesce(${transactions.paymentMethod}, '')) like '%cash%'`
      )
    );

  const openingCash = Number(session.openingCash ?? 0);
  const cashSales = Number(cashAgg?.cashSales ?? 0);
  const expectedCash = openingCash + cashSales;

  return {
    activeSession: session,
    expectedCash,
    cashSales,
    openingCash,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const sessionIdParam = req.nextUrl.searchParams.get("cashierSessionId");
    const cashierSessionId = sessionIdParam ? Number(sessionIdParam) : null;

    const [counts, expected] = await Promise.all([
      db
        .select()
        .from(cashDrawerCounts)
        .where(eq(cashDrawerCounts.eventId, eventId))
        .orderBy(desc(cashDrawerCounts.countedAt)),
      getExpectedCash(
        eventId,
        cashierSessionId && Number.isFinite(cashierSessionId)
          ? cashierSessionId
          : null
      ),
    ]);

    return NextResponse.json({
      counts,
      ...expected,
    });
  } catch (error) {
    console.error("[GET /api/events/[id]/cash-drawer-counts]", error);
    return NextResponse.json(
      { error: "Failed to load cash drawer counts" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const actualCash = Number(body.actualCash ?? 0);
    const cashierSessionId =
      body.cashierSessionId != null && Number.isFinite(Number(body.cashierSessionId))
        ? Number(body.cashierSessionId)
        : null;

    if (!Number.isFinite(actualCash)) {
      return NextResponse.json(
        { error: "actualCash must be a valid number" },
        { status: 400 }
      );
    }

    const expected = await getExpectedCash(eventId, cashierSessionId);
    const expectedCash = Number(body.expectedCash ?? expected.expectedCash ?? 0);
    const difference = actualCash - expectedCash;

    const [row] = await db
      .insert(cashDrawerCounts)
      .values({
        eventId,
        cashierSessionId: cashierSessionId ?? expected.activeSession?.id ?? null,
        countedBy: body.countedBy ? String(body.countedBy) : expected.activeSession?.cashierName ?? null,
        expectedCash: String(expectedCash),
        actualCash: String(actualCash),
        difference: String(difference),
        reason: body.reason ? String(body.reason) : "count",
        notes: body.notes ? String(body.notes) : null,
        countedAt: body.countedAt ? new Date(body.countedAt) : new Date(),
      })
      .returning();

    return NextResponse.json({
      count: row,
      expected,
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/events/[id]/cash-drawer-counts]", error);
    return NextResponse.json(
      { error: "Failed to save cash drawer count" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const countId = Number(req.nextUrl.searchParams.get("countId"));

    if (!Number.isFinite(countId)) {
      return NextResponse.json({ error: "countId is required" }, { status: 400 });
    }

    await db.delete(cashDrawerCounts).where(eq(cashDrawerCounts.id, countId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/events/[id]/cash-drawer-counts]", error);
    return NextResponse.json(
      { error: "Failed to delete cash drawer count" },
      { status: 500 }
    );
  }
}
