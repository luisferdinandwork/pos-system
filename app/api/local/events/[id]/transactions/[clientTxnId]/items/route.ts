// app/api/local/events/[id]/transactions/[clientTxnId]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getLocalTransactionItems } from "@/lib/local-pos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      clientTxnId: string;
    }>;
  }
) {
  try {
    const { id, clientTxnId } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json(
        { error: "Invalid event ID." },
        { status: 400 }
      );
    }

    const items = await getLocalTransactionItems(
      decodeURIComponent(clientTxnId)
    );

    return NextResponse.json(items);
  } catch (error) {
    console.error("[LocalTransactionItemsRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load local transaction items.",
      },
      { status: 500 }
    );
  }
}