// app/api/events/[id]/receipt-template/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eventReceiptTemplates, events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function defaultTemplate(eventName = "Receipt") {
  return {
    id: null,
    isActive: true,
    storeName: eventName,
    headline: "Thank you for shopping with us",
    address: null,
    phone: null,
    instagram: null,
    taxId: null,
    logoUrl: null,
    footerText: "Terima kasih!",
    returnPolicy: null,
    promoMessage: null,
    showEventName: true,
    showCashierName: true,
    showItemSku: true,
    showPaymentReference: true,
    showDiscountBreakdown: true,
    customCss: null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const [[event], [template]] = await Promise.all([
      db.select({ name: events.name }).from(events).where(eq(events.id, eventId)).limit(1),
      db.select().from(eventReceiptTemplates).where(eq(eventReceiptTemplates.eventId, eventId)).limit(1),
    ]);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json(template ?? { eventId, ...defaultTemplate(event.name) });
  } catch (error) {
    console.error("[GET /api/events/[id]/receipt-template]", error);
    return NextResponse.json(
      { error: "Failed to load receipt template" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const body = await req.json();

    const patch = {
      eventId,
      isActive: body.isActive ?? true,
      storeName: body.storeName ?? null,
      headline: body.headline ?? null,
      address: body.address ?? null,
      phone: body.phone ?? null,
      instagram: body.instagram ?? null,
      taxId: body.taxId ?? null,
      logoUrl: body.logoUrl ?? null,
      footerText: body.footerText ?? null,
      returnPolicy: body.returnPolicy ?? null,
      promoMessage: body.promoMessage ?? null,
      showEventName: body.showEventName ?? true,
      showCashierName: body.showCashierName ?? true,
      showItemSku: body.showItemSku ?? true,
      showPaymentReference: body.showPaymentReference ?? true,
      showDiscountBreakdown: body.showDiscountBreakdown ?? true,
      customCss: body.customCss ?? null,
      updatedAt: new Date(),
    };

    const [existing] = await db
      .select({ id: eventReceiptTemplates.id })
      .from(eventReceiptTemplates)
      .where(eq(eventReceiptTemplates.eventId, eventId))
      .limit(1);

    const [template] = existing
      ? await db
          .update(eventReceiptTemplates)
          .set(patch)
          .where(eq(eventReceiptTemplates.id, existing.id))
          .returning()
      : await db
          .insert(eventReceiptTemplates)
          .values(patch)
          .returning();

    return NextResponse.json(template);
  } catch (error) {
    console.error("[PUT /api/events/[id]/receipt-template]", error);
    return NextResponse.json(
      { error: "Failed to save receipt template" },
      { status: 500 }
    );
  }
}
