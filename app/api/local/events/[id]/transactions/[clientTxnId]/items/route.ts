// app/api/local/events/[id]/transactions/[clientTxnId]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { localDb } from "@/lib/local-db";
import { localTransactionItems } from "@/lib/local-db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; clientTxnId: string }> }
) {
  const { clientTxnId } = await params;

  if (!clientTxnId) {
    return NextResponse.json({ error: "Missing clientTxnId" }, { status: 400 });
  }

  try {
    const items = localDb
      .select()
      .from(localTransactionItems)
      .where(eq(localTransactionItems.clientTxnId, decodeURIComponent(clientTxnId)))
      .all();

    return NextResponse.json(items);
  } catch (error) {
    console.error("[LocalTxnItemsRoute] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch items" },
      { status: 500 }
    );
  }
}