// app/api/transactions/[id]/receipt-print/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getTransactionReceiptPrintCount,
  incrementTransactionReceiptPrintCount,
} from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transactionId = Number(id);

    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      return NextResponse.json(
        { error: "Invalid transaction ID." },
        { status: 400 }
      );
    }

    const result = await getTransactionReceiptPrintCount(transactionId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CloudReceiptPrintRoute GET] Failed:", error);

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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transactionId = Number(id);

    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      return NextResponse.json(
        { error: "Invalid transaction ID." },
        { status: 400 }
      );
    }

    const result = await incrementTransactionReceiptPrintCount(transactionId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CloudReceiptPrintRoute POST] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update receipt print count.",
      },
      { status: 500 }
    );
  }
}
