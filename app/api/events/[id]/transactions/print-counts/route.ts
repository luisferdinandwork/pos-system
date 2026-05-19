// app/api/events/[id]/transactions/print-counts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receiptPrintLogs, transactions } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json(
        { error: "Invalid event ID." },
        { status: 400 }
      );
    }

    const txnRows = await db
      .select({
        id: transactions.id,
      })
      .from(transactions)
      .where(eq(transactions.eventId, eventId));

    const txnIds = txnRows.map((txn) => txn.id);

    if (txnIds.length === 0) {
      return NextResponse.json({
        eventId,
        counts: {},
      });
    }

    const rows = await db
      .select({
        transactionId: receiptPrintLogs.transactionId,
        count: sql<number>`count(${receiptPrintLogs.id})`,
      })
      .from(receiptPrintLogs)
      .where(inArray(receiptPrintLogs.transactionId, txnIds))
      .groupBy(receiptPrintLogs.transactionId);

    const counts: Record<number, number> = {};

    for (const txnId of txnIds) {
      counts[txnId] = 0;
    }

    for (const row of rows) {
      counts[Number(row.transactionId)] = Number(row.count ?? 0);
    }

    return NextResponse.json({
      eventId,
      counts,
    });
  } catch (error) {
    console.error("[EventTransactionPrintCountsRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load receipt print counts.",
      },
      { status: 500 }
    );
  }
}