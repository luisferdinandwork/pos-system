// app/api/events/[id]/promos/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getPromosByEvent, createPromo, updatePromo,
  deletePromo, setPromoTiers, setPromoItems,
} from "@/lib/promos";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(await getPromosByEvent(Number(id)));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id }  = await params;
  const b       = await req.json();
  const promo   = await createPromo({ ...b, eventId: Number(id) });

  if (b.tiers?.length)    await setPromoTiers(promo.id, b.tiers);
  // itemIds now refers to event_items.id values
  if (b.itemIds?.length)  await setPromoItems(promo.id, b.itemIds);

  return NextResponse.json(promo, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const b     = await req.json();
  const promo = await updatePromo(b.id, b);

  if (b.tiers)   await setPromoTiers(promo.id, b.tiers);
  if (b.itemIds) await setPromoItems(promo.id, b.itemIds);

  return NextResponse.json(promo);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  await deletePromo(Number(searchParams.get("id")));
  return NextResponse.json({ success: true });
}