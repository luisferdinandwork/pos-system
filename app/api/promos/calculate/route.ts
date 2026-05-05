// app/api/promos/calculate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { calculatePromo, getPromosByEvent } from "@/lib/promos";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, eventItemId, quantity, netPrice, eventTotal } = body;

    const promos = await getPromosByEvent(Number(eventId));

    const result = await calculatePromo(Number(eventId), {
      eventItemId: Number(eventItemId),
      quantity:    Number(quantity),
      netPrice:    Number(netPrice),
      eventTotal:  Number(eventTotal ?? 0),
    }, promos);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[PromoCalculateRoute] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate promo" },
      { status: 500 }
    );
  }
}