// app/api/local/events/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteLocalEventData } from "@/lib/local-pos";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
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

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const result = deleteLocalEventData(eventId, { force });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete local POS data";

    const status = message.includes("unsynced") ? 409 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}