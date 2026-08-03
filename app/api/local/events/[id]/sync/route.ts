// app/api/local/events/[id]/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  syncLocalReceiptPrintCountsToNeon,
  syncLocalTransactionsToNeon,
} from "@/lib/local-pos";

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

    const transactionSync = await syncLocalTransactionsToNeon(eventId);
    const receiptPrintCountSync =
      await syncLocalReceiptPrintCountsToNeon(eventId);

    return NextResponse.json(
      {
        ...transactionSync,
        receiptPrintCountSync,
      },
      {
        status: transactionSync.failed > 0 ? 207 : 200,
      }
    );
  } catch (error) {
    console.error("[LocalSyncRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync local transactions.",
      },
      { status: 500 }
    );
  }
}