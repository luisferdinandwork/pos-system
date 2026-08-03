// app/api/local/events/[id]/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getLocalEventStats } from "@/lib/local-pos";

export const runtime = "nodejs";

export async function GET(
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

    const stats = await getLocalEventStats(eventId);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[LocalEventStatsRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load local event stats",
      },
      { status: 500 }
    );
  }
}