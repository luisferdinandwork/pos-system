// app/api/transactions/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTransactionItems } from "@/lib/transactions";

export const runtime = "nodejs";

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

    const items = await getTransactionItems(transactionId);

    return NextResponse.json(items);
  } catch (error) {
    console.error("[TransactionItemsRoute GET] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load transaction items",
      },
      { status: 500 }
    );
  }
}