// app/api/export/products/route.ts
import { NextResponse } from "next/server";
import { buildProductExcel } from "@/lib/export-excel";

export async function GET() {
  const data = await buildProductExcel();
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="products-${Date.now()}.xlsx"`,
    },
  });
}