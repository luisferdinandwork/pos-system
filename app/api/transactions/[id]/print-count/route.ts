// app/api/transactions/[id]/print-count/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCloudReceiptPrintCount } from "@/lib/receipt-print-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transactionId = Number(id);

    if (!Number.isFinite(transactionId)) {
      return NextResponse.json(
        { error: "Invalid transaction ID." },
        { status: 400 }
      );
    }

    const count = await getCloudReceiptPrintCount(transactionId);

    return NextResponse.json({
      transactionId,
      count,
    });
  } catch (error) {
    console.error("[CloudReceiptPrintCountRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load receipt print count.",
      },
      { status: 500 }
    );
  }
}