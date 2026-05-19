// app/api/local/prepared-events/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getLocalPreparedEventsState } = await import("@/lib/local-pos");

    const state = await getLocalPreparedEventsState();

    return NextResponse.json(state);
  } catch (error) {
    console.error("[LocalPreparedEventsRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get prepared local events",
      },
      { status: 500 }
    );
  }
}