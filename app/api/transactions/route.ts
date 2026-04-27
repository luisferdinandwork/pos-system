// app/api/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, transactionItems, payments, eventItems } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  // paymentMethod and paymentReference now live on the transactions row directly
  const rows = await db
    .select({
      id:               transactions.id,
      eventId:          transactions.eventId,
      totalAmount:      transactions.totalAmount,
      discount:         transactions.discount,
      finalAmount:      transactions.finalAmount,
      paymentMethod:    transactions.paymentMethod,
      paymentReference: transactions.paymentReference,
      createdAt:        transactions.createdAt,
    })
    .from(transactions)
    .orderBy(sql`${transactions.createdAt} desc`);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const b = await req.json();

  // ── 1. Transaction header ─────────────────────────────────────────────────
  const [txn] = await db.insert(transactions).values({
    eventId:          b.eventId,
    totalAmount:      String(b.totalAmount),
    discount:         String(b.discount    ?? 0),
    finalAmount:      String(b.finalAmount),
    paymentMethod:    b.paymentMethod    ?? null,
    paymentReference: b.paymentReference ?? null,
  }).returning();

  // ── 2. Line items — uses eventItemId, not eventProductId ──────────────────
  await db.insert(transactionItems).values(
    b.items.map((i: {
      eventItemId:  number;
      productName:  string;
      itemId:       string;
      quantity:     number;
      unitPrice:    number;
      discountAmt:  number;
      finalPrice:   number;
      subtotal:     number;
      promoApplied?: string | null;
    }) => ({
      transactionId: txn.id,
      eventItemId:   i.eventItemId,
      productName:   i.productName,
      itemId:        i.itemId,
      quantity:      i.quantity,
      unitPrice:     String(i.unitPrice),
      discountAmt:   String(i.discountAmt  ?? 0),
      finalPrice:    String(i.finalPrice),
      subtotal:      String(i.subtotal),
      promoApplied:  i.promoApplied ?? null,
    }))
  );

  // ── 3. Payment record ─────────────────────────────────────────────────────
  await db.insert(payments).values({
    transactionId: txn.id,
    method:        b.paymentMethod    ?? "Cash",
    reference:     b.paymentReference ?? null,
  });

  // ── 4. Deduct stock from event_items (denormalized column) ────────────────
  for (const item of b.items as { eventItemId: number; quantity: number; freeQty?: number }[]) {
    const totalDeduct = item.quantity + (item.freeQty ?? 0);
    await db
      .update(eventItems)
      .set({ stock: sql`stock - ${totalDeduct}` })
      .where(eq(eventItems.id, item.eventItemId));
  }

  return NextResponse.json(txn, { status: 201 });
}