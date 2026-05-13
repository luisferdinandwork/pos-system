// lib/export-excel.ts
import ExcelJS from "exceljs";
import { getAllTransactions, getTransactionItems } from "@/lib/transactions";
import { getEventItems, bulkUpsertEventItems } from "@/lib/events";
import { formatDate } from "@/lib/utils";
import { getItemsWithStockForEvent, addStockTransaction } from "@/lib/stock";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  eventItems,
  events,
  promoItems,
  promos,
  promoTiers,
  stockTransactions,
  stockTransactionTypes,
  transactionItems,
  transactions,
} from "@/lib/db/schema";

// ── Shared helpers ────────────────────────────────────────────────────────────

async function toUint8Array(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  const ab = await workbook.xlsx.writeBuffer();
  return new Uint8Array(ab);
}

/** Dark header row with white bold text. */
function styleHeader(sheet: ExcelJS.Worksheet, color = "FF1e104e") {
  const row = sheet.getRow(1);
  row.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  row.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height    = 24;
  sheet.views   = [{ state: "frozen", ySplit: 1 }];
}

function normalizeEventName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function eventNameMatches(importedName: unknown, expectedName?: string) {
  if (!expectedName) return true;
  const imported = normalizeEventName(importedName);
  const expected = normalizeEventName(expectedName);
  if (!imported) return true; // blank = accept (old templates)
  return imported === expected;
}

function cellText(value: ExcelJS.CellValue | undefined | null) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text"     in value && value.text)                        return String(value.text).trim();
    if ("result"   in value && value.result !== undefined)        return String(value.result ?? "").trim();
    if ("richText" in value && Array.isArray(value.richText))     return value.richText.map(r => r.text).join("").trim();
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue | undefined | null) {
  const raw = cellText(value).replace(/[^\d.-]/g, "");
  const n   = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function safePositiveInt(value: ExcelJS.CellValue | undefined | null) {
  const n = Math.trunc(cellNumber(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Consistent filename helper used by all routes. */
export function toSafeFilename(name: string): string {
  return name
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

// ── Export: Transactions (global) ─────────────────────────────────────────────
export async function buildTransactionExcel(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet("Transactions");

  sheet.columns = [
    { header: "Date",              key: "date",      width: 22 },
    { header: "Transaction ID",    key: "txnId",     width: 14 },
    { header: "Event ID",          key: "eventId",   width: 10 },
    { header: "Items",             key: "items",     width: 45 },
    { header: "Subtotal (Rp)",     key: "subtotal",  width: 16 },
    { header: "Discount (Rp)",     key: "discount",  width: 16 },
    { header: "Total (Rp)",        key: "total",     width: 16 },
    { header: "Payment Method",    key: "method",    width: 18 },
    { header: "Payment Reference", key: "reference", width: 24 },
  ];
  styleHeader(sheet);

  const txns = await getAllTransactions();
  for (const txn of txns) {
    const items = await getTransactionItems(txn.id);
    sheet.addRow({
      date:      txn.createdAt ? formatDate(txn.createdAt) : "—",
      txnId:     txn.id,
      eventId:   txn.eventId,
      items:     items.map(i => `${i.productName} x${i.quantity}`).join(", "),
      subtotal:  parseFloat(String(txn.totalAmount)),
      discount:  parseFloat(String(txn.discount ?? 0)),
      total:     parseFloat(String(txn.finalAmount)),
      method:    txn.paymentMethod ?? "—",
      reference: txn.paymentReference ?? "—",
    });
  }
  ["subtotal", "discount", "total"].forEach(k => { sheet.getColumn(k).numFmt = "#,##0"; });
  return toUint8Array(workbook);
}

// ── Export: Event items ───────────────────────────────────────────────────────
// Columns: Base Item No. | Variant Code | Reference No. | Unit | Description | Description 2 | Net Price | Retail Price | Stock
export async function buildEventItemExcel(eventId: number): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet("Items");

  sheet.columns = [
    { header: "Base Item No.",   key: "baseItemNo",  width: 16 },
    { header: "Variant Code",    key: "variantCode", width: 14 },
    { header: "Reference No.",   key: "itemId",      width: 22 },
    { header: "Unit",            key: "unit",        width: 10 },
    { header: "Description",     key: "name",        width: 36 },
    { header: "Description 2",   key: "color",       width: 36 },
    { header: "Net Price",       key: "netPrice",    width: 16 },
    { header: "Retail Price",    key: "retailPrice", width: 16 },
    { header: "Stock",           key: "stock",       width: 12 },
  ];
  styleHeader(sheet);

  const items = await getEventItems(eventId);
  for (const item of items) {
    sheet.addRow({
      baseItemNo:  item.baseItemNo ?? item.itemId,
      itemId:      item.itemId,
      variantCode: item.variantCode ?? "",
      unit:        item.unit ?? "PCS",
      name:        item.name,
      color:       item.color ?? "",
      netPrice:    parseFloat(String(item.netPrice)),
      retailPrice: parseFloat(String(item.retailPrice)),
      stock:       item.stock,
    });
  }
  sheet.getColumn("netPrice").numFmt    = "#,##0";
  sheet.getColumn("retailPrice").numFmt = "#,##0";
  return toUint8Array(workbook);
}

// ── Export: Empty item template ───────────────────────────────────────────────
export async function buildEmptyEventItemTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet("Items");

  sheet.columns = [
    { header: "Base Item No.",   key: "baseItemNo",  width: 16 },
    { header: "Variant Code",    key: "variantCode", width: 14 },
    { header: "Reference No.",   key: "itemId",      width: 22 },
    { header: "Unit",            key: "unit",        width: 10 },
    { header: "Description",     key: "name",        width: 36 },
    { header: "Description 2",   key: "color",       width: 36 },
    { header: "Net Price",       key: "netPrice",    width: 16 },
    { header: "Retail Price",    key: "retailPrice", width: 16 },
    { header: "Stock",           key: "stock",       width: 12 },
  ];
  styleHeader(sheet);

  const example = sheet.addRow({
    baseItemNo: "SPE1040100", itemId: "SPE1040100370", variantCode: "370",
    unit: "PRS", name: "EXAMPLE PRODUCT", color: "WHITE/BLACK",
    netPrice: 500000, retailPrice: 700000, stock: 10,
  });
  example.font = { italic: true, color: { argb: "FF999999" } };

  sheet.getColumn("netPrice").numFmt    = "#,##0";
  sheet.getColumn("retailPrice").numFmt = "#,##0";
  return toUint8Array(workbook);
}

// ── Import: Event items ───────────────────────────────────────────────────────
export async function importEventItemsFromExcel(
  data: Uint8Array,
  eventId: number
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as any);
  const sheet = workbook.worksheets[0];

  const parsed: {
    itemId: string; baseItemNo: string; name: string; color: string;
    variantCode: string; unit: string; netPrice: string; retailPrice: string; stock: number;
  }[] = [];
  const parseErrors: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const baseItemNo  = cellText(row.getCell(1).value);
    const variantCode = cellText(row.getCell(2).value);
    const itemId      = cellText(row.getCell(3).value);
    const unit        = cellText(row.getCell(4).value) || "PCS";
    const name        = cellText(row.getCell(5).value);
    const color       = cellText(row.getCell(6).value);
    const netPrice    = cellNumber(row.getCell(7).value);
    const retailPrice = cellNumber(row.getCell(8).value);
    const stock       = Math.trunc(cellNumber(row.getCell(9).value));

    if (!itemId || !name) return;
    if (!Number.isFinite(netPrice) || netPrice <= 0) {
      parseErrors.push(`Row ${rowNumber}: invalid net price for "${itemId}"`); return;
    }
    parsed.push({
      baseItemNo: baseItemNo || itemId, itemId, variantCode, unit, name, color,
      netPrice: String(netPrice),
      retailPrice: String(retailPrice > 0 ? retailPrice : netPrice),
      stock: Number.isFinite(stock) ? stock : 0,
    });
  });

  if (parsed.length === 0) return { inserted: 0, updated: 0, errors: [...parseErrors, "No valid rows found in file"] };
  const result = await bulkUpsertEventItems(eventId, parsed);
  return { inserted: result.inserted, updated: result.updated, errors: [...parseErrors, ...result.errors] };
}

// ── Export: Transfer In stock template ───────────────────────────────────────
// Columns: Event Name | Base Item No. | Variant Code | Reference No. | Description | Current Stock | Transfer In Qty | Note
export async function buildStockExcel(eventId: number, eventName?: string): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet("Transfer In");

  sheet.columns = [
    { header: "Event Name",       key: "eventName",    width: 32 },
    { header: "Base Item No.",    key: "baseItemNo",   width: 16 },
    { header: "Variant Code",     key: "variantCode",  width: 14 },
    { header: "Reference No.",    key: "itemId",       width: 22 },
    { header: "Description",      key: "name",         width: 36 },
    { header: "Current Stock",    key: "currentStock", width: 14 },
    { header: "Transfer In Qty",  key: "addQty",       width: 16 },
    { header: "Note",             key: "note",         width: 28 },
  ];
  styleHeader(sheet, "FF1e3a5f");

  const items = await getEventItems(eventId);
  for (const item of items) {
    const row = sheet.addRow({
      eventName:    eventName ?? "",
      baseItemNo:   item.baseItemNo ?? item.itemId,
      itemId:       item.itemId,
      variantCode:  item.variantCode ?? "",
      name:         item.name,
      currentStock: item.stock,
      addQty:       "",
      note:         "Transfer in",
    });
    row.getCell("addQty").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3cd" } };
  }
  return toUint8Array(workbook);
}

// ── Import: Transfer In stock ─────────────────────────────────────────────────
// Reads col 4 = Reference No. (col layout: Event Name | Base Item No. | Variant Code | Reference No. | ...)
export async function importStockFromExcel(
  data: Uint8Array,
  eventId: number,
  expectedEventName?: string
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { processed: 0, skipped: 0, errors: ["No sheet found"] };

  const items   = await getItemsWithStockForEvent(eventId);
  const itemMap = new Map(items.map(item => [item.itemId, item]));

  let processed = 0, skipped = 0;
  const errors: string[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row       = sheet.getRow(rowNumber);
    const eventName = row.getCell(1).value;
    const itemId    = cellText(row.getCell(4).value);   // col 4 = Reference No. (after reorder)
    const qty       = safePositiveInt(row.getCell(7).value); // col 7 = Transfer In Qty
    const note      = cellText(row.getCell(8).value) || "Transfer in from Excel";

    if (!itemId) { skipped++; continue; }
    if (!eventNameMatches(eventName, expectedEventName)) { errors.push(`Row ${rowNumber}: event name mismatch`); continue; }
    if (qty <= 0) { skipped++; continue; }

    const item = itemMap.get(itemId);
    if (!item) { errors.push(`Row ${rowNumber}: item "${itemId}" not found in this event`); continue; }

    try {
      await addStockTransaction({ eventItemId: item.id, typeCode: "transfer_in", quantity: Math.abs(qty), note, referenceType: "stock_import" });
      processed++;
    } catch (error) {
      errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : "Failed to import stock"}`);
    }
  }
  return { processed, skipped, errors };
}

// ── Export: Transfer Out stock template ──────────────────────────────────────
// Same layout as Transfer In — just different header colour, label, and note
export async function buildTransferOutExcel(eventId: number, eventName?: string): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet("Transfer Out");

  sheet.columns = [
    { header: "Event Name",        key: "eventName",    width: 32 },
    { header: "Base Item No.",     key: "baseItemNo",   width: 16 },
    { header: "Variant Code",      key: "variantCode",  width: 14 },
    { header: "Reference No.",     key: "itemId",       width: 22 },
    { header: "Description",       key: "name",         width: 36 },
    { header: "Current Stock",     key: "currentStock", width: 14 },
    { header: "Transfer Out Qty",  key: "outQty",       width: 16 },
    { header: "Note",              key: "note",         width: 28 },
  ];
  styleHeader(sheet, "FF7f1d1d");

  const items = await getEventItems(eventId);
  for (const item of items) {
    const row = sheet.addRow({
      eventName:    eventName ?? "",
      baseItemNo:   item.baseItemNo ?? item.itemId,
      itemId:       item.itemId,
      variantCode:  item.variantCode ?? "",
      name:         item.name,
      currentStock: item.stock,
      outQty:       "",
      note:         "Transfer out",
    });
    row.getCell("outQty").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE4E6" } };
  }
  return toUint8Array(workbook);
}

// ── Import: Transfer Out stock ────────────────────────────────────────────────
// Col layout mirrors buildTransferOutExcel — col 4 = Reference No., col 7 = qty
export async function importTransferOutFromExcel(
  data: Uint8Array,
  eventId: number,
  expectedEventName?: string
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { processed: 0, skipped: 0, errors: ["No sheet found"] };

  const items   = await getItemsWithStockForEvent(eventId);
  const itemMap = new Map(items.map(item => [item.itemId, item]));

  let processed = 0, skipped = 0;
  const errors: string[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row       = sheet.getRow(rowNumber);
    const eventName = row.getCell(1).value;
    const itemId    = cellText(row.getCell(4).value);   // col 4 = Reference No. (after reorder)
    const qty       = safePositiveInt(row.getCell(7).value); // col 7 = Transfer Out Qty
    const note      = cellText(row.getCell(8).value) || "Transfer out from Excel";

    if (!itemId) { skipped++; continue; }
    if (!eventNameMatches(eventName, expectedEventName)) { errors.push(`Row ${rowNumber}: event name mismatch`); continue; }
    if (qty <= 0) { skipped++; continue; }

    const item = itemMap.get(itemId);
    if (!item) { errors.push(`Row ${rowNumber}: item "${itemId}" not found in this event`); continue; }

    try {
      await addStockTransaction({ eventItemId: item.id, typeCode: "transfer_out", quantity: -Math.abs(qty), note, referenceType: "transfer_out_import" });
      processed++;
    } catch (error) {
      errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : "Failed to import transfer out"}`);
    }
  }
  return { processed, skipped, errors };
}

// ── Export: Full Event Report (5 sheets) ──────────────────────────────────────
export async function buildEventReportExcel(eventId: number): Promise<Uint8Array> {
  const workbook   = new ExcelJS.Workbook();
  workbook.creator = "POS System";
  workbook.created = new Date();

  // ── Fetch all data upfront ─────────────────────────────────────────────────
  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const eventName  = eventRow?.name ?? `Event ${eventId}`;

  const itemRows = await db.select().from(eventItems).where(eq(eventItems.eventId, eventId)).orderBy(eventItems.name);

  const stockTxRows = await db
    .select({ eventItemId: stockTransactions.eventItemId, quantity: stockTransactions.quantity, typeCode: stockTransactionTypes.code })
    .from(stockTransactions)
    .innerJoin(stockTransactionTypes, eq(stockTransactions.typeId, stockTransactionTypes.id))
    .innerJoin(eventItems, eq(stockTransactions.eventItemId, eventItems.id))
    .where(eq(eventItems.eventId, eventId));

  type StockMovement = { transferIn: number; transferOut: number; sold: number; adjustment: number };
  const stockMap = new Map<number, StockMovement>();
  for (const item of itemRows) stockMap.set(item.id, { transferIn: 0, transferOut: 0, sold: 0, adjustment: 0 });
  for (const row of stockTxRows) {
    const m = stockMap.get(row.eventItemId); if (!m) continue;
    const qty = Number(row.quantity);
    if (row.typeCode === "transfer_in")  m.transferIn  += qty;
    if (row.typeCode === "transfer_out") m.transferOut += Math.abs(qty);
    if (row.typeCode === "sale")         m.sold        += Math.abs(qty);
    if (row.typeCode === "adjustment")   m.adjustment  += qty;
  }

  const txnRows  = await db.select().from(transactions).where(eq(transactions.eventId, eventId)).orderBy(desc(transactions.createdAt));
  const txnIds   = txnRows.map(t => t.id);
  const lineRows = txnIds.length > 0
    ? await db.select({
        transactionId: transactionItems.transactionId, eventItemId: transactionItems.eventItemId,
        productName: transactionItems.productName, itemId: transactionItems.itemId,
        quantity: transactionItems.quantity, unitPrice: transactionItems.unitPrice,
        discountAmt: transactionItems.discountAmt, finalPrice: transactionItems.finalPrice,
        subtotal: transactionItems.subtotal, promoApplied: transactionItems.promoApplied,
      }).from(transactionItems).where(inArray(transactionItems.transactionId, txnIds))
    : [];

  const linesByTxn = new Map<number, typeof lineRows>();
  for (const line of lineRows) {
    const arr = linesByTxn.get(line.transactionId) ?? []; arr.push(line); linesByTxn.set(line.transactionId, arr);
  }

  type ItemSales = { unitsSold: number; revenue: number; discount: number };
  const salesMap = new Map<number, ItemSales>();
  for (const line of lineRows) {
    const cur = salesMap.get(line.eventItemId) ?? { unitsSold: 0, revenue: 0, discount: 0 };
    cur.unitsSold += Number(line.quantity);
    cur.revenue   += Number(line.subtotal);
    cur.discount  += Number(line.discountAmt) * Number(line.quantity);
    salesMap.set(line.eventItemId, cur);
  }

  const promoRows = await db.select().from(promos).where(eq(promos.eventId, eventId)).orderBy(promos.name);
  const promoItemRows = promoRows.length > 0
    ? await db.select({ promoId: promoItems.promoId, eventItemId: promoItems.eventItemId, itemId: eventItems.itemId, name: eventItems.name })
        .from(promoItems).innerJoin(eventItems, eq(promoItems.eventItemId, eventItems.id))
        .where(inArray(promoItems.promoId, promoRows.map(p => p.id)))
    : [];
  const promoItemsByPromo = new Map<number, typeof promoItemRows>();
  for (const pi of promoItemRows) { const arr = promoItemsByPromo.get(pi.promoId) ?? []; arr.push(pi); promoItemsByPromo.set(pi.promoId, arr); }

  const tierRows = promoRows.length > 0
    ? await db.select().from(promoTiers).where(inArray(promoTiers.promoId, promoRows.map(p => p.id))).orderBy(promoTiers.promoId, promoTiers.minQty)
    : [];
  const tiersByPromo = new Map<number, typeof tierRows>();
  for (const t of tierRows) { const arr = tiersByPromo.get(t.promoId) ?? []; arr.push(t); tiersByPromo.set(t.promoId, arr); }

  function hdr(sheet: ExcelJS.Worksheet, color = "FF1e104e") {
    const row = sheet.getRow(1);
    row.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    row.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.height    = 24;
    sheet.views   = [{ state: "frozen", ySplit: 1 }];
  }
  const n = (v: unknown) => Number(v ?? 0);

  // ══ Sheet 1 — Items & Stock ════════════════════════════════════════════════
  const s1 = workbook.addWorksheet("Items & Stock");
  s1.columns = [
    { header: "Base Item No.",   key: "baseItemNo",  width: 16 },
    { header: "Variant Code",    key: "variantCode", width: 13 },
    { header: "Reference No.",   key: "itemId",      width: 22 },
    { header: "Description",     key: "name",        width: 36 },
    { header: "Description 2",   key: "color",       width: 22 },
    { header: "Unit",            key: "unit",        width: 8  },
    { header: "Net Price",       key: "netPrice",    width: 14 },
    { header: "Retail Price",    key: "retailPrice", width: 14 },
    { header: "Transfer In",     key: "transferIn",  width: 13 },
    { header: "Transfer Out",    key: "transferOut", width: 13 },
    { header: "Sold",            key: "sold",        width: 10 },
    { header: "Adjustment",      key: "adjustment",  width: 12 },
    { header: "Stock Remaining", key: "stock",       width: 15 },
  ];
  hdr(s1, "FF1e3a5f");

  for (const item of itemRows) {
    const m = stockMap.get(item.id) ?? { transferIn: 0, transferOut: 0, sold: 0, adjustment: 0 };
    s1.addRow({
      baseItemNo: item.baseItemNo ?? item.itemId, itemId: item.itemId, variantCode: item.variantCode ?? "",
      name: item.name, color: item.color ?? "", unit: item.unit ?? "PCS",
      netPrice: n(item.netPrice), retailPrice: n(item.retailPrice),
      transferIn: m.transferIn, transferOut: m.transferOut, sold: m.sold, adjustment: m.adjustment, stock: item.stock,
    });
  }
  s1.eachRow((row, rn) => {
    if (rn === 1) return;
    const stock = Number(row.getCell("stock").value ?? 0);
    if (stock < 0)      row.getCell("stock").font = { color: { argb: "FFDC2626" }, bold: true };
    else if (stock === 0) row.getCell("stock").font = { color: { argb: "FFF59E0B" }, bold: true };
  });
  ["netPrice", "retailPrice"].forEach(k => { s1.getColumn(k).numFmt = "#,##0"; });

  // ══ Sheet 2 — Transactions ════════════════════════════════════════════════
  // Columns: Date | Txn ID | Payment | Reference | Base Item No. | Ref No. | Variant | Product | Promo | Qty | Unit Price | Discount | Final Price | Subtotal
  // • Promo is right after product — per request
  // • Txn-level total/discount/final columns removed — per request
  const s2 = workbook.addWorksheet("Transactions");
  s2.columns = [
    { header: "Date",           key: "date",        width: 20 },
    { header: "Txn ID",         key: "txnId",       width: 10 },
    { header: "Payment Method", key: "method",      width: 18 },
    { header: "Reference",      key: "reference",   width: 18 },
    { header: "Base Item No.",  key: "baseItemNo",  width: 16 },
    { header: "Variant Code",   key: "variantCode", width: 13 },
    { header: "Ref No.",        key: "itemId",      width: 18 },
    { header: "Product",        key: "product",     width: 32 },
    { header: "Promo Applied",  key: "promo",       width: 22 },
    { header: "Qty",            key: "qty",         width: 7  },
    { header: "Unit Price",     key: "unitPrice",   width: 14 },
    { header: "Discount",       key: "discount",    width: 13 },
    { header: "Final Price",    key: "finalPrice",  width: 13 },
    { header: "Subtotal",       key: "subtotal",    width: 14 },
  ];
  hdr(s2, "FF1e104e");

  // Build a lookup: eventItemId → item metadata (for base item no. + variant)
  const itemMetaMap = new Map(itemRows.map(i => [i.id, i]));

  for (const txn of txnRows) {
    const lines = linesByTxn.get(txn.id) ?? [];
    if (lines.length === 0) {
      s2.addRow({
        date: txn.createdAt ? formatDate(String(txn.createdAt)) : "—", txnId: txn.id,
        method: txn.paymentMethod ?? "—", reference: txn.paymentReference ?? "—",
        baseItemNo: "", itemId: "", variantCode: "", product: "(no items)", promo: "",
        qty: "", unitPrice: "", discount: "", finalPrice: "", subtotal: "",
      });
      continue;
    }
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const meta = itemMetaMap.get(line.eventItemId);
      s2.addRow({
        date:        li === 0 ? (txn.createdAt ? formatDate(String(txn.createdAt)) : "—") : "",
        txnId:       li === 0 ? txn.id : "",
        method:      li === 0 ? (txn.paymentMethod ?? "—") : "",
        reference:   li === 0 ? (txn.paymentReference ?? "—") : "",
        baseItemNo:  meta?.baseItemNo ?? line.itemId,
        itemId:      line.itemId,
        variantCode: meta?.variantCode ?? "",
        product:     line.productName,
        promo:       line.promoApplied ?? "",
        qty:         Number(line.quantity),
        unitPrice:   n(line.unitPrice),
        discount:    n(line.discountAmt),
        finalPrice:  n(line.finalPrice),
        subtotal:    n(line.subtotal),
      });
    }
  }
  ["unitPrice", "discount", "finalPrice", "subtotal"].forEach(k => { s2.getColumn(k).numFmt = "#,##0"; });

  // ══ Sheet 3 — Promotions ══════════════════════════════════════════════════
  const s3 = workbook.addWorksheet("Promotions");
  s3.columns = [
    { header: "Promo Name",       key: "name",        width: 28 },
    { header: "Type",             key: "type",        width: 16 },
    { header: "Active",           key: "active",      width: 8  },
    { header: "Apply To",         key: "applyTo",     width: 18 },
    { header: "Items",            key: "items",       width: 36 },
    { header: "Discount %",       key: "discPct",     width: 12 },
    { header: "Discount Fix",     key: "discFix",     width: 14 },
    { header: "Fixed Price",      key: "fixedPrice",  width: 14 },
    { header: "Buy Qty",          key: "buyQty",      width: 9  },
    { header: "Free Qty",         key: "freeQty",     width: 9  },
    { header: "Bundle Price",     key: "bundlePrice", width: 14 },
    { header: "Min Spend",        key: "minSpend",    width: 14 },
    { header: "Min Purchase Qty", key: "minPurchQty", width: 16 },
    { header: "Max Usage",        key: "maxUsage",    width: 12 },
    { header: "Usage Count",      key: "usageCount",  width: 13 },
    { header: "Tiers",            key: "tiers",       width: 40 },
    { header: "Flash Start",      key: "flashStart",  width: 20 },
    { header: "Flash End",        key: "flashEnd",    width: 20 },
  ];
  hdr(s3, "FF4a1d96");

  for (const promo of promoRows) {
    const appliedItems = promoItemsByPromo.get(promo.id) ?? [];
    const tiers        = tiersByPromo.get(promo.id) ?? [];
    const tierStr      = tiers.map(t => {
      const parts = [`≥${t.minQty}`];
      if (t.discountPct) parts.push(`${t.discountPct}%`);
      if (t.fixedPrice)  parts.push(`fixed ${n(t.fixedPrice).toLocaleString("id-ID")}`);
      return parts.join(" → ");
    }).join(" | ");

    s3.addRow({
      name: promo.name, type: promo.type, active: promo.isActive ? "Yes" : "No",
      applyTo: promo.applyToAll ? "All Items" : "Selected",
      items:   promo.applyToAll ? "(all)" : appliedItems.map(i => `${i.itemId} ${i.name}`).join(", "),
      discPct:     promo.discountPct    ? n(promo.discountPct)    : "",
      discFix:     promo.discountFix    ? n(promo.discountFix)    : "",
      fixedPrice:  promo.fixedPrice     ? n(promo.fixedPrice)     : "",
      buyQty:      promo.buyQty         ?? "",
      freeQty:     promo.getFreeQty     ?? "",
      bundlePrice: promo.bundlePrice    ? n(promo.bundlePrice)    : "",
      minSpend:    promo.spendMinAmount ? n(promo.spendMinAmount) : "",
      minPurchQty: promo.minPurchaseQty ?? "",
      maxUsage:    promo.maxUsageCount  ?? "∞",
      usageCount:  promo.usageCount,
      tiers:       tierStr,
      flashStart:  promo.flashStartTime ? formatDate(String(promo.flashStartTime)) : "",
      flashEnd:    promo.flashEndTime   ? formatDate(String(promo.flashEndTime))   : "",
    });
  }
  ["discFix", "fixedPrice", "bundlePrice", "minSpend"].forEach(k => { s3.getColumn(k).numFmt = "#,##0"; });
  if (promoRows.length === 0) s3.addRow({ name: "(no promotions for this event)" });

  // ══ Sheet 4 — Sales Summary ════════════════════════════════════════════════
  const s4 = workbook.addWorksheet("Sales Summary");
  s4.columns = [
    { header: "Base Item No.",   key: "baseItemNo",   width: 16 },
    { header: "Variant Code",    key: "variantCode",  width: 13 },
    { header: "Reference No.",   key: "itemId",       width: 22 },
    { header: "Description",     key: "name",         width: 36 },
    { header: "Net Price",       key: "netPrice",     width: 14 },
    { header: "Units Sold",      key: "unitsSold",    width: 12 },
    { header: "Stock Remaining", key: "remaining",    width: 15 },
    { header: "Gross Revenue",   key: "grossRevenue", width: 16 },
    { header: "Discounts Given", key: "discounts",    width: 16 },
    { header: "Net Revenue",     key: "netRevenue",   width: 16 },
    { header: "Avg Sell Price",  key: "avgPrice",     width: 15 },
  ];
  hdr(s4, "FF065f46");

  let totalUnitsSold = 0, totalGross = 0, totalDisc = 0;
  for (const item of itemRows) {
    const s = salesMap.get(item.id) ?? { unitsSold: 0, revenue: 0, discount: 0 };
    const gross = s.revenue, disc = s.discount, net = gross - disc;
    totalUnitsSold += s.unitsSold; totalGross += gross; totalDisc += disc;
    s4.addRow({
      baseItemNo: item.baseItemNo ?? item.itemId, itemId: item.itemId, variantCode: item.variantCode ?? "",
      name: item.name, netPrice: n(item.netPrice), unitsSold: s.unitsSold, remaining: item.stock,
      grossRevenue: gross, discounts: disc, netRevenue: net,
      avgPrice: s.unitsSold > 0 ? Math.round(net / s.unitsSold) : 0,
    });
  }
  const totalRow = s4.addRow({
    baseItemNo: "", itemId: "", variantCode: "", name: `TOTAL — ${eventName}`, netPrice: "",
    unitsSold: totalUnitsSold, remaining: itemRows.reduce((s, i) => s + Number(i.stock), 0),
    grossRevenue: totalGross, discounts: totalDisc, netRevenue: totalGross - totalDisc,
    avgPrice: totalUnitsSold > 0 ? Math.round((totalGross - totalDisc) / totalUnitsSold) : 0,
  });
  totalRow.font = { bold: true, color: { argb: "FF065f46" } };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  totalRow.eachCell(cell => { cell.border = { top: { style: "medium", color: { argb: "FF065f46" } } }; });
  ["netPrice", "grossRevenue", "discounts", "netRevenue", "avgPrice"].forEach(k => { s4.getColumn(k).numFmt = "#,##0"; });

  // ══ Sheet 5 — Event Summary ════════════════════════════════════════════════
  const s5 = workbook.addWorksheet("Event Summary");
  s5.getColumn(1).width = 28; s5.getColumn(2).width = 22;

  function addKV(label: string, value: string | number, bold = false) {
    const row = s5.addRow([label, value]);
    if (bold) { row.font = { bold: true }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }; }
    row.getCell(2).alignment = { horizontal: "right" };
    if (typeof value === "number") row.getCell(2).numFmt = "#,##0";
  }
  function addSection(title: string) {
    const row = s5.addRow([title]);
    row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1e104e" } };
    row.height = 20;
    s5.mergeCells(`A${row.number}:B${row.number}`);
  }

  s5.addRow([`Event Report — ${eventName}`]).font = { bold: true, size: 14 };
  s5.addRow([`Generated: ${new Date().toLocaleString("id-ID")}`]).font = { italic: true, color: { argb: "FF6B7280" } };
  s5.addRow([]);

  const totalFinal = txnRows.reduce((s, t) => s + n(t.finalAmount), 0);
  const totalTxnDisc  = txnRows.reduce((s, t) => s + n(t.discount), 0);
  const totalTxnGross = txnRows.reduce((s, t) => s + n(t.totalAmount), 0);

  addSection("Transactions");
  addKV("Total Transactions",   txnRows.length);
  addKV("Gross Revenue (Rp)",   totalTxnGross, true);
  addKV("Total Discounts (Rp)", totalTxnDisc);
  addKV("Net Revenue (Rp)",     totalFinal,    true);
  addKV("Avg per Transaction",  txnRows.length > 0 ? Math.round(totalFinal / txnRows.length) : 0);
  s5.addRow([]);

  addSection("Stock");
  addKV("Total Item Lines",      itemRows.length);
  addKV("Total Units Sold",      totalUnitsSold, true);
  addKV("Remaining Stock Units", itemRows.reduce((s, i) => s + Number(i.stock), 0));
  addKV("Total Transfer In",  [...stockMap.values()].reduce((s, m) => s + m.transferIn,  0));
  addKV("Total Transfer Out", [...stockMap.values()].reduce((s, m) => s + m.transferOut, 0));
  s5.addRow([]);

  addSection("Promotions");
  addKV("Active Promos", promoRows.filter(p => p.isActive).length);
  addKV("Total Promos",  promoRows.length);
  s5.addRow([]);

  addSection("Payment Methods");
  const methodTotals = new Map<string, { count: number; total: number }>();
  for (const txn of txnRows) {
    const method = txn.paymentMethod ?? "Unknown";
    const cur = methodTotals.get(method) ?? { count: 0, total: 0 };
    cur.count++; cur.total += n(txn.finalAmount); methodTotals.set(method, cur);
  }
  for (const [method, data] of methodTotals.entries()) addKV(`${method} (${data.count} txns)`, data.total);

  return toUint8Array(workbook);
}