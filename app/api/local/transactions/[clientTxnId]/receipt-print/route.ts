// app/api/local/transactions/[clientTxnId]/receipt-print/route.ts
import { NextRequest, NextResponse } from "next/server";
import { incrementLocalReceiptPrintCount } from "@/lib/local-pos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientTxnId: string }> }
) {
  try {
    const { clientTxnId } = await params;

    const result = await incrementLocalReceiptPrintCount(
      decodeURIComponent(clientTxnId)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[LocalReceiptPrintRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update local receipt print count.",
      },
      { status: 500 }
    );
  }
}