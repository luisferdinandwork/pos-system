// app/api/transactions/[id]/receipt-print/route.ts
import { NextRequest, NextResponse } from "next/server";
import { logCloudReceiptPrint } from "@/lib/receipt-print-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
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

    const body = await req.json().catch(() => ({}));

    const count = await logCloudReceiptPrint(transactionId, {
      printType: body.printType ?? "reprint",
      printedBy: body.printedBy ?? null,
    });

    return NextResponse.json({
      transactionId,
      count,
    });
  } catch (error) {
    console.error("[CloudReceiptPrintRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update cloud receipt print count.",
      },
      { status: 500 }
    );
  }
}