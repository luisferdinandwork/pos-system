// app/api/local/events/[id]/prepare/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prepareEventOffline } from "@/lib/local-pos";

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

    const bundle = await prepareEventOffline(eventId);

    return NextResponse.json({
      success: true,
      bundle,
    });
  } catch (error) {
    console.error("[LocalPrepareRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to prepare event offline",
      },
      { status: 500 }
    );
  }
}