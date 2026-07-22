// lib/hooks/usePrintReceipt.ts
// Shared print receipt logic used by POS success overlay, POS history,
// and event transaction pages.
//
// Supports per-event receipt CMS/settings through EventReceiptTemplate.
// Supports re-print marker:
//   first print  -> no marker
//   second print -> RE-PRINTED #2
//   third print  -> RE-PRINTED #3

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
  baseItemNo?: string | null;
  productName: string;
  color?: string | null;
  variantCode?: string | null;
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

  /**
   * The number of the receipt print being generated.
   * 1 = original receipt, so no re-print marker is shown.
   * 2+ = shown as RE-PRINTED #2, RE-PRINTED #3, etc.
   */
  printNumber?: number | null;

  /**
   * How many physical copies to print for this one print action (e.g. a
   * customer copy + a merchant copy). All copies share the same
   * printNumber/content — this is not the same as a re-print, which is
   * tracked separately via printNumber. Defaults to 1.
   */
  copies?: number;
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

function normalizePrintNumber(value: unknown): number {
  const n = Math.trunc(Number(value ?? 1));
  return Number.isFinite(n) && n > 0 ? n : 1;
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

  const printNumber = normalizePrintNumber(options.printNumber);
  const isReprint = printNumber > 1;

  const storeName = template?.storeName || eventName || "RECEIPT";
  const headline = template?.headline ?? null;
  const footerText = template?.footerText ?? "Terima kasih!";

  const showEventName = template?.showEventName ?? true;
  const showCashierName = template?.showCashierName ?? true;
  const showItemSku = template?.showItemSku ?? true;
  const showPaymentReference = template?.showPaymentReference ?? true;
  const showDiscountBreakdown = template?.showDiscountBreakdown ?? true;

  const cashTendered =
    txn.cashTendered != null ? safeNumber(txn.cashTendered) : null;
  const changeAmount =
    txn.changeAmount != null ? safeNumber(txn.changeAmount) : null;

  const reprintBadge = isReprint
    ? `
      <div class="reprint-badge">
        RE-PRINTED #${escapeHtml(printNumber)}
      </div>
    `
    : "";

  let totalQty = 0;

  const lineRows = items
    .map((it) => {
      const qty = safeNumber(it.quantity);
      totalQty += qty;

      const unitPrice = safeNumber(it.unitPrice);
      const lineTotal = safeNumber(it.finalPrice) * qty;
      const lineDiscount = safeNumber(it.discountAmt) * qty;

      // "SKU-Variant" replaces the old bare item-ref line — uses the base
      // item no (falls back to the item ref if a base no isn't set) combined
      // with the variant code.
      const baseNo = it.baseItemNo || it.itemId || "";
      const skuVariant = it.variantCode
        ? `${baseNo}-${it.variantCode}`
        : baseNo;

      return `
      <tr>
        <td style="padding:4px 0;font-size:11px;vertical-align:top">
          <strong>${escapeHtml(it.productName)}</strong>${
            it.color
              ? ` <span style="font-size:10px;font-weight:600;color:#333">${escapeHtml(
                  it.color
                )}</span>`
              : ""
          }
          ${
            showItemSku && skuVariant
              ? `<br/><span style="font-size:9px;color:#333">${escapeHtml(
                  skuVariant
                )}</span>`
              : ""
          }
          ${
            it.promoApplied
              ? `<br/><em style="font-size:9px;color:#333">${escapeHtml(
                  it.promoApplied
                )}</em>`
              : ""
          }
          ${
            showDiscountBreakdown && lineDiscount > 0
              ? `<br/><span style="font-size:9px;font-weight:700;color:#16a34a">Disc ${formatRupiah(
                  lineDiscount
                )}</span>`
              : ""
          }
        </td>
        <td style="padding:4px 0;font-size:10px;color:#333;text-align:center;vertical-align:top;white-space:nowrap">
          ×${qty}
        </td>
        <td style="padding:4px 0;text-align:right;vertical-align:top;white-space:nowrap">
          <div style="font-size:9px;color:#333">${formatRupiah(unitPrice)}</div>
          <div style="font-size:11px;font-weight:700">${formatRupiah(lineTotal)}</div>
        </td>
      </tr>`;
    })
    .join("");

  const discRow =
    showDiscountBreakdown && disc > 0
      ? `
    <tr>
      <td colspan="2" style="font-size:10px;color:#333;padding-top:3px">Subtotal</td>
      <td style="text-align:right;font-size:10px;color:#333;padding-top:3px">${formatRupiah(
        subtotal
      )}</td>
    </tr>
    <tr>
      <td colspan="2" style="font-size:10px;font-weight:700;color:#16a34a">Diskon</td>
      <td style="text-align:right;font-size:10px;font-weight:700;color:#16a34a">-${formatRupiah(
        disc
      )}</td>
    </tr>`
      : "";

  const cashRows =
    cashTendered != null && cashTendered > 0
      ? `
    <tr>
      <td colspan="2" style="font-size:10px;color:#333;padding-top:5px">Tunai Diterima</td>
      <td style="text-align:right;font-size:10px;color:#333;padding-top:5px">${formatRupiah(
        cashTendered
      )}</td>
    </tr>
    <tr>
      <td colspan="2" style="font-size:11px;font-weight:700;color:#0369a1">Kembalian</td>
      <td style="text-align:right;font-size:11px;font-weight:700;color:#0369a1">${formatRupiah(
        changeAmount ?? 0
      )}</td>
    </tr>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt ${escapeHtml(txnNo)}</title>
  <style>
    *  { margin:0; padding:0; box-sizing:border-box; }
    body {
      /* Thermal print heads reproduce thin/serif strokes poorly at ~203dpi —
         a solid sans-serif at semi-bold weight registers far more reliably
         than Courier New's thin serifs did. */
      font-family: Arial, Helvetica, 'Segoe UI', sans-serif;
      font-weight: 600;
      width:300px;
      margin:0 auto;
      padding:16px 8px;
      color:#000;
    }
    .c  { text-align:center; }
    hr  { border:none; border-top:1px dashed #bbb; margin:8px 0; }
    table { width:100%; border-collapse:collapse; }
    img.logo {
      max-width:90px;
      max-height:60px;
      object-fit:contain;
      margin:0 auto 6px;
      display:block;
    }
    .reprint-badge {
      margin: 6px auto 0;
      display: inline-block;
      border: 1px dashed #111;
      padding: 2px 6px;
      font-size: 9px;
      font-weight: bold;
      letter-spacing: .5px;
      text-align: center;
    }
    @media print {
      @page { margin:4mm; }
      body { width:100%; }
    }
    ${template?.customCss ?? ""}
  </style>
</head>
<body>
  <div class="c" style="margin-bottom:8px">
    ${
      template?.logoUrl
        ? `<img class="logo" src="${escapeHtml(template.logoUrl)}"/>`
        : ""
    }
    <div style="font-size:15px;font-weight:700;letter-spacing:0.4px">${escapeHtml(
      storeName
    )}</div>
    ${
      headline
        ? `<div style="font-size:10px;color:#333;margin-top:2px">${escapeHtml(
            headline
          )}</div>`
        : ""
    }
    ${
      template?.address
        ? `<div style="font-size:9px;color:#333;margin-top:2px">${escapeHtml(
            template.address
          )}</div>`
        : ""
    }
    ${
      template?.phone
        ? `<div style="font-size:9px;color:#333;margin-top:1px">Telp: ${escapeHtml(
            template.phone
          )}</div>`
        : ""
    }
    ${
      template?.instagram
        ? `<div style="font-size:9px;color:#333;margin-top:1px">${escapeHtml(
            template.instagram
          )}</div>`
        : ""
    }
    ${
      template?.taxId
        ? `<div style="font-size:9px;color:#333;margin-top:1px">NPWP: ${escapeHtml(
            template.taxId
          )}</div>`
        : ""
    }
    ${reprintBadge}
  </div>

  <hr/>

  <table>
    <tbody>
      ${
        showEventName && eventName
          ? `<tr><td style="font-size:9px;color:#333">Event</td><td style="font-size:9px;text-align:right">${escapeHtml(
              eventName
            )}</td></tr>`
          : ""
      }
      <tr><td style="font-size:9px;color:#333">Tanggal</td><td style="font-size:9px;text-align:right">${escapeHtml(
        dateStr
      )}</td></tr>
      ${
        txnNo
          ? `<tr><td style="font-size:9px;color:#333">No</td><td style="font-size:9px;text-align:right">#${escapeHtml(
              txnNo
            )}</td></tr>`
          : ""
      }
      ${
        isReprint
          ? `<tr><td style="font-size:9px;color:#333">Status</td><td style="font-size:9px;text-align:right;font-weight:700">RE-PRINT #${escapeHtml(
              printNumber
            )}</td></tr>`
          : ""
      }
      ${
        showCashierName && cashierName
          ? `<tr><td style="font-size:9px;color:#333">Kasir</td><td style="font-size:9px;text-align:right">${escapeHtml(
              cashierName
            )}</td></tr>`
          : ""
      }
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
      <tr>
        <td colspan="2" style="font-size:10px;color:#333">Total Qty</td>
        <td style="text-align:right;font-size:10px;color:#333">${totalQty} <span style="text-transform:uppercase">pcs</span></td>
      </tr>
      ${discRow}
      <tr>
        <td colspan="2" style="font-size:13px;font-weight:700;padding-top:3px">TOTAL</td>
        <td style="text-align:right;font-size:13px;font-weight:700;padding-top:3px">${formatRupiah(
          total
        )}</td>
      </tr>
      <tr>
        <td colspan="2" style="font-size:10px;color:#333;padding-top:5px">Pembayaran</td>
        <td style="text-align:right;font-size:10px;color:#333;padding-top:5px">
          ${escapeHtml(txn.paymentMethod)}
          ${
            showPaymentReference && txn.paymentReference
              ? `<br/>${escapeHtml(txn.paymentReference)}`
              : ""
          }
        </td>
      </tr>
      ${cashRows}
    </tbody>
  </table>

  ${
    template?.promoMessage
      ? `<hr/><div class="c" style="font-size:10px;color:#000;margin-top:5px">${escapeHtml(
          template.promoMessage
        )}</div>`
      : ""
  }
  ${
    template?.returnPolicy
      ? `<hr/><div class="c" style="font-size:9px;color:#333;margin-top:5px">${escapeHtml(
          template.returnPolicy
        )}</div>`
      : ""
  }

  <hr/>
  <div class="c" style="font-size:10px;color:#333;margin-top:5px">${escapeHtml(
    footerText
  )}</div>
</body>
</html>`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

// Prints one copy from a hidden iframe on the current page instead of a
// popup window — nothing opens visibly. On a browser launched with the
// --kiosk-printing flag, window.print() from this frame goes straight to
// the OS default printer with no dialog at all; without that flag the
// browser still shows its normal print dialog (unavoidable from page JS —
// browsers block silent printing to an arbitrary printer for security
// reasons).
function printHtmlOnce(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDoc = frameWindow?.document;

    if (!frameWindow || !frameDoc) {
      iframe.remove();
      resolve();
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      setTimeout(() => {
        iframe.remove();
        resolve();
      }, 1200);
    }, 250);
  });
}

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
      const copies = Math.max(1, Math.trunc(options.copies ?? 1));

      // Copies print sequentially (not all at once) so back-to-back print
      // jobs don't collide at the physical printer.
      for (let i = 0; i < copies; i++) {
        await printHtmlOnce(html);
      }
    } finally {
      setTimeout(() => setPrinting(false), 400);
    }
  }

  return { printReceipt, printing };
}