// app/api/local/events/[id]/sync-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getLocalTransactionsByEvent } from "@/lib/local-pos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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

    const txns = await getLocalTransactionsByEvent(eventId);

    const pending = txns.filter((txn) => txn.syncStatus === "pending");
    const failed = txns.filter((txn) => txn.syncStatus === "failed");
    const synced = txns.filter((txn) => txn.syncStatus === "synced");

    return NextResponse.json({
      eventId,
      total: txns.length,
      pending: pending.length,
      failed: failed.length,
      synced: synced.length,
      failedRows: failed.map((txn) => ({
        clientTxnId: txn.clientTxnId,
        displayId: txn.displayId,
        syncError: txn.syncError,
        createdAt: txn.createdAt,
      })),
    });
  } catch (error) {
    console.error("[LocalSyncStatusRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load local sync status.",
      },
      { status: 500 }
    );
  }
}