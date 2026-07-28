// app/api/events/[id]/duplicate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  events,
  eventItems,
  promos,
  promoTiers,
  promoItems,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  generateEventVerifierCode,
  insertEventWithGeneratedCode,
  inferEventCompany,
  isEventCompany,
} from "@/lib/events";

function toDateOnly(val: unknown): Date | null {
  if (val == null) return null;

  const raw = String(val).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sourceId = Number(id);

  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const [source] = await db
      .select()
      .from(events)
      .where(eq(events.id, sourceId))
      .limit(1);

    if (!source) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const company = isEventCompany(body.company)
      ? body.company
      : inferEventCompany(source);

    if (!company) {
      return NextResponse.json(
        {
          error:
            'Company is required and must be "PRI" or "PNT" (could not be inferred from the source event).',
        },
        { status: 400 }
      );
    }

    const sourceItems = await db
      .select()
      .from(eventItems)
      .where(eq(eventItems.eventId, sourceId));

    const sourcePromos = await db
      .select()
      .from(promos)
      .where(eq(promos.eventId, sourceId));

    const sourcePromoIds = sourcePromos.map((promo) => promo.id);

    const sourceTiers =
      sourcePromoIds.length > 0
        ? await db
            .select()
            .from(promoTiers)
            .where(inArray(promoTiers.promoId, sourcePromoIds))
        : [];

    const sourcePromoItems =
      sourcePromoIds.length > 0
        ? await db
            .select()
            .from(promoItems)
            .where(inArray(promoItems.promoId, sourcePromoIds))
        : [];

    const newName =
      String(body.name ?? "").trim() || `${source.name} (Copy)`;

    const newEvent = await insertEventWithGeneratedCode(company, {
      verifierCode: generateEventVerifierCode(),
      name: newName,
      location:
        body.location !== undefined
          ? String(body.location ?? "").trim() || null
          : source.location,
      description:
        body.description !== undefined
          ? String(body.description ?? "").trim() || null
          : source.description,
      status: "draft",
      startDate: toDateOnly(body.startDate),
      endDate: toDateOnly(body.endDate),
      updatedAt: new Date(),
    });

    const oldToNewItemId = new Map<number, number>();

    if (sourceItems.length > 0) {
      const newItemRows = await db
        .insert(eventItems)
        .values(
          sourceItems.map((item) => ({
            eventId: newEvent.id,
            itemId: item.itemId,
            baseItemNo: item.baseItemNo,
            name: item.name,
            color: item.color,
            variantCode: item.variantCode,
            unit: item.unit,
            netPrice: item.netPrice,
            retailPrice: item.retailPrice,
            stock: 0,
          }))
        )
        .returning();

      sourceItems.forEach((oldItem, index) => {
        oldToNewItemId.set(oldItem.id, newItemRows[index].id);
      });
    }

    let promosCopied = 0;

    for (const promo of sourcePromos) {
      const [newPromo] = await db
        .insert(promos)
        .values({
          eventId: newEvent.id,
          name: promo.name,
          type: promo.type,
          isActive: promo.isActive,
          applyToAll: promo.applyToAll,
          discountPct: promo.discountPct,
          discountFix: promo.discountFix,
          fixedPrice: promo.fixedPrice,
          buyQty: promo.buyQty,
          getFreeQty: promo.getFreeQty,
          freeItemId: null,
          freeItemProductId: null,
          spendMinAmount: promo.spendMinAmount,
          bundlePrice: promo.bundlePrice,
          flashStartTime: null,
          flashEndTime: null,
          minPurchaseQty: promo.minPurchaseQty,
          minPurchaseAmt: promo.minPurchaseAmt,
          maxUsageCount: promo.maxUsageCount,
          usageCount: 0,
        })
        .returning();

      const thisPromoTiers = sourceTiers.filter(
        (tier) => tier.promoId === promo.id
      );

      if (thisPromoTiers.length > 0) {
        await db.insert(promoTiers).values(
          thisPromoTiers.map((tier) => ({
            promoId: newPromo.id,
            minQty: tier.minQty,
            discountPct: tier.discountPct,
            discountFix: tier.discountFix,
            fixedPrice: tier.fixedPrice,
          }))
        );
      }

      const thisPromoItems = sourcePromoItems.filter(
        (promoItem) => promoItem.promoId === promo.id
      );

      const remappedLinks = thisPromoItems
        .map((promoItem) => {
          const newItemId = oldToNewItemId.get(promoItem.eventItemId);

          return newItemId
            ? {
                promoId: newPromo.id,
                eventItemId: newItemId,
              }
            : null;
        })
        .filter(
          (row): row is { promoId: number; eventItemId: number } => row !== null
        );

      if (remappedLinks.length > 0) {
        await db.insert(promoItems).values(remappedLinks);
      }

      promosCopied++;
    }

    return NextResponse.json(
      {
        success: true,
        event: newEvent,
        itemsCopied: sourceItems.length,
        promosCopied,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[DuplicateEventRoute] Failed:", error);

    return NextResponse.json(
      {
        error: getErrorMessage(error, "Failed to duplicate event"),
      },
      { status: 500 }
    );
  }
}