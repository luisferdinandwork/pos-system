// app/api/local/pos-state/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getLocalPOSState } = await import("@/lib/local-pos");

    const state = await getLocalPOSState();

    return NextResponse.json(state);
  } catch (error) {
    console.error("[LocalPOSStateRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get local POS state",
      },
      { status: 500 }
    );
  }
}