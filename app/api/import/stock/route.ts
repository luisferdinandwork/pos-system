// app/api/import/stock/route.ts
import { NextRequest, NextResponse } from "next/server";
import { importStockFromExcel } from "@/lib/export-excel";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);   // ← no Buffer
  const result = await importStockFromExcel(data);
  return NextResponse.json(result);
}