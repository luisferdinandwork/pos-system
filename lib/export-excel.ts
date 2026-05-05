// lib/export-excel.ts
import ExcelJS from "exceljs";
import { getAllTransactions, getTransactionItems } from "@/lib/transactions";
import { getEventItems, bulkUpsertEventItems } from "@/lib/events";
import { formatDate } from "@/lib/utils";
import {
  getItemsWithStockForEvent,
  addStockTransaction,
} from "@/lib/stock";

async function toUint8Array(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  const ab = await workbook.xlsx.writeBuffer();
  return new Uint8Array(ab);
}

function styleHeader(sheet: ExcelJS.Worksheet, color = "FF1e104e") {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: color },
  };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 22;
}

function normalizeEventName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function eventNameMatches(importedName: unknown, expectedName?: string) {
  if (!expectedName) return true;

  const imported = normalizeEventName(importedName);
  const expected = normalizeEventName(expectedName);

  // Allow blank Event Name so old files/templates still import.
  if (!imported) return true;

  return imported === expected;
}

function cellText(value: ExcelJS.CellValue | undefined | null) {
  if (value === null || value === undefined) return "";

  if (typeof value === "object") {
    if ("text" in value && value.text) return String(value.text).trim();
    if ("result" in value && value.result !== undefined) {
      return String(value.result ?? "").trim();
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join("").trim();
    }
  }

  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue | undefined | null) {
  const raw = cellText(value).replace(/[^\d.-]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function safePositiveInt(value: ExcelJS.CellValue | undefined | null) {
  const n = Math.trunc(cellNumber(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ── Export: Transactions ──────────────────────────────────────────────────────
export async function buildTransactionExcel(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");

  sheet.columns = [
    { header: "Date", key: "date", width: 22 },
    { header: "Transaction ID", key: "txnId", width: 14 },
    { header: "Event ID", key: "eventId", width: 10 },
    { header: "Items", key: "items", width: 45 },
    { header: "Subtotal (Rp)", key: "subtotal", width: 16 },
    { header: "Discount (Rp)", key: "discount", width: 16 },
    { header: "Total (Rp)", key: "total", width: 16 },
    { header: "Payment Method", key: "method", width: 18 },
    { header: "Payment Reference", key: "reference", width: 24 },
  ];

  styleHeader(sheet);

  const txns = await getAllTransactions();

  for (const txn of txns) {
    const items = await getTransactionItems(txn.id);

    sheet.addRow({
      date: txn.createdAt ? formatDate(txn.createdAt) : "—",
      txnId: txn.id,
      eventId: txn.eventId,
      items: items.map((i) => `${i.productName} x${i.quantity}`).join(", "),
      subtotal: parseFloat(String(txn.totalAmount)),
      discount: parseFloat(String(txn.discount ?? 0)),
      total: parseFloat(String(txn.finalAmount)),
      method: txn.paymentMethod ?? "—",
      reference: txn.paymentReference ?? "—",
    });
  }

  ["subtotal", "discount", "total"].forEach((k) => {
    sheet.getColumn(k).numFmt = "#,##0";
  });

  return toUint8Array(workbook);
}

// ── Export: Event items ───────────────────────────────────────────────────────
export async function buildEventItemExcel(eventId: number): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  sheet.columns = [
    { header: "Item No.", key: "baseItemNo", width: 16 },
    { header: "Reference No.", key: "itemId", width: 20 },
    { header: "Variant Code", key: "variantCode", width: 14 },
    { header: "Unit of Measure", key: "unit", width: 16 },
    { header: "Description", key: "name", width: 36 },
    { header: "Description 2", key: "color", width: 36 },
    { header: "NET PRICE", key: "netPrice", width: 16 },
    { header: "Retail Price", key: "retailPrice", width: 16 },
    { header: "Stock", key: "stock", width: 12 },
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

// ── Export: Empty event item template ─────────────────────────────────────────
export async function buildEmptyEventItemTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Event Products");

  sheet.columns = [
    { header: "Item No.", key: "baseItemNo", width: 16 },
    { header: "Reference No.", key: "itemId", width: 22 },
    { header: "Variant Code", key: "variantCode", width: 14 },
    { header: "Unit of Measure", key: "unit", width: 16 },
    { header: "Description", key: "name", width: 36 },
    { header: "Description 2", key: "color", width: 36 },
    { header: "NET PRICE", key: "netPrice", width: 16 },
    { header: "Retail Price", key: "retailPrice", width: 16 },
    { header: "Stock", key: "stock", width: 12 },
  ];

  styleHeader(sheet);

  const exampleRow = sheet.addRow({
    baseItemNo: "SPE1040100",
    itemId: "SPE1040100370",
    variantCode: "370",
    unit: "PRS",
    name: "EXAMPLE PRODUCT",
    color: "WHITE/BLACK",
    netPrice: 500000,
    retailPrice: 700000,
    stock: 10,
  });

  exampleRow.font = { italic: true, color: { argb: "FF999999" } };

  sheet.getColumn("netPrice").numFmt = "#,##0";
  sheet.getColumn("retailPrice").numFmt = "#,##0";

  return toUint8Array(workbook);
}

// ── Import: Event items ───────────────────────────────────────────────────────
export async function importEventItemsFromExcel(
  data: Uint8Array,
  eventId: number
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const sheet = workbook.worksheets[0];

  const parsed: {
    itemId: string;
    baseItemNo: string;
    name: string;
    color: string;
    variantCode: string;
    unit: string;
    netPrice: string;
    retailPrice: string;
    stock: number;
  }[] = [];

  const parseErrors: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const baseItemNo = cellText(row.getCell(1).value);
    const itemId = cellText(row.getCell(2).value);
    const variantCode = cellText(row.getCell(3).value);
    const unit = cellText(row.getCell(4).value) || "PCS";
    const name = cellText(row.getCell(5).value);
    const color = cellText(row.getCell(6).value);
    const netPrice = cellNumber(row.getCell(7).value);
    const retailPrice = cellNumber(row.getCell(8).value);
    const stock = Math.trunc(cellNumber(row.getCell(9).value));

    if (!itemId || !name) return;

    if (!Number.isFinite(netPrice) || netPrice <= 0) {
      parseErrors.push(`Row ${rowNumber}: invalid net price for "${itemId}"`);
      return;
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
  });

  if (parsed.length === 0) {
    return {
      inserted: 0,
      updated: 0,
      errors: [...parseErrors, "No valid rows found in file"],
    };
  }

  const result = await bulkUpsertEventItems(eventId, parsed);

  return {
    inserted: result.inserted,
    updated: result.updated,
    errors: [...parseErrors, ...result.errors],
  };
}

// ── Export: Transfer In stock template ────────────────────────────────────────
export async function buildStockExcel(
  eventId: number,
  eventName?: string
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transfer In");

  sheet.columns = [
    { header: "Event Name", key: "eventName", width: 32 },
    { header: "Reference No.", key: "itemId", width: 22 },
    { header: "Description", key: "name", width: 36 },
    { header: "Variant Code", key: "variantCode", width: 14 },
    { header: "Current Stock", key: "currentStock", width: 16 },
    { header: "Transfer In Qty", key: "addQty", width: 18 },
    { header: "Note", key: "note", width: 28 },
  ];

  styleHeader(sheet, "FF452e5a");

  const items = await getEventItems(eventId);

  for (const item of items) {
    const row = sheet.addRow({
      eventName: eventName ?? "",
      itemId: item.itemId,
      name: item.name,
      variantCode: item.variantCode ?? "",
      currentStock: item.stock,
      addQty: "",
      note: "Transfer in",
    });

    row.getCell("addQty").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF3cd" },
    };
  }

  return toUint8Array(workbook);
}

// ── Import: Transfer In stock ─────────────────────────────────────────────────
export async function importStockFromExcel(
  data: Uint8Array,
  eventId: number,
  expectedEventName?: string
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return {
      processed: 0,
      skipped: 0,
      errors: ["No sheet found"],
    };
  }

  const items = await getItemsWithStockForEvent(eventId);
  const itemMap = new Map(items.map((item) => [item.itemId, item]));

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const eventName = row.getCell(1).value;
    const itemId = cellText(row.getCell(2).value);
    const qty = safePositiveInt(row.getCell(6).value);
    const note = cellText(row.getCell(7).value) || "Transfer in from Excel";

    if (!itemId) {
      skipped++;
      return;
    }

    if (!eventNameMatches(eventName, expectedEventName)) {
      errors.push(
        `Row ${rowNumber}: event name "${cellText(
          eventName
        )}" does not match "${expectedEventName}"`
      );
      return;
    }

    if (qty <= 0) {
      skipped++;
      return;
    }

    const item = itemMap.get(itemId);

    if (!item) {
      errors.push(`Row ${rowNumber}: item "${itemId}" not found in this event`);
      return;
    }

    addStockTransaction({
      eventItemId: item.id,
      typeCode: "transfer_in",
      quantity: Math.abs(qty),
      note,
      referenceType: "stock_import",
    })
      .then(() => {
        processed++;
      })
      .catch((error) => {
        errors.push(
          `Row ${rowNumber}: ${
            error instanceof Error ? error.message : "Failed to import stock"
          }`
        );
      });
  });

  // ExcelJS eachRow cannot await async callbacks cleanly.
  // Use manual loop instead below if you prefer stricter async flow.
  // This function returns after sync loop, so we use the manual implementation:
  return importStockFromExcelManual(data, eventId, expectedEventName);
}

async function importStockFromExcelManual(
  data: Uint8Array,
  eventId: number,
  expectedEventName?: string
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return {
      processed: 0,
      skipped: 0,
      errors: ["No sheet found"],
    };
  }

  const items = await getItemsWithStockForEvent(eventId);
  const itemMap = new Map(items.map((item) => [item.itemId, item]));

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);

    const eventName = row.getCell(1).value;
    const itemId = cellText(row.getCell(2).value);
    const qty = safePositiveInt(row.getCell(6).value);
    const note = cellText(row.getCell(7).value) || "Transfer in from Excel";

    if (!itemId) {
      skipped++;
      continue;
    }

    if (!eventNameMatches(eventName, expectedEventName)) {
      errors.push(
        `Row ${rowNumber}: event name "${cellText(
          eventName
        )}" does not match "${expectedEventName}"`
      );
      continue;
    }

    if (qty <= 0) {
      skipped++;
      continue;
    }

    const item = itemMap.get(itemId);

    if (!item) {
      errors.push(`Row ${rowNumber}: item "${itemId}" not found in this event`);
      continue;
    }

    try {
      await addStockTransaction({
        eventItemId: item.id,
        typeCode: "transfer_in",
        quantity: Math.abs(qty),
        note,
        referenceType: "stock_import",
      });

      processed++;
    } catch (error) {
      errors.push(
        `Row ${rowNumber}: ${
          error instanceof Error ? error.message : "Failed to import stock"
        }`
      );
    }
  }

  return { processed, skipped, errors };
}

// ── Export: Transfer Out stock template ───────────────────────────────────────
export async function buildTransferOutExcel(
  eventId: number,
  eventName?: string
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transfer Out");

  sheet.columns = [
    { header: "Event Name", key: "eventName", width: 32 },
    { header: "Reference No.", key: "itemId", width: 22 },
    { header: "Description", key: "name", width: 36 },
    { header: "Variant Code", key: "variantCode", width: 14 },
    { header: "Current Stock", key: "currentStock", width: 16 },
    { header: "Transfer Out Qty", key: "outQty", width: 18 },
    { header: "Note", key: "note", width: 28 },
  ];

  styleHeader(sheet, "FF7f1d1d");

  const items = await getEventItems(eventId);

  for (const item of items) {
    const row = sheet.addRow({
      eventName: eventName ?? "",
      itemId: item.itemId,
      name: item.name,
      variantCode: item.variantCode ?? "",
      currentStock: item.stock,
      outQty: "",
      note: "Transfer out",
    });

    row.getCell("outQty").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFE4E6" },
    };
  }

  return toUint8Array(workbook);
}

// ── Import: Transfer Out stock ────────────────────────────────────────────────
export async function importTransferOutFromExcel(
  data: Uint8Array,
  eventId: number,
  expectedEventName?: string
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return {
      processed: 0,
      skipped: 0,
      errors: ["No sheet found"],
    };
  }

  const items = await getItemsWithStockForEvent(eventId);
  const itemMap = new Map(items.map((item) => [item.itemId, item]));

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);

    const eventName = row.getCell(1).value;
    const itemId = cellText(row.getCell(2).value);
    const qty = safePositiveInt(row.getCell(6).value);
    const note = cellText(row.getCell(7).value) || "Transfer out from Excel";

    if (!itemId) {
      skipped++;
      continue;
    }

    if (!eventNameMatches(eventName, expectedEventName)) {
      errors.push(
        `Row ${rowNumber}: event name "${cellText(
          eventName
        )}" does not match "${expectedEventName}"`
      );
      continue;
    }

    if (qty <= 0) {
      skipped++;
      continue;
    }

    const item = itemMap.get(itemId);

    if (!item) {
      errors.push(`Row ${rowNumber}: item "${itemId}" not found in this event`);
      continue;
    }

    try {
      await addStockTransaction({
        eventItemId: item.id,
        typeCode: "transfer_out",
        quantity: -Math.abs(qty),
        note,
        referenceType: "transfer_out_import",
      });

      processed++;
    } catch (error) {
      errors.push(
        `Row ${rowNumber}: ${
          error instanceof Error
            ? error.message
            : "Failed to import transfer out"
        }`
      );
    }
  }

  return { processed, skipped, errors };
}