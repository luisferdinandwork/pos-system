// app/api/local/events/[id]/transactions/export/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json(
        { error: "Invalid event ID." },
        { status: 400 }
      );
    }

    const scope = req.nextUrl.searchParams.get("scope") === "today" ? "today" : "all";

    const { buildLocalTransactionsExcel, toSafeFilename } = await import("@/lib/export-excel");
    const { getLocalEventBundle } = await import("@/lib/local-pos");

    let eventName = `event_${eventId}`;
    try {
      const bundle = await getLocalEventBundle(eventId);
      if (bundle.event?.name) eventName = bundle.event.name;
    } catch {
      // Event not prepared locally — fall back to the generic filename.
    }

    const safeName = toSafeFilename(eventName);
    const date = new Date().toISOString().slice(0, 10);

    const data = await buildLocalTransactionsExcel(eventId, {
      todayOnly: scope === "today",
    });

    return new NextResponse(data as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}_transactions_${scope}_${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[LocalTransactionsExportRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to export transactions.",
      },
      { status: 500 }
    );
  }
}
