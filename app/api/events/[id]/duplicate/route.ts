// app/api/events/[id]/duplicate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events, eventItems, promos, promoTiers, promoItems } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sourceId = Number(id);

  if (!Number.isFinite(sourceId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  try {
    // ── 1. Load source event ──────────────────────────────────────────────
    const [source] = await db
      .select()
      .from(events)
      .where(eq(events.id, sourceId))
      .limit(1);

    if (!source) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // ── 2. Load source items, promos, tiers, promo-item links ─────────────
    const sourceItems = await db
      .select()
      .from(eventItems)
      .where(eq(eventItems.eventId, sourceId));

    const sourcePromos = await db
      .select()
      .from(promos)
      .where(eq(promos.eventId, sourceId));

    const sourcePromoIds = sourcePromos.map(p => p.id);

    const sourceTiers = sourcePromoIds.length > 0
      ? await db.select().from(promoTiers).where(inArray(promoTiers.promoId, sourcePromoIds))
      : [];

    const sourcePromoItems = sourcePromoIds.length > 0
      ? await db.select().from(promoItems).where(inArray(promoItems.promoId, sourcePromoIds))
      : [];

    // ── 3. Create new event — draft, name gets "(Copy)", dates cleared ─────
    const [newEvent] = await db
      .insert(events)
      .values({
        name:        `${source.name} (Copy)`,
        location:    source.location,
        description: source.description,
        status:      "draft",
        startDate:   null,
        endDate:     null,
      })
      .returning();

    // ── 4. Copy items with stock = 0, build old-id → new-id map ──────────
    // We need the new IDs to remap promo_items references.
    const oldToNewItemId = new Map<number, number>();

    if (sourceItems.length > 0) {
      const newItemRows = await db
        .insert(eventItems)
        .values(
          sourceItems.map(item => ({
            eventId:     newEvent.id,
            itemId:      item.itemId,
            baseItemNo:  item.baseItemNo,
            name:        item.name,
            color:       item.color,
            variantCode: item.variantCode,
            unit:        item.unit,
            netPrice:    item.netPrice,
            retailPrice: item.retailPrice,
            stock:       0,   // stock starts fresh
          }))
        )
        .returning();

      // Map old eventItemId → new eventItemId by position
      sourceItems.forEach((oldItem, idx) => {
        oldToNewItemId.set(oldItem.id, newItemRows[idx].id);
      });
    }

    // ── 5. Copy promos, tiers, and promo-item links ───────────────────────
    let promosCopied = 0;

    for (const promo of sourcePromos) {
      const [newPromo] = await db
        .insert(promos)
        .values({
          eventId:          newEvent.id,
          name:             promo.name,
          type:             promo.type,
          isActive:         promo.isActive,
          applyToAll:       promo.applyToAll,
          discountPct:      promo.discountPct,
          discountFix:      promo.discountFix,
          fixedPrice:       promo.fixedPrice,
          buyQty:           promo.buyQty,
          getFreeQty:       promo.getFreeQty,
          freeItemId:       null,           // item IDs change — cleared for safety
          freeItemProductId: null,
          spendMinAmount:   promo.spendMinAmount,
          bundlePrice:      promo.bundlePrice,
          flashStartTime:   null,           // time-sensitive — operator sets new window
          flashEndTime:     null,
          minPurchaseQty:   promo.minPurchaseQty,
          minPurchaseAmt:   promo.minPurchaseAmt,
          maxUsageCount:    promo.maxUsageCount,
          usageCount:       0,              // reset usage counter
        })
        .returning();

      // Copy tiers for this promo
      const thisPromoTiers = sourceTiers.filter(t => t.promoId === promo.id);
      if (thisPromoTiers.length > 0) {
        await db.insert(promoTiers).values(
          thisPromoTiers.map(t => ({
            promoId:     newPromo.id,
            minQty:      t.minQty,
            discountPct: t.discountPct,
            discountFix: t.discountFix,
            fixedPrice:  t.fixedPrice,
          }))
        );
      }

      // Copy promo-item links, remapped to new item IDs
      const thisPromoItems = sourcePromoItems.filter(pi => pi.promoId === promo.id);
      const remappedLinks = thisPromoItems
        .map(pi => {
          const newItemId = oldToNewItemId.get(pi.eventItemId);
          return newItemId ? { promoId: newPromo.id, eventItemId: newItemId } : null;
        })
        .filter((x): x is { promoId: number; eventItemId: number } => x !== null);

      if (remappedLinks.length > 0) {
        await db.insert(promoItems).values(remappedLinks);
      }

      promosCopied++;
    }

    return NextResponse.json({
      success:      true,
      event:        newEvent,
      itemsCopied:  sourceItems.length,
      promosCopied,
    }, { status: 201 });

  } catch (error) {
    console.error("[DuplicateEventRoute] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to duplicate event" },
      { status: 500 }
    );
  }
}