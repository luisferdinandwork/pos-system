// lib/export-excel.ts
import ExcelJS from "exceljs";
import { getAllTransactions, getTransactionItems } from "@/lib/transactions";
import { getEventItems, bulkUpsertEventItems } from "@/lib/events";
import { formatDate } from "@/lib/utils";
import { getItemsWithStockForEvent, addStockTransaction } from "@/lib/stock";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
  cashierSessions,
  cashDrawerCounts,
  receiptPrintLogs,
  authUsers,
  authUserEvents,
} from "@/lib/db/schema";
import { localDb } from "@/lib/local-db";
import {
  localTransactions,
  localTransactionItems,
  localEventItems,
} from "@/lib/local-db/schema";

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

  const VOID_RED = "FFDC2626";
  const VOID_BG  = "FFFEF2F2";

  sheet.columns = [
    { header: "Date",              key: "date",       width: 22 },
    { header: "Transaction ID",    key: "txnId",      width: 14 },
    { header: "Event ID",          key: "eventId",    width: 10 },
    { header: "Status",            key: "status",     width: 14 },
    { header: "Voided By",         key: "voidedBy",   width: 18 },
    { header: "Void Reason",       key: "voidReason", width: 26 },
    { header: "Items",             key: "items",      width: 45 },
    { header: "Subtotal (Rp)",     key: "subtotal",   width: 16 },
    { header: "Discount (Rp)",     key: "discount",   width: 16 },
    { header: "Total (Rp)",        key: "total",      width: 16 },
    { header: "Payment Method",    key: "method",     width: 18 },
    { header: "Payment Reference", key: "reference",  width: 24 },
  ];
  styleHeader(sheet);

  const txns = await getAllTransactions();
  for (const txn of txns) {
    const items = await getTransactionItems(txn.id);

    // Only the reversing entry counts as "Void" — an original that was
    // later voided still reads as "Completed" here. voidedAt/voidedBy/
    // voidReason are shown as separate audit columns regardless of which
    // row this is, since that's useful context, not a status label.
    const isVoidEntry = txn.voidOfTransactionId != null;

    const row = sheet.addRow({
      date:       txn.createdAt ? formatDate(txn.createdAt) : "—",
      txnId:      txn.id,
      eventId:    txn.eventId,
      status:     isVoidEntry ? "Void" : "Completed",
      voidedBy:   txn.voidedBy ?? "—",
      voidReason: txn.voidReason ?? "—",
      items:      items.map(i => `${i.productName} x${i.quantity}`).join(", "),
      subtotal:   parseFloat(String(txn.totalAmount)),
      discount:   parseFloat(String(txn.discount ?? 0)),
      total:      parseFloat(String(txn.finalAmount)),
      method:     txn.paymentMethod ?? "—",
      reference:  txn.paymentReference ?? "—",
    });

    if (isVoidEntry) {
      row.getCell("status").font = { bold: true, color: { argb: VOID_RED } };
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VOID_BG } };
      });
    }
  }
  ["subtotal", "discount", "total"].forEach(k => { sheet.getColumn(k).numFmt = "#,##0"; });
  return toUint8Array(workbook);
}

// ── Export: POS Transactions (today / whole event, from local SQLite) ────────
// Same look as the "Transactions" sheet in buildEventReportExcel, but scoped
// to a single event, sourced from the local POS SQLite (works offline), and
// optionally filtered to today only.
export async function buildLocalTransactionsExcel(
  eventId: number,
  opts: { todayOnly?: boolean } = {}
): Promise<Uint8Array> {
  const { todayOnly = false } = opts;

  const workbook   = new ExcelJS.Workbook();
  workbook.creator = "POS System";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Transactions");

  const BRAND    = "FF1e104e";
  const VOID_RED = "FFDC2626";
  const VOID_BG  = "FFFEF2F2";

  sheet.columns = [
    { header: "Date",                key: "date",         width: 20 },
    { header: "Transaction ID",      key: "displayId",    width: 22 },
    { header: "Client Txn ID",       key: "clientTxnId",  width: 26 },
    { header: "Cashier",             key: "cashier",      width: 20 },
    { header: "Status",              key: "status",       width: 14 },
    { header: "Sync Status",         key: "syncStatus",   width: 12 },
    { header: "Voided By",           key: "voidedBy",     width: 18 },
    { header: "Void Reason",         key: "voidReason",   width: 26 },
    { header: "Receipt Print Count", key: "printCount",   width: 18 },
    { header: "Payment Method",      key: "method",       width: 18 },
    { header: "Reference",           key: "reference",    width: 18 },
    { header: "Cash Tendered",       key: "cashTendered", width: 16 },
    { header: "Change",              key: "changeAmount", width: 14 },
    { header: "Base Item No.",       key: "baseItemNo",   width: 16 },
    { header: "Variant Code",        key: "variantCode",  width: 13 },
    { header: "Ref No.",             key: "itemId",       width: 18 },
    { header: "Product",             key: "product",      width: 34 },
    { header: "Promo Applied",       key: "promo",        width: 22 },
    { header: "Qty",                 key: "qty",          width: 8  },
    { header: "Unit Price",          key: "unitPrice",    width: 14 },
    { header: "Discount",            key: "discount",     width: 13 },
    { header: "Final Price",         key: "finalPrice",   width: 13 },
    { header: "Subtotal",            key: "subtotal",     width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  headerRow.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height    = 24;
  sheet.views       = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter  = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };

  let txns = localDb
    .select()
    .from(localTransactions)
    .where(eq(localTransactions.eventId, eventId))
    .orderBy(desc(localTransactions.createdAt))
    .all();

  if (todayOnly) {
    // Matches getLocalEventStats' definition of "today" so this export lines
    // up with the numbers shown on the POS Sales Report drawer.
    const todayPrefix = new Date().toISOString().slice(0, 10);
    txns = txns.filter(txn => String(txn.createdAt ?? "").startsWith(todayPrefix));
  }

  const clientTxnIds = txns.map(txn => txn.clientTxnId);

  const lineRows = clientTxnIds.length > 0
    ? localDb.select().from(localTransactionItems).where(inArray(localTransactionItems.clientTxnId, clientTxnIds)).all()
    : [];

  const linesByTxn = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const arr = linesByTxn.get(line.clientTxnId) ?? [];
    arr.push(line);
    linesByTxn.set(line.clientTxnId, arr);
  }

  const itemRows    = localDb.select().from(localEventItems).where(eq(localEventItems.eventId, eventId)).all();
  const itemMetaMap = new Map(itemRows.map(item => [item.id, item]));

  const n = (v: unknown) => Number(v ?? 0);
  const d = (v: unknown) => v ? formatDate(String(v)) : "—";

  function styleVoidRow(row: ExcelJS.Row) {
    row.getCell("status").font = { bold: true, color: { argb: VOID_RED } };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VOID_BG } };
    });
  }

  for (const txn of txns) {
    const lines     = linesByTxn.get(txn.clientTxnId) ?? [];
    const displayId = txn.displayId ?? txn.clientTxnId;

    // Same rule as buildTransactionExcel (cloud): only the reversing entry
    // itself reads as "Voided" — an original that was later voided still
    // shows "Completed" here since it's still a real sale row. This is what
    // makes this export's shape match the "entire event" export exactly.
    const isVoidEntry = (txn as any).voidOfClientTxnId != null;

    const baseTxnData = {
      date:         d(txn.createdAt),
      displayId,
      clientTxnId:  txn.clientTxnId,
      cashier:      txn.cashierName ?? "—",
      status:       isVoidEntry ? "Voided" : "Completed",
      syncStatus:   txn.syncStatus ?? "—",
      voidedBy:     txn.voidedBy ?? "—",
      voidReason:   txn.voidReason ?? "—",
      printCount:   n(txn.receiptPrintCount),
      method:       txn.paymentMethod ?? "—",
      reference:    txn.paymentReference ?? "—",
      cashTendered: txn.cashTendered ? n(txn.cashTendered) : 0,
      changeAmount: txn.changeAmount ? n(txn.changeAmount) : 0,
    };

    if (lines.length === 0) {
      const row = sheet.addRow({
        ...baseTxnData,
        baseItemNo: "—", variantCode: "—", itemId: "—",
        product: "(no items)", promo: "—",
        qty: 0, unitPrice: 0, discount: 0, finalPrice: 0, subtotal: 0,
      });
      if (isVoidEntry) styleVoidRow(row);
      continue;
    }

    for (const line of lines) {
      const meta = itemMetaMap.get(line.eventItemId);
      const row = sheet.addRow({
        ...baseTxnData,
        baseItemNo:  meta?.baseItemNo ?? line.itemId ?? "—",
        variantCode: meta?.variantCode ?? "—",
        itemId:      line.itemId ?? "—",
        product:     line.productName ?? "—",
        promo:       line.promoApplied ?? "—",
        qty:         n(line.quantity),
        unitPrice:   n(line.unitPrice),
        discount:    n(line.discountAmt),
        finalPrice:  n(line.finalPrice),
        subtotal:    n(line.subtotal),
      });
      if (isVoidEntry) styleVoidRow(row);
    }
  }

  ["cashTendered", "changeAmount", "unitPrice", "discount", "finalPrice", "subtotal"]
    .forEach(k => { sheet.getColumn(k).numFmt = "#,##0"; });

  // Fill blanks, then apply borders/wrap/zebra — same finishing pass as
  // buildEventReportExcel, minus the void-row fills which are set above.
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    for (let col = 1; col <= sheet.columnCount; col++) {
      const cell = row.getCell(col);
      if (cell.value === null || cell.value === undefined || cell.value === "") {
        cell.value = "—";
      }
    }
  });

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { ...(cell.alignment ?? {}), vertical: "middle", wrapText: true };
      cell.border = {
        top:    { style: "thin", color: { argb: "FFE5E7EB" } },
        left:   { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right:  { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
    if (rowNumber > 1 && rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        if (!cell.fill || (cell.fill as any).type === undefined) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF8" } };
        }
      });
    }
  });

  return toUint8Array(workbook);
}

// ── Export: Event items ───────────────────────────────────────────────────────
// Standard columns:
// Item No. | Reference No. | Variant Code | Unit of Measure
// Description | Description 2 | BAZAR PRICE | Original Price | Stock
export async function buildEventItemExcel(eventId: number): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Items");

  sheet.columns = [
    { header: "Item No.",         key: "baseItemNo",  width: 16 },
    { header: "Reference No.",    key: "itemId",      width: 22 },
    { header: "Variant Code",     key: "variantCode", width: 14 },
    { header: "Unit of Measure",  key: "unit",        width: 16 },
    { header: "Description",      key: "name",        width: 36 },
    { header: "Description 2",    key: "color",       width: 36 },
    { header: "BAZAR PRICE",      key: "netPrice",    width: 16 },
    { header: "Original Price",   key: "retailPrice", width: 16 },
    { header: "Stock",            key: "stock",       width: 12 },
  ];

  styleHeader(sheet);

  const items = await getEventItems(eventId);

  for (const item of items) {
    sheet.addRow({
      baseItemNo: item.baseItemNo ?? item.itemId,
      itemId: item.itemId,
      variantCode: item.variantCode ?? "",
      unit: item.unit ?? "PCS",
      name: item.name,
      color: item.color ?? "",
      netPrice: parseFloat(String(item.netPrice)),
      retailPrice: parseFloat(String(item.retailPrice)),
      stock: item.stock,
    });
  }

  sheet.getColumn("netPrice").numFmt = "#,##0";
  sheet.getColumn("retailPrice").numFmt = "#,##0";

  return toUint8Array(workbook);
}

// ── Export: Empty item template ───────────────────────────────────────────────
export async function buildEmptyEventItemTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Items");

  sheet.columns = [
    { header: "Item No.",         key: "baseItemNo",  width: 16 },
    { header: "Reference No.",    key: "itemId",      width: 22 },
    { header: "Variant Code",     key: "variantCode", width: 14 },
    { header: "Unit of Measure",  key: "unit",        width: 16 },
    { header: "Description",      key: "name",        width: 36 },
    { header: "Description 2",    key: "color",       width: 36 },
    { header: "BAZAR PRICE",      key: "netPrice",    width: 16 },
    { header: "Original Price",   key: "retailPrice", width: 16 },
    { header: "Stock",            key: "stock",       width: 12 },
  ];

  styleHeader(sheet);

  const example = sheet.addRow({
    baseItemNo: "SPE1040100",
    itemId: "SPE1040100370",
    variantCode: "370",
    unit: "PRS",
    name: "SKYRUNNER EVR",
    color: "WHITE/FOLKSTONE GRAY/GLACIER GRAY",
    netPrice: 500000,
    retailPrice: 500000,
    stock: 0,
  });

  example.font = {
    italic: true,
    color: { argb: "FF999999" },
  };

  sheet.getColumn("netPrice").numFmt = "#,##0";
  sheet.getColumn("retailPrice").numFmt = "#,##0";

  return toUint8Array(workbook);
}

// ── Import: Event items ───────────────────────────────────────────────────────

type ParsedEventItemImportRow = {
  itemId: string;
  baseItemNo: string;
  name: string;
  color: string;
  variantCode: string;
  unit: string;
  netPrice: string;
  retailPrice: string;
  stock: number;
};

type ImportEventItemsResult = {
  inserted: number;
  updated: number;
  skipped: number;
  parsed: number;
  errors: string[];
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function buildHeaderMap(sheet: ExcelJS.Worksheet) {
  const map = new Map<string, number>();
  const headerRow = sheet.getRow(1);

  headerRow.eachCell((cell, colNumber) => {
    const key = normalizeHeader(cellText(cell.value));
    if (key) map.set(key, colNumber);
  });

  return map;
}

function getColumnByAliases(
  headerMap: Map<string, number>,
  aliases: string[]
): number | null {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const col = headerMap.get(key);
    if (col) return col;
  }

  return null;
}

function requiredColumn(
  headerMap: Map<string, number>,
  aliases: string[],
  label: string
): number {
  const col = getColumnByAliases(headerMap, aliases);

  if (!col) {
    throw new Error(
      `Missing required column "${label}". Accepted headers: ${aliases.join(
        ", "
      )}`
    );
  }

  return col;
}

function optionalColumn(
  headerMap: Map<string, number>,
  aliases: string[]
): number | null {
  return getColumnByAliases(headerMap, aliases);
}

function readCellText(row: ExcelJS.Row, col: number | null) {
  if (!col) return "";
  return cellText(row.getCell(col).value);
}

function readCellNumber(row: ExcelJS.Row, col: number | null) {
  if (!col) return 0;
  return cellNumber(row.getCell(col).value);
}

export async function importEventItemsFromExcel(
  data: Uint8Array,
  eventId: number
): Promise<ImportEventItemsResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as any);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      parsed: 0,
      errors: ["No worksheet found in uploaded Excel file."],
    };
  }

  const headerMap = buildHeaderMap(sheet);

  let baseItemNoCol: number;
  let itemIdCol: number;
  let variantCodeCol: number | null;
  let unitCol: number | null;
  let nameCol: number;
  let colorCol: number | null;
  let netPriceCol: number;
  let retailPriceCol: number | null;
  let stockCol: number | null;

  try {
    /**
     * Supports both formats:
     *
     * Your standard uploaded format:
     * Item No. | Reference No. | Variant Code | Unit of Measure
     * Description | Description 2 | BAZAR PRICE | Original Price
     *
     * Old app template:
     * Base Item No. | Variant Code | Reference No. | Unit
     * Description | Description 2 | Net Price | Retail Price | Stock
     */
    baseItemNoCol = requiredColumn(
      headerMap,
      ["Item No.", "Item No", "Base Item No.", "Base Item No", "BaseItemNo"],
      "Item No."
    );

    itemIdCol = requiredColumn(
      headerMap,
      ["Reference No.", "Reference No", "Ref No.", "Ref No", "Item ID", "itemId"],
      "Reference No."
    );

    variantCodeCol = optionalColumn(headerMap, [
      "Variant Code",
      "Variant",
      "Size",
    ]);

    unitCol = optionalColumn(headerMap, [
      "Unit of Measure",
      "Unit",
      "UOM",
    ]);

    nameCol = requiredColumn(
      headerMap,
      ["Description", "Name", "Product Name"],
      "Description"
    );

    colorCol = optionalColumn(headerMap, [
      "Description 2",
      "Description2",
      "Color",
      "Colour",
    ]);

    netPriceCol = requiredColumn(
      headerMap,
      ["BAZAR PRICE", "Bazar Price", "Net Price", "Selling Price"],
      "BAZAR PRICE"
    );

    retailPriceCol = optionalColumn(headerMap, [
      "Original Price",
      "Retail Price",
      "Normal Price",
    ]);

    stockCol = optionalColumn(headerMap, [
      "Stock",
      "Qty",
      "Quantity",
      "Initial Stock",
    ]);
  } catch (error) {
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      parsed: 0,
      errors: [error instanceof Error ? error.message : "Invalid template."],
    };
  }

  const parsed: ParsedEventItemImportRow[] = [];
  const parseErrors: string[] = [];
  let skipped = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);

    const baseItemNo = readCellText(row, baseItemNoCol);
    const itemId = readCellText(row, itemIdCol);
    const variantCode = readCellText(row, variantCodeCol);
    const unit = readCellText(row, unitCol) || "PCS";
    const name = readCellText(row, nameCol);
    const color = readCellText(row, colorCol);
    const netPrice = readCellNumber(row, netPriceCol);
    const retailPrice = readCellNumber(row, retailPriceCol);
    const stockRaw = stockCol ? readCellNumber(row, stockCol) : 0;
    const stock = Math.trunc(stockRaw);

    const isBlankRow =
      !baseItemNo &&
      !itemId &&
      !variantCode &&
      !unit &&
      !name &&
      !color &&
      netPrice <= 0 &&
      retailPrice <= 0;

    if (isBlankRow) {
      skipped++;
      continue;
    }

    if (!itemId) {
      skipped++;
      parseErrors.push(`Row ${rowNumber}: missing Reference No.`);
      continue;
    }

    if (!name) {
      skipped++;
      parseErrors.push(`Row ${rowNumber}: missing Description for "${itemId}".`);
      continue;
    }

    if (!Number.isFinite(netPrice) || netPrice <= 0) {
      skipped++;
      parseErrors.push(`Row ${rowNumber}: invalid BAZAR PRICE for "${itemId}".`);
      continue;
    }

    parsed.push({
      baseItemNo: baseItemNo || itemId,
      itemId,
      variantCode,
      unit,
      name,
      color,
      netPrice: String(netPrice),
      retailPrice: String(retailPrice > 0 ? retailPrice : netPrice),
      stock: Number.isFinite(stock) ? stock : 0,
    });
  }

  if (parsed.length === 0) {
    return {
      inserted: 0,
      updated: 0,
      skipped,
      parsed: 0,
      errors: [...parseErrors, "No valid rows found in file."],
    };
  }

  const result = await bulkUpsertEventItems(eventId, parsed);

  return {
    inserted: result.inserted,
    updated: result.updated,
    skipped,
    parsed: parsed.length,
    errors: [...parseErrors, ...result.errors],
  };
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

// ── Export: Full Event Report ────────────────────────────────────────────────
export async function buildEventReportExcel(eventId: number): Promise<Uint8Array> {
  const workbook   = new ExcelJS.Workbook();
  workbook.creator = "POS System";
  workbook.created = new Date();

  function describeTxnStatus(
    voidOfTransactionId: number | null | undefined
  ): string {
    // The original ALWAYS reads "Completed" here, regardless of voidedAt —
    // only the reversing entry (voidOfTransactionId set) is ever "Void".
    return voidOfTransactionId != null ? "Void" : "Completed";
  }

  function isVoidEntryRow(
    voidOfTransactionId: number | null | undefined
  ): boolean {
    return voidOfTransactionId != null;
  }

  // ── Fetch all data upfront ─────────────────────────────────────────────────
  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const eventName  = eventRow?.name ?? `Event ${eventId}`;

  const itemRows = await db
    .select()
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId))
    .orderBy(eventItems.name, eventItems.variantCode);

  const stockTxRows = await db
    .select({
      id: stockTransactions.id,
      eventItemId: stockTransactions.eventItemId,
      quantity: stockTransactions.quantity,
      stockBefore: stockTransactions.stockBefore,
      stockAfter: stockTransactions.stockAfter,
      transactionId: stockTransactions.transactionId,
      referenceType: stockTransactions.referenceType,
      referenceId: stockTransactions.referenceId,
      note: stockTransactions.note,
      createdAt: stockTransactions.createdAt,
      typeCode: stockTransactionTypes.code,
      typeName: stockTransactionTypes.name,
    })
    .from(stockTransactions)
    .innerJoin(stockTransactionTypes, eq(stockTransactions.typeId, stockTransactionTypes.id))
    .innerJoin(eventItems, eq(stockTransactions.eventItemId, eventItems.id))
    .where(eq(eventItems.eventId, eventId))
    .orderBy(desc(stockTransactions.createdAt));

  type StockMovement = {
    transferIn: number;
    transferOut: number;
    sold: number;
    adjustment: number;
    voidRestocked: number;
  };

  const stockMap = new Map<number, StockMovement>();
  for (const item of itemRows) {
    stockMap.set(item.id, { transferIn: 0, transferOut: 0, sold: 0, adjustment: 0, voidRestocked: 0 });
  }

  for (const row of stockTxRows) {
    const m = stockMap.get(row.eventItemId);
    if (!m) continue;

    const qty = Number(row.quantity ?? 0);
    if (row.typeCode === "transfer_in")  m.transferIn  += qty;
    if (row.typeCode === "transfer_out") m.transferOut += Math.abs(qty);
    if (row.typeCode === "sale")         m.sold        += Math.abs(qty);
    if (row.typeCode === "adjustment") {
      if (row.referenceType === "void") {
        // This is a restock generated by voidTransaction(). Net it back out
        // of "sold" so this sheet's Units Sold agrees with Sales Summary
        // (Sheet 3), which already nets void_entry line items automatically.
        m.sold -= Math.abs(qty);
        m.voidRestocked += Math.abs(qty);
      } else {
        m.adjustment += qty;
      }
    }
  }

  const txnRows = await db
    .select({
      id:               transactions.id,
      displayId:        transactions.displayId,
      eventId:          transactions.eventId,
      clientTxnId:      transactions.clientTxnId,
      cashierSessionId: transactions.cashierSessionId,
      // cashierName stamped directly on the transaction at sale time —
      // present even when the session was never synced or has since been deleted
      cashierNameDirect: transactions.cashierName,
      totalAmount:      transactions.totalAmount,
      discount:         transactions.discount,
      finalAmount:      transactions.finalAmount,
      cashTendered:     transactions.cashTendered,
      changeAmount:     transactions.changeAmount,
      paymentMethod:    transactions.paymentMethod,
      paymentReference: transactions.paymentReference,
      createdAt:        transactions.createdAt,
      // posUserName from the joined session — used as a secondary source
      posUserName:      cashierSessions.cashierName,
      status:              transactions.status,
      voidedAt:            transactions.voidedAt,
      voidedBy:            transactions.voidedBy,
      voidReason:          transactions.voidReason,
      voidOfTransactionId: transactions.voidOfTransactionId,
    })
    .from(transactions)
    .leftJoin(cashierSessions, eq(transactions.cashierSessionId, cashierSessions.id))
    .where(eq(transactions.eventId, eventId))
    .orderBy(desc(transactions.createdAt));

  const txnIds = txnRows.map(t => t.id);

  const lineRows = txnIds.length > 0
    ? await db.select({
        transactionId: transactionItems.transactionId,
        eventItemId: transactionItems.eventItemId,
        productName: transactionItems.productName,
        itemId: transactionItems.itemId,
        quantity: transactionItems.quantity,
        unitPrice: transactionItems.unitPrice,
        discountAmt: transactionItems.discountAmt,
        finalPrice: transactionItems.finalPrice,
        subtotal: transactionItems.subtotal,
        promoApplied: transactionItems.promoApplied,
      })
      .from(transactionItems)
      .where(inArray(transactionItems.transactionId, txnIds))
    : [];

  const linesByTxn = new Map<number, typeof lineRows>();
  for (const line of lineRows) {
    const arr = linesByTxn.get(line.transactionId) ?? [];
    arr.push(line);
    linesByTxn.set(line.transactionId, arr);
  }

  // Line items that belong to a void-entry (reversing) transaction — used to
  // compute a "Voided Units" figure per item for the Sales Summary sheet.
  const voidEntryTxnIds = new Set(
    txnRows.filter(t => t.voidOfTransactionId != null).map(t => t.id)
  );

  type ItemSales = { unitsSold: number; grossRevenue: number; netRevenue: number; discount: number };
  const salesMap = new Map<number, ItemSales>();
  const voidedUnitsMap = new Map<number, number>();

  for (const line of lineRows) {
    const cur = salesMap.get(line.eventItemId) ?? { unitsSold: 0, grossRevenue: 0, netRevenue: 0, discount: 0 };
    const qty = Number(line.quantity ?? 0);
    cur.unitsSold    += qty;
    cur.grossRevenue += Number(line.unitPrice ?? 0) * qty;
    cur.netRevenue   += Number(line.subtotal ?? 0);
    cur.discount     += Number(line.discountAmt ?? 0) * qty;
    salesMap.set(line.eventItemId, cur);

    if (voidEntryTxnIds.has(line.transactionId)) {
      voidedUnitsMap.set(
        line.eventItemId,
        (voidedUnitsMap.get(line.eventItemId) ?? 0) + Math.abs(qty)
      );
    }
  }

  const printCountRows = txnIds.length > 0
    ? await db
        .select({
          transactionId: receiptPrintLogs.transactionId,
          printCount: sql<number>`count(${receiptPrintLogs.id})`,
        })
        .from(receiptPrintLogs)
        .where(inArray(receiptPrintLogs.transactionId, txnIds))
        .groupBy(receiptPrintLogs.transactionId)
    : [];

  const printCountMap = new Map<number, number>();
  for (const row of printCountRows) {
    printCountMap.set(row.transactionId, Number(row.printCount ?? 0));
  }

  const cashierRows = await db
    .select()
    .from(cashierSessions)
    .where(eq(cashierSessions.eventId, eventId))
    .orderBy(desc(cashierSessions.openedAt));

  const drawerRows = await db
    .select({
      countedBy: cashDrawerCounts.countedBy,
      posUserName: cashierSessions.cashierName,
      expectedCash: cashDrawerCounts.expectedCash,
      actualCash: cashDrawerCounts.actualCash,
      difference: cashDrawerCounts.difference,
      reason: cashDrawerCounts.reason,
      notes: cashDrawerCounts.notes,
      countedAt: cashDrawerCounts.countedAt,
      createdAt: cashDrawerCounts.createdAt,
    })
    .from(cashDrawerCounts)
    .leftJoin(cashierSessions, eq(cashDrawerCounts.cashierSessionId, cashierSessions.id))
    .where(eq(cashDrawerCounts.eventId, eventId))
    .orderBy(desc(cashDrawerCounts.countedAt));

  const eventUserRows = await db
    .select({
      name: authUsers.name,
      username: authUsers.username,
      role: authUsers.role,
      isActive: authUsers.isActive,
      assignmentActive: authUserEvents.isActive,
      createdAt: authUsers.createdAt,
    })
    .from(authUserEvents)
    .innerJoin(authUsers, eq(authUsers.id, authUserEvents.userId))
    .where(eq(authUserEvents.eventId, eventId))
    .orderBy(authUsers.name);

  const promoRows = await db.select().from(promos).where(eq(promos.eventId, eventId)).orderBy(promos.name);
  const promoItemRows = promoRows.length > 0
    ? await db.select({ promoId: promoItems.promoId, eventItemId: promoItems.eventItemId, itemId: eventItems.itemId, name: eventItems.name })
        .from(promoItems).innerJoin(eventItems, eq(promoItems.eventItemId, eventItems.id))
        .where(inArray(promoItems.promoId, promoRows.map(p => p.id)))
    : [];
  const promoItemsByPromo = new Map<number, typeof promoItemRows>();
  for (const pi of promoItemRows) {
    const arr = promoItemsByPromo.get(pi.promoId) ?? [];
    arr.push(pi);
    promoItemsByPromo.set(pi.promoId, arr);
  }

  const tierRows = promoRows.length > 0
    ? await db.select().from(promoTiers).where(inArray(promoTiers.promoId, promoRows.map(p => p.id))).orderBy(promoTiers.promoId, promoTiers.minQty)
    : [];
  const tiersByPromo = new Map<number, typeof tierRows>();
  for (const t of tierRows) {
    const arr = tiersByPromo.get(t.promoId) ?? [];
    arr.push(t);
    tiersByPromo.set(t.promoId, arr);
  }

  const n = (v: unknown) => Number(v ?? 0);
  const d = (v: unknown) => v ? formatDate(String(v)) : "—";
  const itemMetaMap = new Map(itemRows.map(i => [i.id, i]));

  const BRAND = "FF1e104e";
  const BLUE  = "FF1e3a5f";
  const GREEN = "FF065f46";
  const PURPLE = "FF4a1d96";
  const GRAY = "FF4b5563";
  const ORANGE = "FFc2410c";
  const VOID_RED = "FFDC2626";
  const VOID_BG = "FFFEF2F2";

  function setupSheet(sheet: ExcelJS.Worksheet, headerColor = BRAND) {
    const row = sheet.getRow(1);
    row.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    row.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: headerColor } };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.height    = 24;
    sheet.views   = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: sheet.columnCount },
    };
  }

  function moneyCols(sheet: ExcelJS.Worksheet, keys: string[]) {
    keys.forEach(k => { sheet.getColumn(k).numFmt = '#,##0'; });
  }

  function addTotalStyle(row: ExcelJS.Row, color = "FFD1FAE5", fontColor = "FF065f46") {
    row.font = { bold: true, color: { argb: fontColor } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    row.eachCell(cell => {
      cell.border = {
        top: { style: "medium", color: { argb: fontColor } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  }

  // ══ Sheet 1 — Items & Stock ════════════════════════════════════════════════
  const s1 = workbook.addWorksheet("Items & Stock", { properties: { tabColor: { argb: BLUE } } });
  s1.columns = [
    { header: "Base Item No.",           key: "baseItemNo",    width: 16 },
    { header: "Variant Code",            key: "variantCode",   width: 13 },
    { header: "Reference No.",           key: "itemId",        width: 22 },
    { header: "Description",             key: "name",          width: 36 },
    { header: "Description 2",           key: "color",         width: 22 },
    { header: "Unit",                    key: "unit",          width: 8  },
    { header: "Net Price",               key: "netPrice",      width: 14 },
    { header: "Retail Price",            key: "retailPrice",   width: 14 },
    { header: "Total Item Lines",        key: "itemLine",      width: 16 },
    { header: "Total Transfer In",       key: "transferIn",    width: 18 },
    { header: "Total Transfer Out",      key: "transferOut",   width: 18 },
    { header: "Adjusted Stock",          key: "adjustment",    width: 16 },
    { header: "Voided Units Restocked",  key: "voidRestocked", width: 20 },
    { header: "Total Units Sold",        key: "sold",          width: 16 },
    { header: "Remaining Stock",         key: "stock",         width: 16 },
  ];
  setupSheet(s1, BLUE);

  for (const item of itemRows) {
    const m = stockMap.get(item.id) ?? { transferIn: 0, transferOut: 0, sold: 0, adjustment: 0, voidRestocked: 0 };
    s1.addRow({
      baseItemNo: item.baseItemNo ?? item.itemId,
      itemId: item.itemId,
      variantCode: item.variantCode ?? "",
      name: item.name,
      color: item.color ?? "",
      unit: item.unit ?? "PCS",
      netPrice: n(item.netPrice),
      retailPrice: n(item.retailPrice),
      itemLine: 1,
      transferIn: m.transferIn,
      transferOut: m.transferOut,
      adjustment: m.adjustment,
      voidRestocked: m.voidRestocked,
      sold: m.sold,
      stock: item.stock,
    });
  }
  const totalTransferIn    = [...stockMap.values()].reduce((s, m) => s + m.transferIn,    0);
  const totalTransferOut   = [...stockMap.values()].reduce((s, m) => s + m.transferOut,   0);
  const totalAdjustment    = [...stockMap.values()].reduce((s, m) => s + m.adjustment,    0);
  const totalVoidRestocked = [...stockMap.values()].reduce((s, m) => s + m.voidRestocked, 0);
  const totalUnitsSold     = [...stockMap.values()].reduce((s, m) => s + m.sold,          0);
  const totalRemaining     = itemRows.reduce((s, i) => s + Number(i.stock), 0);
  const itemTotalRow = s1.addRow({
    name: `TOTAL — ${eventName}`,
    itemLine: itemRows.length,
    transferIn: totalTransferIn,
    transferOut: totalTransferOut,
    adjustment: totalAdjustment,
    voidRestocked: totalVoidRestocked,
    sold: totalUnitsSold,
    stock: totalRemaining,
  });
  addTotalStyle(itemTotalRow, "FFE0F2FE", BLUE);
  s1.eachRow((row, rn) => {
    if (rn === 1) return;
    const stock = Number(row.getCell("stock").value ?? 0);
    if (stock < 0) row.getCell("stock").font = { color: { argb: "FFDC2626" }, bold: true };
    else if (stock === 0) row.getCell("stock").font = { color: { argb: "FFF59E0B" }, bold: true };
  });
  moneyCols(s1, ["netPrice", "retailPrice"]);

  // ══ Sheet 2 — Transactions ════════════════════════════════════════════════
  const s2 = workbook.addWorksheet("Transactions", { properties: { tabColor: { argb: BRAND } } });
  s2.columns = [
    { header: "Date",                key: "date",          width: 20 },
    { header: "Transaction ID",      key: "displayId",     width: 22 },
    { header: "Client Txn ID",       key: "clientTxnId",   width: 26 },
    { header: "POS User",            key: "posUser",       width: 20 },
    { header: "Status",              key: "status",        width: 14 },
    { header: "Voided By",           key: "voidedBy",      width: 18 },
    { header: "Void Reason",         key: "voidReason",    width: 26 },
    { header: "Receipt Print Count", key: "printCount",    width: 18 },
    { header: "Payment Method",      key: "method",        width: 18 },
    { header: "Reference",           key: "reference",     width: 18 },
    { header: "Cash Tendered",       key: "cashTendered",  width: 16 },
    { header: "Change",              key: "changeAmount",  width: 14 },
    { header: "Base Item No.",       key: "baseItemNo",    width: 16 },
    { header: "Variant Code",        key: "variantCode",   width: 13 },
    { header: "Ref No.",             key: "itemId",        width: 18 },
    { header: "Product",             key: "product",       width: 34 },
    { header: "Promo Applied",       key: "promo",         width: 22 },
    { header: "Qty",                 key: "qty",           width: 8  },
    { header: "Unit Price",          key: "unitPrice",     width: 14 },
    { header: "Discount",            key: "discount",      width: 13 },
    { header: "Final Price",         key: "finalPrice",    width: 13 },
    { header: "Subtotal",            key: "subtotal",      width: 14 },
  ];
  setupSheet(s2, BRAND);

  function styleVoidRow(row: ExcelJS.Row) {
    row.getCell("status").font = { bold: true, color: { argb: VOID_RED } };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VOID_BG } };
    });
  }

  for (const txn of txnRows) {
    const lines = linesByTxn.get(txn.id) ?? [];
    const displayId = txn.displayId ?? txn.clientTxnId ?? String(txn.id);
    const printCount = printCountMap.get(txn.id) ?? 0;
    const posUser = txn.cashierNameDirect ?? txn.posUserName ?? "—";
    const statusLabel = describeTxnStatus(txn.voidOfTransactionId);
    const voided = isVoidEntryRow(txn.voidOfTransactionId);

    const baseTxnData = {
      date: d(txn.createdAt),
      displayId,
      clientTxnId: txn.clientTxnId ?? "—",
      posUser,
      status: statusLabel,
      voidedBy: txn.voidedBy ?? "—",
      voidReason: txn.voidReason ?? "—",
      printCount,
      method: txn.paymentMethod ?? "—",
      reference: txn.paymentReference ?? "—",
      cashTendered: txn.cashTendered ? n(txn.cashTendered) : 0,
      changeAmount: txn.changeAmount ? n(txn.changeAmount) : 0,
    };

    if (lines.length === 0) {
      const row = s2.addRow({
        ...baseTxnData,
        baseItemNo: "—",
        variantCode: "—",
        itemId: "—",
        product: "(no items)",
        promo: "—",
        qty: 0,
        unitPrice: 0,
        discount: 0,
        finalPrice: 0,
        subtotal: 0,
      });
      if (voided) styleVoidRow(row);
      continue;
    }

    for (const line of lines) {
      const meta = itemMetaMap.get(line.eventItemId);
      const row = s2.addRow({
        ...baseTxnData,
        baseItemNo:  meta?.baseItemNo ?? line.itemId ?? "—",
        itemId:      line.itemId ?? "—",
        variantCode: meta?.variantCode ?? "—",
        product:     line.productName ?? "—",
        promo:       line.promoApplied ?? "—",
        qty:         Number(line.quantity ?? 0),
        unitPrice:   n(line.unitPrice),
        discount:    n(line.discountAmt),
        finalPrice:  n(line.finalPrice),
        subtotal:    n(line.subtotal),
      });
      if (voided) styleVoidRow(row);
    }
  }
  moneyCols(s2, ["cashTendered", "changeAmount", "unitPrice", "discount", "finalPrice", "subtotal"]);

  // ══ Sheet 3 — Sales Summary ════════════════════════════════════════════════
  const s3 = workbook.addWorksheet("Sales Summary", { properties: { tabColor: { argb: GREEN } } });
  s3.columns = [
    { header: "Base Item No.",   key: "baseItemNo",   width: 16 },
    { header: "Variant Code",    key: "variantCode",  width: 13 },
    { header: "Reference No.",   key: "itemId",       width: 22 },
    { header: "Description",     key: "name",         width: 36 },
    { header: "Net Price",       key: "netPrice",     width: 14 },
    { header: "Total Item Lines",key: "itemLine",     width: 16 },
    { header: "Total Transfer In", key: "transferIn", width: 18 },
    { header: "Total Transfer Out", key: "transferOut", width: 18 },
    { header: "Adjusted Stock",  key: "adjustment",   width: 16 },
    { header: "Total Units Sold (Net)",key: "unitsSold", width: 20 },
    { header: "Voided Units",    key: "voidedUnits",  width: 15 },
    { header: "Remaining Stock", key: "remaining",    width: 16 },
    { header: "Gross Revenue",   key: "grossRevenue", width: 16 },
    { header: "Discounts Given", key: "discounts",    width: 16 },
    { header: "Net Revenue",     key: "netRevenue",   width: 16 },
    { header: "Avg Sell Price",  key: "avgPrice",     width: 15 },
  ];
  setupSheet(s3, GREEN);

  let totalGross = 0, totalDisc = 0, totalNet = 0, totalVoidedUnits = 0;
  for (const item of itemRows) {
    const s = salesMap.get(item.id) ?? { unitsSold: 0, grossRevenue: 0, netRevenue: 0, discount: 0 };
    const m = stockMap.get(item.id) ?? { transferIn: 0, transferOut: 0, sold: 0, adjustment: 0, voidRestocked: 0 };
    const voidedUnits = voidedUnitsMap.get(item.id) ?? 0;
    totalGross += s.grossRevenue;
    totalDisc  += s.discount;
    totalNet   += s.netRevenue;
    totalVoidedUnits += voidedUnits;
    s3.addRow({
      baseItemNo: item.baseItemNo ?? item.itemId,
      itemId: item.itemId,
      variantCode: item.variantCode ?? "",
      name: item.name,
      netPrice: n(item.netPrice),
      itemLine: 1,
      transferIn: m.transferIn,
      transferOut: m.transferOut,
      adjustment: m.adjustment,
      unitsSold: s.unitsSold,
      voidedUnits,
      remaining: item.stock,
      grossRevenue: s.grossRevenue,
      discounts: s.discount,
      netRevenue: s.netRevenue,
      avgPrice: s.unitsSold > 0 ? Math.round(s.netRevenue / s.unitsSold) : 0,
    });
  }
  const salesTotalRow = s3.addRow({
    name: `TOTAL — ${eventName}`,
    itemLine: itemRows.length,
    transferIn: totalTransferIn,
    transferOut: totalTransferOut,
    adjustment: totalAdjustment,
    unitsSold: totalUnitsSold,
    voidedUnits: totalVoidedUnits,
    remaining: totalRemaining,
    grossRevenue: totalGross,
    discounts: totalDisc,
    netRevenue: totalNet,
    avgPrice: totalUnitsSold > 0 ? Math.round(totalNet / totalUnitsSold) : 0,
  });
  addTotalStyle(salesTotalRow);
  moneyCols(s3, ["netPrice", "grossRevenue", "discounts", "netRevenue", "avgPrice"]);

  // ══ Sheet 4 — Cash Drawer Counts ═══════════════════════════════════════════
  const s4 = workbook.addWorksheet("Cash Drawer Counts", { properties: { tabColor: { argb: ORANGE } } });
  s4.columns = [
    { header: "Counted At",    key: "countedAt",    width: 20 },
    { header: "POS User",      key: "posUser",      width: 20 },
    { header: "Counted By",    key: "countedBy",    width: 20 },
    { header: "Reason",        key: "reason",       width: 18 },
    { header: "Expected Cash", key: "expectedCash", width: 16 },
    { header: "Actual Cash",   key: "actualCash",   width: 16 },
    { header: "Difference",    key: "difference",   width: 16 },
    { header: "Notes",         key: "notes",        width: 40 },
  ];
  setupSheet(s4, ORANGE);
  for (const row of drawerRows) {
    s4.addRow({
      countedAt: d(row.countedAt),
      posUser: row.posUserName ?? "—",
      countedBy: row.countedBy ?? "—",
      reason: row.reason ?? "—",
      expectedCash: n(row.expectedCash),
      actualCash: n(row.actualCash),
      difference: n(row.difference),
      notes: row.notes ?? "",
    });
  }
  if (drawerRows.length === 0) s4.addRow({ countedAt: "(no cash drawer counts recorded)" });
  moneyCols(s4, ["expectedCash", "actualCash", "difference"]);

  // ══ Sheet 5 — Event POS Users ══════════════════════════════════════════════
  const s5 = workbook.addWorksheet("Event POS Users", { properties: { tabColor: { argb: GRAY } } });
  s5.columns = [
    { header: "Name",       key: "name",      width: 24 },
    { header: "Username",   key: "username",  width: 24 },
    { header: "Role",       key: "role",      width: 16 },
    { header: "Status",     key: "status",    width: 12 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];
  setupSheet(s5, GRAY);
  for (const user of eventUserRows) {
    s5.addRow({
      name: user.name,
      username: user.username,
      role: user.role,
      status: user.isActive ? "Active" : "Inactive",
      createdAt: d(user.createdAt),
    });
  }
  if (eventUserRows.length === 0) s5.addRow({ name: "(no POS users assigned to this event)" });

  // ══ Sheet 6 — Stock Transactions ══════════════════════════════════════════
  const s6 = workbook.addWorksheet("Stock Transactions", { properties: { tabColor: { argb: GRAY } } });
  s6.columns = [
    { header: "Date",            key: "date",          width: 20 },
    { header: "Type",            key: "type",          width: 18 },
    { header: "Base Item No.",   key: "baseItemNo",    width: 16 },
    { header: "Variant Code",    key: "variantCode",   width: 13 },
    { header: "Reference No.",   key: "itemId",        width: 22 },
    { header: "Product",         key: "product",       width: 34 },
    { header: "Quantity",        key: "quantity",      width: 12 },
    { header: "Stock Before",    key: "stockBefore",   width: 14 },
    { header: "Stock After",     key: "stockAfter",    width: 14 },
    { header: "Transaction ID",  key: "transactionId", width: 18 },
    { header: "Reference Type",  key: "referenceType", width: 18 },
    { header: "Reference ID",    key: "referenceId",   width: 18 },
    { header: "Note",            key: "note",          width: 34 },
  ];
  setupSheet(s6, GRAY);
  const txnDisplayByDbId = new Map(txnRows.map(t => [t.id, t.displayId ?? t.clientTxnId ?? String(t.id)]));
  for (const row of stockTxRows) {
    const item = itemMetaMap.get(row.eventItemId);
    const excelRow = s6.addRow({
      date: d(row.createdAt),
      type: row.typeName ?? row.typeCode,
      baseItemNo: item?.baseItemNo ?? "",
      variantCode: item?.variantCode ?? "",
      itemId: item?.itemId ?? "",
      product: item?.name ?? "",
      quantity: n(row.quantity),
      stockBefore: n(row.stockBefore),
      stockAfter: n(row.stockAfter),
      transactionId: row.transactionId ? (txnDisplayByDbId.get(row.transactionId) ?? "") : "",
      referenceType: row.referenceType ?? "",
      referenceId: row.referenceId ?? "",
      note: row.note ?? "",
    });
    if (row.referenceType === "void") {
      excelRow.font = { color: { argb: VOID_RED } };
    }
  }

  // ══ Sheet 7 — Promotions ══════════════════════════════════════════════════
  const s7 = workbook.addWorksheet("Promotions", { properties: { tabColor: { argb: PURPLE } } });
  s7.columns = [
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
  setupSheet(s7, PURPLE);
  for (const promo of promoRows) {
    const appliedItems = promo.applyToAll
      ? [{ itemId: "(all)", name: "All Items" }]
      : ((promoItemsByPromo.get(promo.id) ?? []).length > 0
          ? (promoItemsByPromo.get(promo.id) ?? [])
          : [{ itemId: "—", name: "No selected item" }]);

    const tiers = (tiersByPromo.get(promo.id) ?? []).length > 0
      ? (tiersByPromo.get(promo.id) ?? [])
      : [{ minQty: null, discountPct: null, discountFix: null, fixedPrice: null } as any];

    for (const appliedItem of appliedItems) {
      for (const tier of tiers) {
        const tierParts: string[] = [];
        if (tier.minQty) tierParts.push(`≥${tier.minQty}`);
        if (tier.discountPct) tierParts.push(`${tier.discountPct}%`);
        if (tier.discountFix) tierParts.push(`fix ${n(tier.discountFix).toLocaleString("id-ID")}`);
        if (tier.fixedPrice) tierParts.push(`fixed ${n(tier.fixedPrice).toLocaleString("id-ID")}`);

        s7.addRow({
          name: promo.name,
          type: promo.type,
          active: promo.isActive ? "Yes" : "No",
          applyTo: promo.applyToAll ? "All Items" : "Selected",
          items: `${appliedItem.itemId ?? "—"} ${appliedItem.name ?? "—"}`.trim(),
          discPct:     promo.discountPct    ? n(promo.discountPct)    : 0,
          discFix:     promo.discountFix    ? n(promo.discountFix)    : 0,
          fixedPrice:  promo.fixedPrice     ? n(promo.fixedPrice)     : 0,
          buyQty:      promo.buyQty         ?? 0,
          freeQty:     promo.getFreeQty     ?? 0,
          bundlePrice: promo.bundlePrice    ? n(promo.bundlePrice)    : 0,
          minSpend:    promo.spendMinAmount ? n(promo.spendMinAmount) : 0,
          minPurchQty: promo.minPurchaseQty ?? 0,
          maxUsage:    promo.maxUsageCount  ?? "∞",
          usageCount:  promo.usageCount ?? 0,
          tiers:       tierParts.length > 0 ? tierParts.join(" → ") : "—",
          flashStart:  promo.flashStartTime ? d(promo.flashStartTime) : "—",
          flashEnd:    promo.flashEndTime   ? d(promo.flashEndTime)   : "—",
        });
      }
    }
  }
  if (promoRows.length === 0) s7.addRow({
    name: "(no promotions for this event)", type: "—", active: "—", applyTo: "—",
    items: "—", discPct: 0, discFix: 0, fixedPrice: 0, buyQty: 0, freeQty: 0,
    bundlePrice: 0, minSpend: 0, minPurchQty: 0, maxUsage: "—", usageCount: 0,
    tiers: "—", flashStart: "—", flashEnd: "—"
  });
  moneyCols(s7, ["discFix", "fixedPrice", "bundlePrice", "minSpend"]);

  // ══ Sheet 8 — Event Summary ═══════════════════════════════════════════════
  const s8 = workbook.addWorksheet("Event Summary", { properties: { tabColor: { argb: BRAND } } });
  s8.getColumn(1).width = 34;
  s8.getColumn(2).width = 24;

  function addKV(label: string, value: string | number, bold = false) {
    const row = s8.addRow([label, value]);
    if (bold) {
      row.font = { bold: true };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    }
    row.getCell(2).alignment = { horizontal: "right" };
    if (typeof value === "number") row.getCell(2).numFmt = "#,##0";
  }

  function addSection(title: string) {
    const row = s8.addRow([title]);
    row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    row.height = 20;
    s8.mergeCells(`A${row.number}:B${row.number}`);
  }

  s8.addRow([`Event Report — ${eventName}`]).font = { bold: true, size: 14 };
  s8.addRow([`Generated: ${new Date().toLocaleString("id-ID")}`]).font = { italic: true, color: { argb: "FF6B7280" } };
  s8.addRow([]);

  // Original (customer-facing) transactions — excludes the reversing void_entry
  // rows, since those aren't separate sales, just accounting reversals.
  const originalTxnRows = txnRows.filter(t => t.voidOfTransactionId == null);
  const completedTxnRows = originalTxnRows.filter(t => !t.voidedAt);
  const voidedTxnCount = originalTxnRows.filter(t => !!t.voidedAt).length;

  const totalFinal = txnRows.reduce((s, t) => s + n(t.finalAmount), 0);
  const totalTxnDisc  = txnRows.reduce((s, t) => s + n(t.discount), 0);
  const totalTxnGross = txnRows.reduce((s, t) => s + n(t.totalAmount), 0);
  const totalFinalCompleted = completedTxnRows.reduce((s, t) => s + n(t.finalAmount), 0);
  const totalPrints = [...printCountMap.values()].reduce((s, c) => s + c, 0);
  const totalCashExpected = drawerRows.reduce((s, r) => s + n(r.expectedCash), 0);
  const totalCashActual = drawerRows.reduce((s, r) => s + n(r.actualCash), 0);
  const latestDrawer = drawerRows[0];

  addSection("Event");
  addKV("Event Name", eventName);
  addKV("Status", eventRow?.status ?? "—");
  addKV("Location", eventRow?.location ?? "—");
  addKV("Start Date", eventRow?.startDate ? d(eventRow.startDate) : "—");
  addKV("End Date", eventRow?.endDate ? d(eventRow.endDate) : "—");
  s8.addRow([]);

  addSection("Transactions");
  addKV("Total Transactions", originalTxnRows.length);
  addKV("Voided Transactions", voidedTxnCount);
  addKV("Receipt Print Count", totalPrints);
  addKV("Gross Revenue (Rp)", totalTxnGross, true);
  addKV("Total Discounts (Rp)", totalTxnDisc);
  addKV("Net Revenue (Rp)", totalFinal, true);
  addKV("Avg per Transaction (all)", originalTxnRows.length > 0 ? Math.round(totalFinal / originalTxnRows.length) : 0);
  addKV("Avg per Completed Sale", completedTxnRows.length > 0 ? Math.round(totalFinalCompleted / completedTxnRows.length) : 0);
  s8.addRow([]);

  addSection("Stock");
  addKV("Total Item Lines", itemRows.length);
  addKV("Total Transfer In", totalTransferIn);
  addKV("Total Transfer Out", totalTransferOut);
  addKV("Adjusted Stock", totalAdjustment);
  addKV("Voided Units Restocked", totalVoidRestocked);
  addKV("Total Units Sold (Net)", totalUnitsSold, true);
  addKV("Remaining Stock", totalRemaining, true);
  s8.addRow([]);

  addSection("Cash Drawer");
  addKV("Drawer Counts", drawerRows.length);
  addKV("Latest Drawer Count", latestDrawer ? d(latestDrawer.countedAt) : "—");
  addKV("Latest Expected Cash", latestDrawer ? n(latestDrawer.expectedCash) : 0);
  addKV("Latest Actual Cash", latestDrawer ? n(latestDrawer.actualCash) : 0);
  addKV("Latest Difference", latestDrawer ? n(latestDrawer.difference) : 0, true);
  addKV("Total Expected Across Counts", totalCashExpected);
  addKV("Total Actual Across Counts", totalCashActual);
  s8.addRow([]);

  addSection("POS Users");
  addKV("Assigned POS Users", eventUserRows.length);
  addKV("Active POS Users", eventUserRows.filter(u => u.isActive).length);
  s8.addRow([]);

  addSection("Promotions");
  addKV("Active Promos", promoRows.filter(p => p.isActive).length);
  addKV("Total Promos", promoRows.length);
  s8.addRow([]);

  addSection("Payment Methods");
  const methodTotals = new Map<string, { count: number; total: number }>();
  for (const txn of txnRows) {
    const method = txn.paymentMethod ?? "Unknown";
    const cur = methodTotals.get(method) ?? { count: 0, total: 0 };
    // Only count original transactions toward "count" — the reversing
    // void_entry row shouldn't be counted as a second sale on this method.
    if (txn.voidOfTransactionId == null) cur.count++;
    // Totals sum across ALL rows including void_entry, since the negative
    // reversal is exactly what makes this net out to the correct figure.
    cur.total += n(txn.finalAmount);
    methodTotals.set(method, cur);
  }
  for (const [method, data] of methodTotals.entries()) addKV(`${method} (${data.count} txns)`, data.total);

  // Fill blank cells before styling so filters are easier to use.
  // Transaction-level fields are repeated per item line above; this pass also
  // prevents optional fields from becoming blank filter values.
  for (const sheet of workbook.worksheets) {
    const columnCount = sheet.columnCount;
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      for (let col = 1; col <= columnCount; col++) {
        const cell = row.getCell(col);
        if (cell.value === null || cell.value === undefined || cell.value === "") {
          cell.value = "—";
        }
      }
    });
  }

  // Apply borders, wrapping, alignment, and alternating row fills.
  // NOTE: void-related fills (styleVoidRow on Sheet 2, void rows on Sheet 6)
  // were already set above — this pass only fills cells that don't already
  // have a fill, so it won't overwrite the red void highlighting.
  for (const sheet of workbook.worksheets) {
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { ...(cell.alignment ?? {}), vertical: "middle", wrapText: true };
        cell.border = {
          top:    { style: "thin", color: { argb: "FFE5E7EB" } },
          left:   { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right:  { style: "thin", color: { argb: "FFE5E7EB" } },
        };
      });
      if (rowNumber > 1 && rowNumber % 2 === 0 && sheet.name !== "Event Summary") {
        row.eachCell((cell) => {
          if (!cell.fill || (cell.fill as any).type === undefined) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF8" } };
          }
        });
      }
    });
  }

  return toUint8Array(workbook);
}
