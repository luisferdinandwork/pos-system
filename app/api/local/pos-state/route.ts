// app/api/local/pos-state/route.ts
import { NextResponse } from "next/server";
import { getLocalPOSState } from "@/lib/local-pos";

export const runtime = "nodejs";

export async function GET() {
  try {
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