// lib/export-excel.ts
import ExcelJS from "exceljs";
import { getAllTransactions, getTransactionItems } from "@/lib/transactions";
import { getProductsWithStock } from "@/lib/stock";
import { formatDate } from "@/lib/utils";

// Helper: convert ExcelJS writeBuffer output → Uint8Array (avoids Buffer type issues)
async function toUint8Array(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  const ab = await workbook.xlsx.writeBuffer();
  return new Uint8Array(ab);
}

// ── Export: Transactions ────────────────────────────────────────────────────
export async function buildTransactionExcel(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");

  sheet.columns = [
    { header: "Date", key: "date", width: 22 },
    { header: "Transaction ID", key: "txnId", width: 16 },
    { header: "Items", key: "items", width: 45 },
    { header: "Total (Rp)", key: "total", width: 18 },
    { header: "Payment Method", key: "method", width: 18 },
    { header: "Payment Reference", key: "reference", width: 24 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1e104e" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  const txns = await getAllTransactions();
  for (const txn of txns) {
    const items = await getTransactionItems(txn.id);
    sheet.addRow({
      date: txn.createdAt ? formatDate(txn.createdAt) : "-",
      txnId: txn.id,
      items: items.map((i) => `${i.productName} x${i.quantity}`).join(", "),
      total: parseFloat(String(txn.totalAmount)),
      method: txn.paymentMethod ?? "-",
      reference: txn.paymentReference ?? "-",
    });
  }
  sheet.getColumn("total").numFmt = "#,##0";

  return toUint8Array(workbook);
}

// ── Export: Products (matches UPLOAD_BAZAR_PRICE template) ──────────────────
export async function buildProductExcel(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  sheet.columns = [
    { header: "Item No.", key: "baseItemNo", width: 16 },
    { header: "Reference No.", key: "itemId", width: 20 },
    { header: "Variant Code", key: "variantCode", width: 14 },
    { header: "Unit of Measure", key: "unit", width: 16 },
    { header: "Description", key: "name", width: 36 },
    { header: "Description 2", key: "color", width: 36 },
    { header: "BAZAR PRICE", key: "price", width: 16 },
    { header: "Original Price", key: "originalPrice", width: 16 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1e104e" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  const prods = await getProductsWithStock();
  for (const p of prods) {
    sheet.addRow({
      baseItemNo: p.baseItemNo ?? p.itemId,
      itemId: p.itemId,
      variantCode: p.variantCode ?? "",
      unit: p.unit ?? "PCS",
      name: p.name,
      color: p.color ?? "",
      price: parseFloat(String(p.price)),
      originalPrice: parseFloat(String(p.originalPrice ?? p.price)),
    });
  }
  sheet.getColumn("price").numFmt = "#,##0";
  sheet.getColumn("originalPrice").numFmt = "#,##0";

  return toUint8Array(workbook);
}

// ── Export: Stock template (for re-import) ───────────────────────────────────
export async function buildStockExcel(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stock");

  sheet.columns = [
    { header: "Reference No.", key: "itemId", width: 22 },
    { header: "Description", key: "name", width: 36 },
    { header: "Variant Code", key: "variantCode", width: 14 },
    { header: "Current Stock", key: "currentStock", width: 16 },
    { header: "Add Quantity", key: "addQty", width: 16 },
    { header: "Note", key: "note", width: 28 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF452e5a" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  const prods = await getProductsWithStock();
  for (const p of prods) {
    const row = sheet.addRow({
      itemId: p.itemId,
      name: p.name,
      variantCode: p.variantCode ?? "",
      currentStock: p.stock,
      addQty: 0,
      note: "Restock",
    });
    // Highlight the "Add Quantity" column for easy editing
    row.getCell("addQty").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3cd" } };
  }

  return toUint8Array(workbook);
}

// ── Import: Products from BAZAR PRICE template ───────────────────────────────
export async function importProductsFromExcel(data: Uint8Array): Promise<{
  inserted: number;
  updated: number;
  errors: string[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];

  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  const rows = sheet.getSheetValues() as (string | number | null)[][];

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const baseItemNo  = String(row[1] ?? "").trim();
    const itemId      = String(row[2] ?? "").trim();
    const variantCode = String(row[3] ?? "").trim();
    const unit        = String(row[4] ?? "PCS").trim();
    const name        = String(row[5] ?? "").trim();
    const color       = String(row[6] ?? "").trim();
    const bazarPrice  = parseFloat(String(row[7] ?? "0"));
    const origPrice   = parseFloat(String(row[8] ?? "0"));

    if (!itemId || !name) continue;
    if (isNaN(bazarPrice) || bazarPrice <= 0) {
      errors.push(`Row ${i}: invalid price for ${itemId}`);
      continue;
    }

    try {
      const { upsertProduct, getProductByItemId } = await import("@/lib/products");
      const existing = await getProductByItemId(itemId);
      await upsertProduct({
        itemId,
        baseItemNo: baseItemNo || itemId,
        name,
        color: color || null,
        variantCode: variantCode || null,
        unit: unit || "PCS",
        price: String(bazarPrice),
        originalPrice: String(origPrice || bazarPrice),
      });
      existing ? updated++ : inserted++;
    } catch (e) {
      errors.push(`Row ${i}: ${String(e)}`);
    }
  }

  return { inserted, updated, errors };
}

// ── Import: Stock quantities from stock template ──────────────────────────────
export async function importStockFromExcel(data: Uint8Array): Promise<{
  processed: number;
  skipped: number;
  errors: string[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  const rows = sheet.getSheetValues() as (string | number | null)[][];

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const itemId  = String(row[1] ?? "").trim();
    const addQty  = parseInt(String(row[5] ?? "0"), 10);
    const note    = String(row[6] ?? "Restock via import").trim();

    if (!itemId) continue;
    if (isNaN(addQty) || addQty <= 0) { skipped++; continue; }

    try {
      const { getProductByItemId } = await import("@/lib/products");
      const product = await getProductByItemId(itemId);
      if (!product) {
        errors.push(`Row ${i}: product not found for ${itemId}`);
        continue;
      }
      const { addStockEntry } = await import("@/lib/stock");
      await addStockEntry(product.id, addQty, note || "Import restock", "import");
      processed++;
    } catch (e) {
      errors.push(`Row ${i}: ${String(e)}`);
    }
  }

  return { processed, skipped, errors };
}