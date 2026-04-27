// app/api/promos/calculate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getPromosByEvent, calculatePromo } from "@/lib/promos";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    eventId,
    eventItemId,  // renamed from eventProductId
    quantity,
    netPrice,
    eventTotal,
  } = body;

  const promos = await getPromosByEvent(Number(eventId));

  const result = await calculatePromo(
    Number(eventId),
    {
      eventItemId: Number(eventItemId),
      quantity:    Number(quantity),
      netPrice:    Number(netPrice),
      eventTotal:  Number(eventTotal),
    },
    promos
  );

  return NextResponse.json(result);
}