// app/api/events/[id]/transactions/print-counts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receiptPrintLogs, transactions } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

// GET /api/events/[id]/transactions/print-counts
// Returns receipt print counts for all cloud transactions in one event.
// Shape: { counts: { [transactionId: string]: number } }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const rows = await db
      .select({
        transactionId: receiptPrintLogs.transactionId,
        printCount: count(receiptPrintLogs.id),
      })
      .from(receiptPrintLogs)
      .innerJoin(transactions, eq(receiptPrintLogs.transactionId, transactions.id))
      .where(eq(transactions.eventId, eventId))
      .groupBy(receiptPrintLogs.transactionId);

    const counts = Object.fromEntries(
      rows.map((row) => [String(row.transactionId), Number(row.printCount ?? 0)])
    );

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("[GET /api/events/[id]/transactions/print-counts]", error);
    return NextResponse.json(
      { error: "Failed to load receipt print counts" },
      { status: 500 }
    );
  }
}
