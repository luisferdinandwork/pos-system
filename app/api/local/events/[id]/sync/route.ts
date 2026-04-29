// app/api/local/events/[id]/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { syncLocalTransactionsToNeon } from "@/lib/local-pos";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json(
        { error: "Invalid event ID" },
        { status: 400 }
      );
    }

    const result = await syncLocalTransactionsToNeon(eventId);

    console.log("[LocalSyncRoute] Result:", JSON.stringify(result, null, 2));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[LocalSyncRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync local transactions",
      },
      { status: 500 }
    );
  }
}