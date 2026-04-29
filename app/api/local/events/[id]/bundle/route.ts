// app/api/local/events/[id]/bundle/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getLocalEventBundle } from "@/lib/local-pos";

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

    const bundle = await getLocalEventBundle(eventId);

    return NextResponse.json(bundle);
  } catch (error) {
    console.error("[LocalBundleRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load local event bundle",
      },
      { status: 500 }
    );
  }
}