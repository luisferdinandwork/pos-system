// app/api/local/events/[id]/receipt-print-counts/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { syncLocalReceiptPrintCountsToNeon } from "@/lib/local-pos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json(
        { error: "Invalid event ID." },
        { status: 400 }
      );
    }

    const result = await syncLocalReceiptPrintCountsToNeon(eventId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[LocalReceiptPrintCountSyncRoute] Failed:", error);

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