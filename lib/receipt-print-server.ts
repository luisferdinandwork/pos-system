// lib/receipt-print-server.ts
import { db } from "@/lib/db";
import { receiptPrintLogs } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

export async function getCloudReceiptPrintCount(transactionId: number) {
  const [row] = await db
    .select({
      count: sql<number>`count(${receiptPrintLogs.id})`,
    })
    .from(receiptPrintLogs)
    .where(eq(receiptPrintLogs.transactionId, transactionId));

  return Number(row?.count ?? 0);
}

export async function getCloudReceiptPrintCounts(transactionIds: number[]) {
  if (transactionIds.length === 0) {
    return {};
  }

  const rows = await db
    .select({
      transactionId: receiptPrintLogs.transactionId,
      count: sql<number>`count(${receiptPrintLogs.id})`,
    })
    .from(receiptPrintLogs)
    .where(inArray(receiptPrintLogs.transactionId, transactionIds))
    .groupBy(receiptPrintLogs.transactionId);

  const counts: Record<number, number> = {};

  for (const id of transactionIds) {
    counts[id] = 0;
  }

  for (const row of rows) {
    counts[Number(row.transactionId)] = Number(row.count ?? 0);
  }

  return counts;
}

export async function logCloudReceiptPrint(
  transactionId: number,
  options?: {
    printType?: "original" | "reprint" | "synced_local";
    printedBy?: string | null;
  }
) {
  await db.insert(receiptPrintLogs).values({
    transactionId,
    printType: options?.printType ?? "reprint",
    printedBy: options?.printedBy ?? null,
    printedAt: new Date(),
  });

  return getCloudReceiptPrintCount(transactionId);
}

/**
 * Makes cloud receipt_print_logs count match the local count.
 * Example:
 * local receipt_print_count = 3
 * cloud already has 1 row
 * this inserts 2 more rows.
 */
export async function syncCloudReceiptPrintCount(
  transactionId: number,
  localPrintCount: number,
  printedBy?: string | null
) {
  const wanted = Math.max(0, Math.trunc(Number(localPrintCount ?? 0)));
  const current = await getCloudReceiptPrintCount(transactionId);
  const missing = Math.max(0, wanted - current);

  for (let i = 0; i < missing; i++) {
    await db.insert(receiptPrintLogs).values({
      transactionId,
      printType: current + i === 0 ? "original" : "synced_local",
      printedBy: printedBy ?? "local-pos-sync",
      printedAt: new Date(),
    });
  }

  return {
    transactionId,
    localPrintCount: wanted,
    cloudBefore: current,
    inserted: missing,
    cloudAfter: current + missing,
  };
}