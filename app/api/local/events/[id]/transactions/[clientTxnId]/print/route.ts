// app/api/local/events/[id]/transactions/[clientTxnId]/print/route.ts
import { NextRequest, NextResponse } from "next/server";
import { localDb } from "@/lib/local-db";
import { localTransactions } from "@/lib/local-db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

// POST — increment print count and return updated transaction
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; clientTxnId: string }> }
) {
  const { clientTxnId } = await params;
  const decoded = decodeURIComponent(clientTxnId);

  try {
    localDb
      .update(localTransactions)
      .set({
        receiptPrintCount: sql`${localTransactions.receiptPrintCount} + 1`,
      })
      .where(eq(localTransactions.clientTxnId, decoded))
      .run();

    const txn = localDb
      .select({ clientTxnId: localTransactions.clientTxnId, receiptPrintCount: localTransactions.receiptPrintCount })
      .from(localTransactions)
      .where(eq(localTransactions.clientTxnId, decoded))
      .get();

    return NextResponse.json({ success: true, receiptPrintCount: txn?.receiptPrintCount ?? 1 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to log print" },
      { status: 500 }
    );
  }
}