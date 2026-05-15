// app/api/transactions/[id]/receipt-print/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receiptPrintLogs, transactions } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

// GET /api/transactions/[id]/receipt-print
// Returns print count + log entries for a cloud transaction
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const txnId  = Number(id);
  if (!Number.isFinite(txnId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const logs = await db
    .select()
    .from(receiptPrintLogs)
    .where(eq(receiptPrintLogs.transactionId, txnId))
    .orderBy(receiptPrintLogs.printedAt);

  return NextResponse.json({ printCount: logs.length, logs });
}

// POST /api/transactions/[id]/receipt-print
// Body: { printType?: "original"|"reprint", printedBy?: string }
// Logs a print event and returns updated count
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const txnId  = Number(id);
  if (!Number.isFinite(txnId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Verify transaction exists
  const [txn] = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, txnId)).limit(1);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  const [log] = await db
    .insert(receiptPrintLogs)
    .values({
      transactionId: txnId,
      printType:     body.printType  ?? "reprint",
      printedBy:     body.printedBy  ?? null,
    })
    .returning();

  // Return updated count
  const [{ value: printCount }] = await db
    .select({ value: count() })
    .from(receiptPrintLogs)
    .where(eq(receiptPrintLogs.transactionId, txnId));

  return NextResponse.json({ log, printCount });
}