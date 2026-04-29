// app/api/local/prepared-events/route.ts
import { NextResponse } from "next/server";
import { getLocalPreparedEventsState } from "@/lib/local-pos";

export const runtime = "nodejs";

export async function GET() {
  try {
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