// app/api/events/[id]/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getEventStats,
  getEventTodayStats,
} from "@/lib/transactions";
import { getStockSummaryForEvent } from "@/lib/stock";

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

    const [stats, today, stock] = await Promise.all([
      getEventStats(eventId),
      getEventTodayStats(eventId),
      getStockSummaryForEvent(eventId),
    ]);

    return NextResponse.json({
      ...stats,
      today,
      stock,
    });
  } catch (error) {
    console.error("[EventStatsRoute] Failed to load event stats:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load event stats",
      },
      { status: 500 }
    );
  }
}