// lib/promos.ts
import { db } from "@/lib/db";
import { promos, promoTiers, promoItems, eventItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Promo     = typeof promos.$inferSelect;
export type PromoTier = typeof promoTiers.$inferSelect;

export const PROMO_TYPES = [
  { value: "discount_pct",   label: "Discount %",         desc: "Percentage off the net price",                   icon: "%" },
  { value: "discount_fix",   label: "Discount Fixed",      desc: "Fixed amount off (e.g. Rp 50.000 off)",          icon: "−" },
  { value: "fixed_price",    label: "Fixed Price",         desc: "Sell at exact price regardless of net",          icon: "=" },
  { value: "qty_tiered",     label: "Qty Tiered Discount", desc: "Buy more, get higher discount",                  icon: "↑" },
  { value: "buy_x_get_y",    label: "Buy X Get Y Free",    desc: "Buy X qty, get Y qty free (same or other item)", icon: "🎁" },
  { value: "spend_get_free", label: "Spend & Get Free",    desc: "Spend min amount → receive free item",           icon: "🛍" },
  { value: "bundle",         label: "Bundle Price",        desc: "Selected items together at a bundle price",      icon: "📦" },
  { value: "flash",          label: "Flash Sale",          desc: "Time-limited discount within event window",      icon: "⚡" },
] as const;

export type PromoType = (typeof PROMO_TYPES)[number]["value"];

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getPromosByEvent(eventId: number) {
  const rows = await db
    .select()
    .from(promos)
    .where(eq(promos.eventId, eventId))
    .orderBy(promos.createdAt);

  return Promise.all(
    rows.map(async (p) => ({
      ...p,
      tiers: await db
        .select()
        .from(promoTiers)
        .where(eq(promoTiers.promoId, p.id)),
      // Items now join directly to event_items — no products table needed
      items: await db
        .select({
          id:          promoItems.id,
          promoId:     promoItems.promoId,
          eventItemId: promoItems.eventItemId,
          name:        eventItems.name,
          variantCode: eventItems.variantCode,
          itemId:      eventItems.itemId,
        })
        .from(promoItems)
        .innerJoin(eventItems, eq(eventItems.id, promoItems.eventItemId))
        .where(eq(promoItems.promoId, p.id)),
    }))
  );
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createPromo(data: typeof promos.$inferInsert): Promise<Promo> {
  const r = await db.insert(promos).values(data).returning();
  return r[0];
}

export async function updatePromo(
  id:   number,
  data: Partial<typeof promos.$inferInsert>
): Promise<Promo> {
  const r = await db.update(promos).set(data).where(eq(promos.id, id)).returning();
  return r[0];
}

export async function deletePromo(id: number): Promise<void> {
  // Tiers and items cascade, but explicit deletes are safe too
  await db.delete(promoTiers).where(eq(promoTiers.promoId, id));
  await db.delete(promoItems).where(eq(promoItems.promoId, id));
  await db.delete(promos).where(eq(promos.id, id));
}

export async function setPromoTiers(
  promoId: number,
  tiers: {
    minQty:      number;
    discountPct?: string;
    discountFix?: string;
    fixedPrice?:  string;
  }[]
): Promise<void> {
  await db.delete(promoTiers).where(eq(promoTiers.promoId, promoId));
  if (tiers.length === 0) return;
  await db.insert(promoTiers).values(tiers.map((t) => ({ promoId, ...t })));
}

export async function setPromoItems(
  promoId:      number,
  eventItemIds: number[]
): Promise<void> {
  await db.delete(promoItems).where(eq(promoItems.promoId, promoId));
  if (eventItemIds.length === 0) return;
  await db
    .insert(promoItems)
    .values(eventItemIds.map((id) => ({ promoId, eventItemId: id })));
}

// ── Promo engine ──────────────────────────────────────────────────────────────

export type CartLineInput = {
  eventItemId: number;
  quantity:    number;
  netPrice:    number;  // base selling price for this event item
  eventTotal:  number;  // current transaction subtotal (for spend_get_free)
};

export type PromoResult = {
  finalUnitPrice: number;
  discountAmt:    number;
  promoName:      string | null;
  freeQty:        number;  // extra free units to add
};

export async function calculatePromo(
  _eventId:  number,  // kept for API consistency; filtering is done client-side below
  input:     CartLineInput,
  allPromos: Awaited<ReturnType<typeof getPromosByEvent>>
): Promise<PromoResult> {
  const base: PromoResult = {
    finalUnitPrice: input.netPrice,
    discountAmt:    0,
    promoName:      null,
    freeQty:        0,
  };

  // Filter to promos that are active AND apply to this specific event item
  const applicable = allPromos.filter((p) => {
    if (!p.isActive) return false;
    if (p.applyToAll) return true;
    return p.items.some((i) => i.eventItemId === input.eventItemId);
  });

  if (applicable.length === 0) return base;

  let best = { ...base };

  for (const promo of applicable) {
    // Flash sale: check time window
    if (promo.type === "flash") {
      const now = new Date();
      if (promo.flashStartTime && now < new Date(promo.flashStartTime)) continue;
      if (promo.flashEndTime   && now > new Date(promo.flashEndTime))   continue;
    }

    // Min qty guard
    if (promo.minPurchaseQty && input.quantity < promo.minPurchaseQty) continue;

    // Max usage guard
    if (
      promo.maxUsageCount !== null &&
      promo.usageCount >= (promo.maxUsageCount ?? Infinity)
    ) continue;

    let result = { ...base };

    switch (promo.type) {
      case "discount_pct":
      case "flash": {
        const pct             = parseFloat(String(promo.discountPct ?? 0)) / 100;
        result.discountAmt    = Math.round(input.netPrice * pct);
        result.finalUnitPrice = input.netPrice - result.discountAmt;
        result.promoName      = promo.name;
        break;
      }
      case "discount_fix": {
        result.discountAmt    = Math.min(
          parseFloat(String(promo.discountFix ?? 0)),
          input.netPrice
        );
        result.finalUnitPrice = input.netPrice - result.discountAmt;
        result.promoName      = promo.name;
        break;
      }
      case "fixed_price": {
        const fp              = parseFloat(String(promo.fixedPrice ?? input.netPrice));
        result.discountAmt    = Math.max(0, input.netPrice - fp);
        result.finalUnitPrice = fp;
        result.promoName      = promo.name;
        break;
      }
      case "qty_tiered": {
        const tiers = [...promo.tiers].sort((a, b) => b.minQty - a.minQty);
        const tier  = tiers.find((t) => input.quantity >= t.minQty);
        if (tier) {
          if (tier.fixedPrice) {
            const fp = parseFloat(String(tier.fixedPrice));
            result.discountAmt    = Math.max(0, input.netPrice - fp);
            result.finalUnitPrice = fp;
          } else if (tier.discountPct) {
            const pct = parseFloat(String(tier.discountPct)) / 100;
            result.discountAmt    = Math.round(input.netPrice * pct);
            result.finalUnitPrice = input.netPrice - result.discountAmt;
          } else if (tier.discountFix) {
            result.discountAmt    = Math.min(
              parseFloat(String(tier.discountFix)),
              input.netPrice
            );
            result.finalUnitPrice = input.netPrice - result.discountAmt;
          }
          result.promoName = promo.name;
        }
        break;
      }
      case "buy_x_get_y": {
        const buyQty  = promo.buyQty     ?? 1;
        const freeQty = promo.getFreeQty ?? 1;
        if (input.quantity >= buyQty) {
          result.freeQty   = freeQty * Math.floor(input.quantity / buyQty);
          result.promoName = promo.name;
        }
        break;
      }
      case "spend_get_free": {
        const minSpend = parseFloat(String(promo.spendMinAmount ?? 0));
        if (input.eventTotal >= minSpend) {
          result.freeQty   = 1;
          result.promoName = promo.name;
        }
        break;
      }
      case "bundle": {
        const bundlePrice  = parseFloat(String(promo.bundlePrice ?? input.netPrice));
        const itemCount    = Math.max(promo.items.length, 1);
        const perItemPrice = bundlePrice / itemCount;
        result.discountAmt    = Math.max(0, input.netPrice - perItemPrice);
        result.finalUnitPrice = perItemPrice;
        result.promoName      = promo.name;
        break;
      }
    }

    // Keep the best (highest discount / most free units)
    if (result.discountAmt > best.discountAmt || result.freeQty > best.freeQty) {
      best = result;
    }
  }

  return best;
}