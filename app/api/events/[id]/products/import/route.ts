// app/api/events/[id]/products/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { importEventItemsFromExcel } from "@/lib/export-excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json(
        { error: "Invalid event ID." },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const result = await importEventItemsFromExcel(data, eventId);

    return NextResponse.json(result, {
      status: result.errors.length > 0 ? 207 : 200,
    });
  } catch (error) {
    console.error("[EventProductsImportRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import event items.",
      },
      { status: 500 }
    );
  }
}