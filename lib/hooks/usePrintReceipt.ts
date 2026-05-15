// lib/hooks/usePrintReceipt.ts
// Shared print receipt logic used by POS success overlay, POS history,
// and event transaction pages.
//
// Supports per-event receipt CMS/settings through EventReceiptTemplate.

import { useState } from "react";
import { formatRupiah, formatDate } from "@/lib/utils";

export type EventReceiptTemplate = {
  isActive?: boolean;
  storeName?: string | null;
  headline?: string | null;
  address?: string | null;
  phone?: string | null;
  instagram?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
  footerText?: string | null;
  returnPolicy?: string | null;
  promoMessage?: string | null;
  showEventName?: boolean;
  showCashierName?: boolean;
  showItemSku?: boolean;
  showPaymentReference?: boolean;
  showDiscountBreakdown?: boolean;
  customCss?: string | null;
};

export type PrintTxn = {
  id?: number;
  displayId?: string | null;
  clientTxnId?: string | null;
  eventId?: number | null;
  eventName?: string | null;
  cashierName?: string | null;
  totalAmount: string;
  discount: string;
  finalAmount: string;
  paymentMethod: string;
  paymentReference?: string | null;
  cashTendered?: string | number | null;
  changeAmount?: string | number | null;
  createdAt: string;
};

export type PrintTxnItem = {
  itemId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: string;
  discountAmt: string;
  finalPrice: string;
  subtotal: string;
  promoApplied?: string | null;
};

export type PrintReceiptOptions = {
  template?: EventReceiptTemplate | null;
  eventName?: string | null;
  cashierName?: string | null;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function receiptId(txn: PrintTxn) {
  return (txn.displayId || txn.clientTxnId || txn.id || "").toString();
}

// ── Receipt HTML builder ──────────────────────────────────────────────────────

export function buildReceiptHtml(
  txn: PrintTxn,
  items: PrintTxnItem[],
  options: PrintReceiptOptions = {}
): string {
  const template = options.template?.isActive === false ? null : options.template;

  const total = safeNumber(txn.finalAmount);
  const disc = safeNumber(txn.discount);
  const subtotal = safeNumber(txn.totalAmount);
  const dateStr = formatDate(txn.createdAt);
  const txnNo = receiptId(txn);
  const eventName = options.eventName ?? txn.eventName ?? null;
  const cashierName = options.cashierName ?? txn.cashierName ?? null;

  const storeName = template?.storeName || eventName || "RECEIPT";
  const headline = template?.headline ?? null;
  const footerText = template?.footerText ?? "Terima kasih!";

  const showEventName = template?.showEventName ?? true;
  const showCashierName = template?.showCashierName ?? true;
  const showItemSku = template?.showItemSku ?? true;
  const showPaymentReference = template?.showPaymentReference ?? true;
  const showDiscountBreakdown = template?.showDiscountBreakdown ?? true;

  const cashTendered = txn.cashTendered != null ? safeNumber(txn.cashTendered) : null;
  const changeAmount = txn.changeAmount != null ? safeNumber(txn.changeAmount) : null;

  const lineRows = items
    .map((it) => {
      const lineTotal = safeNumber(it.finalPrice) * safeNumber(it.quantity);
      const lineDiscount = safeNumber(it.discountAmt) * safeNumber(it.quantity);
      return `
      <tr>
        <td style="padding:5px 0;font-size:12px;vertical-align:top">
          <strong>${escapeHtml(it.productName)}</strong>
          ${showItemSku && it.itemId ? `<br/><span style="font-size:10px;color:#777">${escapeHtml(it.itemId)}</span>` : ""}
          ${it.promoApplied ? `<br/><em style="font-size:10px;color:#777">${escapeHtml(it.promoApplied)}</em>` : ""}
          ${showDiscountBreakdown && lineDiscount > 0 ? `<br/><span style="font-size:10px;color:#16a34a">Disc ${formatRupiah(lineDiscount)}</span>` : ""}
        </td>
        <td style="padding:5px 0;font-size:11px;color:#666;text-align:center;vertical-align:top;white-space:nowrap">
          ×${safeNumber(it.quantity)}
        </td>
        <td style="padding:5px 0;font-size:12px;text-align:right;vertical-align:top;white-space:nowrap">
          ${formatRupiah(lineTotal)}
        </td>
      </tr>`;
    })
    .join("");

  const discRow =
    showDiscountBreakdown && disc > 0
      ? `
    <tr>
      <td colspan="2" style="font-size:12px;color:#555;padding-top:4px">Subtotal</td>
      <td style="text-align:right;font-size:12px;color:#555;padding-top:4px">${formatRupiah(subtotal)}</td>
    </tr>
    <tr>
      <td colspan="2" style="font-size:12px;color:#16a34a">Diskon</td>
      <td style="text-align:right;font-size:12px;color:#16a34a">-${formatRupiah(disc)}</td>
    </tr>`
      : "";

  const cashRows =
    cashTendered != null && cashTendered > 0
      ? `
    <tr>
      <td colspan="2" style="font-size:11px;color:#555;padding-top:6px">Tunai Diterima</td>
      <td style="text-align:right;font-size:11px;color:#555;padding-top:6px">${formatRupiah(cashTendered)}</td>
    </tr>
    <tr>
      <td colspan="2" style="font-size:12px;font-weight:bold;color:#0369a1">Kembalian</td>
      <td style="text-align:right;font-size:12px;font-weight:bold;color:#0369a1">${formatRupiah(changeAmount ?? 0)}</td>
    </tr>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt ${escapeHtml(txnNo)}</title>
  <style>
    *  { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Courier New',Courier,monospace; width:300px; margin:0 auto; padding:16px 8px; color:#111; }
    .c  { text-align:center; }
    hr  { border:none; border-top:1px dashed #bbb; margin:8px 0; }
    table { width:100%; border-collapse:collapse; }
    img.logo { max-width:90px; max-height:60px; object-fit:contain; margin:0 auto 6px; display:block; }
    @media print { @page { margin:4mm; } body { width:100%; } }
    ${template?.customCss ?? ""}
  </style>
</head>
<body>
  <div class="c" style="margin-bottom:8px">
    ${template?.logoUrl ? `<img class="logo" src="${escapeHtml(template.logoUrl)}"/>` : ""}
    <div style="font-size:17px;font-weight:bold;letter-spacing:1px">${escapeHtml(storeName)}</div>
    ${headline ? `<div style="font-size:11px;color:#555;margin-top:2px">${escapeHtml(headline)}</div>` : ""}
    ${template?.address ? `<div style="font-size:10px;color:#666;margin-top:2px">${escapeHtml(template.address)}</div>` : ""}
    ${template?.phone ? `<div style="font-size:10px;color:#666;margin-top:1px">Telp: ${escapeHtml(template.phone)}</div>` : ""}
    ${template?.instagram ? `<div style="font-size:10px;color:#666;margin-top:1px">${escapeHtml(template.instagram)}</div>` : ""}
    ${template?.taxId ? `<div style="font-size:10px;color:#666;margin-top:1px">NPWP: ${escapeHtml(template.taxId)}</div>` : ""}
  </div>

  <hr/>

  <table>
    <tbody>
      ${showEventName && eventName ? `<tr><td style="font-size:10px;color:#666">Event</td><td style="font-size:10px;text-align:right">${escapeHtml(eventName)}</td></tr>` : ""}
      <tr><td style="font-size:10px;color:#666">Tanggal</td><td style="font-size:10px;text-align:right">${escapeHtml(dateStr)}</td></tr>
      ${txnNo ? `<tr><td style="font-size:10px;color:#666">No</td><td style="font-size:10px;text-align:right">#${escapeHtml(txnNo)}</td></tr>` : ""}
      ${showCashierName && cashierName ? `<tr><td style="font-size:10px;color:#666">Kasir</td><td style="font-size:10px;text-align:right">${escapeHtml(cashierName)}</td></tr>` : ""}
    </tbody>
  </table>

  <hr/>

  <table>
    <colgroup>
      <col style="width:58%"/>
      <col style="width:12%"/>
      <col style="width:30%"/>
    </colgroup>
    <tbody>${lineRows}</tbody>
  </table>

  <hr/>

  <table>
    <tbody>
      ${discRow}
      <tr>
        <td colspan="2" style="font-size:14px;font-weight:bold;padding-top:4px">TOTAL</td>
        <td style="text-align:right;font-size:14px;font-weight:bold;padding-top:4px">${formatRupiah(total)}</td>
      </tr>
      <tr>
        <td colspan="2" style="font-size:11px;color:#666;padding-top:6px">Pembayaran</td>
        <td style="text-align:right;font-size:11px;color:#666;padding-top:6px">
          ${escapeHtml(txn.paymentMethod)}
          ${showPaymentReference && txn.paymentReference ? `<br/>${escapeHtml(txn.paymentReference)}` : ""}
        </td>
      </tr>
      ${cashRows}
    </tbody>
  </table>

  ${template?.promoMessage ? `<hr/><div class="c" style="font-size:11px;color:#111;margin-top:6px">${escapeHtml(template.promoMessage)}</div>` : ""}
  ${template?.returnPolicy ? `<hr/><div class="c" style="font-size:10px;color:#777;margin-top:6px">${escapeHtml(template.returnPolicy)}</div>` : ""}

  <hr/>
  <div class="c" style="font-size:11px;color:#777;margin-top:6px">${escapeHtml(footerText)}</div>
</body>
</html>`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePrintReceipt() {
  const [printing, setPrinting] = useState(false);

  async function printReceipt(
    txn: PrintTxn,
    items: PrintTxnItem[],
    options: PrintReceiptOptions = {}
  ) {
    if (printing) return;

    setPrinting(true);

    try {
      const html = buildReceiptHtml(txn, items, options);
      const printWindow = window.open("", "_blank", "width=380,height=640");

      if (!printWindow) {
        throw new Error("Could not open print window. Please allow popups.");
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();

      setTimeout(() => {
        printWindow.print();
      }, 250);
    } finally {
      setTimeout(() => setPrinting(false), 400);
    }
  }

  return { printReceipt, printing };
}
