// app/api/transactions/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, transactionItems } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transactionId = Number(id);

    if (!Number.isFinite(transactionId)) {
      return NextResponse.json(
        { error: "Invalid transaction ID" },
        { status: 400 }
      );
    }

    // Optional but useful: verify transaction exists first
    const [txn] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!txn) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const items = await db
      .select({
        id: transactionItems.id,
        transactionId: transactionItems.transactionId,
        eventItemId: transactionItems.eventItemId,
        itemId: transactionItems.itemId,
        productName: transactionItems.productName,
        quantity: transactionItems.quantity,
        unitPrice: transactionItems.unitPrice,
        discountAmt: transactionItems.discountAmt,
        finalPrice: transactionItems.finalPrice,
        subtotal: transactionItems.subtotal,
        promoApplied: transactionItems.promoApplied,
      })
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, transactionId))
      .orderBy(asc(transactionItems.id));

    return NextResponse.json(items);
  } catch (error) {
    console.error("[GET /api/transactions/[id]/items]", error);
    return NextResponse.json(
      { error: "Failed to load transaction items" },
      { status: 500 }
    );
  }
}