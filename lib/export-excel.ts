// lib/export-excel.ts
import ExcelJS from "exceljs";
import { getAllTransactions, getTransactionItems } from "@/lib/transactions";
import { getEventItems, bulkUpsertEventItems }     from "@/lib/events";
import { formatDate }                              from "@/lib/utils";

async function toUint8Array(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  const ab = await workbook.xlsx.writeBuffer();
  return new Uint8Array(ab);
}

function styleHeader(sheet: ExcelJS.Worksheet, color = "FF1e104e") {
  const row     = sheet.getRow(1);
  row.font      = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height    = 22;
}

// ── Export: Transactions ──────────────────────────────────────────────────────
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
      items:     items.map((i) => `${i.productName} x${i.quantity}`).join(", "),
      subtotal:  parseFloat(String(txn.totalAmount)),
      discount:  parseFloat(String(txn.discount  ?? 0)),
      total:     parseFloat(String(txn.finalAmount)),
      method:    txn.paymentMethod    ?? "—",
      reference: txn.paymentReference ?? "—",
    });
  }

  ["subtotal", "discount", "total"].forEach(
    (k) => (sheet.getColumn(k).numFmt = "#,##0")
  );

  return toUint8Array(workbook);
}

// ── Export: Event items for a specific event (matches UPLOAD_BAZAR_PRICE template) ──
export async function buildEventItemExcel(eventId: number): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet("Sheet1");

  sheet.columns = [
    { header: "Item No.",        key: "baseItemNo",   width: 16 },
    { header: "Reference No.",   key: "itemId",       width: 20 },
    { header: "Variant Code",    key: "variantCode",  width: 14 },
    { header: "Unit of Measure", key: "unit",         width: 16 },
    { header: "Description",     key: "name",         width: 36 },
    { header: "Description 2",   key: "color",        width: 36 },
    { header: "NET PRICE",       key: "netPrice",     width: 16 },
    { header: "Retail Price",    key: "retailPrice",  width: 16 },
    { header: "Stock",           key: "stock",        width: 12 },
  ];
  styleHeader(sheet);

  const items = await getEventItems(eventId);
  for (const item of items) {
    sheet.addRow({
      baseItemNo:  item.baseItemNo  ?? item.itemId,
      itemId:      item.itemId,
      variantCode: item.variantCode ?? "",
      unit:        item.unit        ?? "PCS",
      name:        item.name,
      color:       item.color       ?? "",
      netPrice:    parseFloat(String(item.netPrice)),
      retailPrice: parseFloat(String(item.retailPrice)),
      stock:       item.stock,
    });
  }

  sheet.getColumn("netPrice").numFmt    = "#,##0";
  sheet.getColumn("retailPrice").numFmt = "#,##0";

  return toUint8Array(workbook);
}

// ── Export: Stock template for an event ──────────────────────────────────────
export async function buildStockExcel(eventId: number): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet("Stock");

  sheet.columns = [
    { header: "Reference No.",  key: "itemId",       width: 22 },
    { header: "Description",    key: "name",         width: 36 },
    { header: "Variant Code",   key: "variantCode",  width: 14 },
    { header: "Current Stock",  key: "currentStock", width: 16 },
    { header: "Add Quantity",   key: "addQty",       width: 16 },
    { header: "Note",           key: "note",         width: 28 },
  ];
  styleHeader(sheet, "FF452e5a");

  const items = await getEventItems(eventId);
  for (const item of items) {
    const row = sheet.addRow({
      itemId:       item.itemId,
      name:         item.name,
      variantCode:  item.variantCode ?? "",
      currentStock: item.stock,
      addQty:       0,
      note:         "Restock",
    });
    row.getCell("addQty").fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: "FFFFF3cd" },
    };
  }

  return toUint8Array(workbook);
}

// ── Export: Empty template (no event — just headers + example row) ────────────
export async function buildEmptyEventItemTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet("Event Products");

  sheet.columns = [
    { header: "Item No.",        key: "baseItemNo",   width: 16 },
    { header: "Reference No.",   key: "itemId",       width: 22 },
    { header: "Variant Code",    key: "variantCode",  width: 14 },
    { header: "Unit of Measure", key: "unit",         width: 16 },
    { header: "Description",     key: "name",         width: 36 },
    { header: "Description 2",   key: "color",        width: 36 },
    { header: "NET PRICE",       key: "netPrice",     width: 16 },
    { header: "Retail Price",    key: "retailPrice",  width: 16 },
    { header: "Stock",           key: "stock",        width: 12 },
  ];
  styleHeader(sheet);

  const exampleRow = sheet.addRow({
    baseItemNo: "SPE1040100",  itemId: "SPE1040100370",
    variantCode: "370",        unit: "PRS",
    name: "EXAMPLE PRODUCT",  color: "WHITE/BLACK",
    netPrice: 500000,          retailPrice: 700000, stock: 10,
  });
  exampleRow.font = { italic: true, color: { argb: "FF999999" } };

  sheet.getColumn("netPrice").numFmt    = "#,##0";
  sheet.getColumn("retailPrice").numFmt = "#,##0";

  return toUint8Array(workbook);
}

// ── Import: Items from Excel into an event ────────────────────────────────────
// Column layout (matches buildEventItemExcel / UPLOAD_BAZAR_PRICE template):
//   A(1) = Item No.       → baseItemNo
//   B(2) = Reference No.  → itemId        ← primary key for matching
//   C(3) = Variant Code
//   D(4) = Unit of Measure
//   E(5) = Description    → name
//   F(6) = Description 2  → color
//   G(7) = NET PRICE      → netPrice
//   H(8) = Retail Price   → retailPrice
//   I(9) = Stock          → stock
export async function importEventItemsFromExcel(
  data:    Uint8Array,
  eventId: number
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];

  const parsed: {
    itemId:      string;
    baseItemNo:  string;
    name:        string;
    color:       string;
    variantCode: string;
    unit:        string;
    netPrice:    string;
    retailPrice: string;
    stock:       number;
  }[] = [];

  const parseErrors: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const baseItemNo  = String(row.getCell(1).value ?? "").trim();
    const itemId      = String(row.getCell(2).value ?? "").trim();
    const variantCode = String(row.getCell(3).value ?? "").trim();
    const unit        = String(row.getCell(4).value ?? "PCS").trim();
    const name        = String(row.getCell(5).value ?? "").trim();
    const color       = String(row.getCell(6).value ?? "").trim();
    const netVal      = row.getCell(7).value;
    const retailVal   = row.getCell(8).value;
    const stockVal    = row.getCell(9).value;

    if (!itemId || !name) return; // skip blank rows

    const netPrice    = parseFloat(String(netVal    ?? "0"));
    const retailPrice = parseFloat(String(retailVal ?? "0"));
    const stock       = parseInt(String(stockVal    ?? "0"), 10);

    if (isNaN(netPrice) || netPrice <= 0) {
      parseErrors.push(`Row ${rowNumber}: invalid net price for "${itemId}"`);
      return;
    }

    parsed.push({
      baseItemNo:  baseItemNo  || itemId,
      itemId,
      variantCode,
      unit:        unit || "PCS",
      name,
      color,
      netPrice:    String(netPrice),
      retailPrice: String(!isNaN(retailPrice) && retailPrice > 0 ? retailPrice : netPrice),
      stock:       !isNaN(stock) && stock > 0 ? stock : 0,
    });
  });

  if (parsed.length === 0) {
    return {
      inserted: 0,
      updated:  0,
      errors:   [...parseErrors, "No valid rows found in file"],
    };
  }

  const result = await bulkUpsertEventItems(eventId, parsed);
  return {
    inserted: result.inserted,
    updated:  result.updated,
    errors:   [...parseErrors, ...result.errors],
  };
}

// ── Import: Stock adjustments from stock template ─────────────────────────────
// Column layout:
//   A(1) = Reference No.  → itemId
//   B(2) = Description
//   C(3) = Variant Code
//   D(4) = Current Stock  (read-only reference — ignored)
//   E(5) = Add Quantity   → addQty
//   F(6) = Note
export async function importStockFromExcel(
  data:    Uint8Array,
  eventId: number
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];

  const { getEventItemByItemId } = await import("@/lib/events");
  const { addStockEntry }        = await import("@/lib/stock");

  let processed = 0, skipped = 0;
  const errors: string[] = [];

  for (let i = 2; i <= (sheet.lastRow?.number ?? 1); i++) {
    const row = sheet.getRow(i);

    const itemId = String(row.getCell(1).value ?? "").trim();
    const addQty = parseInt(String(row.getCell(5).value ?? "0"), 10);
    const note   = String(row.getCell(6).value ?? "Restock via import").trim();

    if (!itemId) continue;
    if (isNaN(addQty) || addQty <= 0) { skipped++; continue; }

    try {
      const item = await getEventItemByItemId(eventId, itemId);
      if (!item) {
        errors.push(`Row ${i}: item "${itemId}" not found in this event`);
        continue;
      }
      await addStockEntry(item.id, addQty, note, "import");
      processed++;
    } catch (e) {
      errors.push(`Row ${i}: ${String(e)}`);
    }
  }

  return { processed, skipped, errors };
}