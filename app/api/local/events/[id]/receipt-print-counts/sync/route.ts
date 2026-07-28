// app/api/local/events/[id]/receipt-print-counts/sync/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

    const { syncLocalReceiptPrintCountsToNeon } = await import("@/lib/local-pos");

    const result = await syncLocalReceiptPrintCountsToNeon(eventId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[LocalReceiptPrintSyncRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync local receipt print counts.",
      },
      { status: 500 }
    );
  }
}
