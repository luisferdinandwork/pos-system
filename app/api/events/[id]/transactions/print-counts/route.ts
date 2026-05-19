// app/api/events/[id]/transactions/print-counts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTransactionReceiptPrintCountsByEvent } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json(
        { error: "Invalid event ID." },
        { status: 400 }
      );
    }

    const counts = await getTransactionReceiptPrintCountsByEvent(eventId);

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("[EventPrintCountsRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load receipt print counts.",
      },
      { status: 500 }
    );
  }
}
