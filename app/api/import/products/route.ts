// app/api/import/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { importProductsFromExcel } from "@/lib/export-excel";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await importProductsFromExcel(buffer);
  return NextResponse.json(result);
}