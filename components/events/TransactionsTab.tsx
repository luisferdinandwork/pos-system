// components/events/TransactionsTab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";
import { formatDate, formatRupiah } from "@/lib/utils";
import {
  usePrintReceipt,
  type PrintTxn,
  type PrintTxnItem,
  type EventReceiptTemplate,
} from "@/lib/hooks/usePrintReceipt";
import {
  incrementCloudReceiptPrintCount,
  fetchEventReceiptPrintCounts,
} from "@/lib/receipt-print-counts";

type Transaction = {
  id: number;
  displayId?: string | null;
  eventId: number;
  clientTxnId?: string | null;
  cashierSessionId?: number | null;
  cashierName?: string | null;
  totalAmount: string;
  discount: string;
  finalAmount: string;
  cashTendered?: string | null;
  changeAmount?: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  createdAt: string | null;
  status?: string | null;
  voidOfTransactionId?: number | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
};

type TransactionItem = {
  id?: number;
  transactionId?: number;
  eventItemId: number;
  itemId: string;
  baseItemNo?: string | null;
  productName: string;
  color?: string | null;
  variantCode?: string | null;
  quantity: number;
  unitPrice: string;
  discountAmt: string;
  finalPrice: string;
  subtotal: string;
  promoApplied: string | null;
};

type Props = {
  eventId: number;
  transactions: Transaction[];
  receiptTemplate?: EventReceiptTemplate | null;
  eventName?: string | null;
  onRefresh?: () => void | Promise<void>;
};

const money = (value: string | number | null | undefined) =>
  formatRupiah(value ?? 0);

export function TransactionsTab({
  eventId,
  transactions,
  receiptTemplate,
  eventName,
  onRefresh,
}: Props) {
  const [expandedTxn, setExpandedTxn] = useState<number | null>(null);
  const [txnItems, setTxnItems] = useState<Record<number, TransactionItem[]>>(
    {}
  );
  const [loadingItems, setLoadingItems] = useState<number | null>(null);
  const [printCounts, setPrintCounts] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");

  const [localReceiptTemplate, setLocalReceiptTemplate] =
    useState<EventReceiptTemplate | null>(receiptTemplate ?? null);

  const { printReceipt, printing } = usePrintReceipt();

  const resolvedReceiptTemplate = receiptTemplate ?? localReceiptTemplate;

  // ── Void state ──────────────────────────────────────────────────────────
  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidedBy, setVoidedBy] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  async function loadPrintCounts() {
    try {
      const counts = await fetchEventReceiptPrintCounts(eventId);
      setPrintCounts(counts);
    } catch {
      setPrintCounts({});
    }
  }

  async function loadReceiptTemplate() {
    try {
      const response = await fetch(`/api/events/${eventId}/receipt-template`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      setLocalReceiptTemplate(response.ok ? data : null);
    } catch {
      setLocalReceiptTemplate(null);
    }
  }

  useEffect(() => {
    loadPrintCounts();
  }, [eventId, transactions.length]);

  useEffect(() => {
    if (receiptTemplate !== undefined) {
      setLocalReceiptTemplate(receiptTemplate ?? null);
      return;
    }

    loadReceiptTemplate();
  }, [eventId, receiptTemplate]);

  async function loadTxnItems(txnId: number) {
    if (txnItems[txnId]) {
      setExpandedTxn(expandedTxn === txnId ? null : txnId);
      return txnItems[txnId];
    }

    setLoadingItems(txnId);

    try {
      const response = await fetch(`/api/transactions/${txnId}/items`, {
        cache: "no-store",
      });

      if (!response.ok) return [];

      const data = await response.json();
      const items = Array.isArray(data) ? data : [];

      setTxnItems((prev) => ({
        ...prev,
        [txnId]: items,
      }));

      setExpandedTxn(txnId);

      return items;
    } finally {
      setLoadingItems(null);
    }
  }

  async function getTemplateForPrint() {
    if (resolvedReceiptTemplate) {
      return resolvedReceiptTemplate;
    }

    try {
      const response = await fetch(`/api/events/${eventId}/receipt-template`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data) {
        setLocalReceiptTemplate(data);
        return data as EventReceiptTemplate;
      }
    } catch {
      // Keep fallback behavior if template route fails.
    }

    return null;
  }

  async function handlePrint(txn: Transaction) {
    const items = await loadTxnItems(txn.id);

    const currentCount = Number(printCounts[txn.id] ?? 0);
    const nextPrintNumber = currentCount + 1;

    const templateForPrint = await getTemplateForPrint();

    const txnForPrint: PrintTxn = {
      id: txn.id,
      displayId: txn.displayId ?? null,
      clientTxnId: txn.clientTxnId ?? null,
      eventId: txn.eventId,
      eventName: eventName ?? null,
      cashierName: txn.cashierName ?? null,
      totalAmount: String(txn.totalAmount ?? 0),
      discount: String(txn.discount ?? 0),
      finalAmount: String(txn.finalAmount ?? 0),
      paymentMethod: txn.paymentMethod ?? "—",
      paymentReference: txn.paymentReference ?? null,
      cashTendered: txn.cashTendered ?? null,
      changeAmount: txn.changeAmount ?? null,
      createdAt: txn.createdAt ?? new Date().toISOString(),
    };

    const itemsForPrint: PrintTxnItem[] = items.map((item) => ({
      itemId: item.itemId,
      baseItemNo: item.baseItemNo,
      productName: item.productName,
      color: item.color,
      variantCode: item.variantCode,
      quantity: Number(item.quantity),
      unitPrice: String(item.unitPrice),
      discountAmt: String(item.discountAmt),
      finalPrice: String(item.finalPrice),
      subtotal: String(item.subtotal),
      promoApplied: item.promoApplied,
    }));

    await printReceipt(txnForPrint, itemsForPrint, {
      template: templateForPrint,
      eventName: eventName ?? null,
      cashierName: txn.cashierName ?? null,
      printNumber: nextPrintNumber,
    });

    const result = await incrementCloudReceiptPrintCount(txn.id);
    const nextCount = result.receiptPrintCount;

    setPrintCounts((prev) => ({
      ...prev,
      [txn.id]: nextCount,
    }));

    await onRefresh?.();
  }

  // ── Void handlers ───────────────────────────────────────────────────────
  function openVoidModal(txn: Transaction) {
    setVoidTarget(txn);
    setVoidReason("");
    setVoidedBy("");
    setVoidError(null);
  }

  async function confirmVoid() {
    if (!voidTarget) return;

    setVoiding(true);
    setVoidError(null);

    try {
      const response = await fetch(`/api/transactions/${voidTarget.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voidedBy: voidedBy.trim() || null,
          voidReason: voidReason.trim() || null,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to void transaction.");
      }

      setVoidTarget(null);
      await onRefresh?.();
    } catch (error) {
      setVoidError(error instanceof Error ? error.message : "Failed to void transaction.");
    } finally {
      setVoiding(false);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return transactions;

    return transactions.filter(
      (txn) =>
        String(txn.displayId ?? "").toLowerCase().includes(query) ||
        String(txn.clientTxnId ?? "").toLowerCase().includes(query) ||
        String(txn.paymentMethod ?? "").toLowerCase().includes(query) ||
        String(txn.paymentReference ?? "").toLowerCase().includes(query) ||
        String(txn.cashierName ?? "").toLowerCase().includes(query)
    );
  }, [transactions, search]);

  const totalRevenue = filtered.reduce(
    (sum, txn) => sum + Number(txn.finalAmount),
    0
  );

  const C = {
    border: "var(--border)",
    muted: "var(--muted)",
    mutedFg: "var(--muted-foreground)",
    fg: "var(--foreground)",
    orange: "var(--brand-orange)",
    card: "var(--card)",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: C.mutedFg }}
          />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ID, payment, cashier…"
            className="w-full rounded-xl border pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
            style={{
              borderColor: C.border,
              color: C.fg,
              background: C.card,
            }}
          />

          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ color: C.mutedFg }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {filtered.length > 0 && (
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl border flex-shrink-0"
            style={{
              borderColor: C.border,
              background: C.card,
            }}
          >
            <span className="text-xs" style={{ color: C.mutedFg }}>
              {filtered.length} txns
            </span>

            <span className="text-xs font-black" style={{ color: C.orange }}>
              {money(totalRevenue)}
            </span>
          </div>
        )}

        <button
          onClick={() => {
            loadPrintCounts();
            loadReceiptTemplate();
            onRefresh?.();
          }}
          className="p-2.5 rounded-xl border transition-all hover:bg-black/5"
          style={{
            borderColor: C.border,
            color: C.mutedFg,
          }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: C.card,
          borderColor: C.border,
        }}
      >
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt
              size={28}
              className="mx-auto mb-2 opacity-20"
              style={{ color: C.mutedFg }}
            />
            <p className="text-sm" style={{ color: C.mutedFg }}>
              No transactions found.
            </p>
          </div>
        ) : (
          <div>
            <div
              className="hidden sm:grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest"
              style={{
                gridTemplateColumns: "1.2fr 1fr 1fr 120px 36px 36px",
                background: C.muted,
                borderBottom: `1px solid ${C.border}`,
                color: C.mutedFg,
              }}
            >
              <div>Transaction</div>
              <div>Method</div>
              <div>Cashier</div>
              <div className="text-right">Amount</div>
              <div />
              <div />
            </div>

            {filtered.map((txn, index) => {
              const isExpanded = expandedTxn === txn.id;
              const isLoadingIt = loadingItems === txn.id;
              const lines = txnItems[txn.id] ?? [];
              const printCount = printCounts[txn.id] ?? 0;
              const displayId = txn.displayId ?? txn.clientTxnId ?? `#${txn.id}`;
              const isLast = index === filtered.length - 1;

              // Only the reversing entry is visually distinct. The original
              // transaction stays looking exactly like a normal completed
              // sale — no badge, no dimming — regardless of whether it was
              // later voided. "Voided" state only ever shows on the new
              // reversing entry row.
              const isVoidEntry = !!txn.voidOfTransactionId;

              // hasBeenVoided is ONLY used to hide the Void button on an
              // already-voided original — it never drives any visual styling.
              const hasBeenVoided = !!txn.voidedAt && !isVoidEntry;

              return (
                <div
                  key={txn.id}
                  style={{
                    borderBottom: isLast ? "none" : `1px solid ${C.border}`,
                    opacity: isVoidEntry ? 0.55 : 1,
                  }}
                >
                  <div
                    className="hidden sm:grid px-4 py-3.5 items-center transition-colors hover:bg-black/[0.02]"
                    style={{
                      gridTemplateColumns: "1.2fr 1fr 1fr 120px 36px 36px",
                    }}
                  >
                    <div className="min-w-0 pr-3">
                      <p
                        className="text-sm font-bold font-mono truncate flex items-center gap-1.5"
                        style={{ color: C.fg }}
                      >
                        {displayId}
                        {isVoidEntry && (
                          <span
                            className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}
                          >
                            VOID
                          </span>
                        )}
                      </p>
                      <p
                        className="text-[11px] mt-0.5"
                        style={{ color: C.mutedFg }}
                      >
                        {formatDate(txn.createdAt)}
                      </p>
                    </div>

                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5">
                        <CreditCard
                          size={11}
                          style={{
                            color: C.mutedFg,
                            flexShrink: 0,
                          }}
                        />
                        <p
                          className="text-xs font-semibold truncate"
                          style={{ color: C.fg }}
                        >
                          {txn.paymentMethod ?? "—"}
                        </p>
                      </div>

                      {txn.paymentReference && (
                        <p
                          className="text-[10px] mt-0.5 truncate"
                          style={{ color: C.mutedFg }}
                        >
                          {txn.paymentReference}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 pr-3">
                      {txn.cashierName ? (
                        <div className="flex items-center gap-1.5">
                          <User
                            size={11}
                            style={{
                              color: C.mutedFg,
                              flexShrink: 0,
                            }}
                          />
                          <p
                            className="text-xs font-semibold truncate"
                            style={{ color: C.fg }}
                          >
                            {txn.cashierName}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs" style={{ color: C.border }}>
                          —
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <div className="text-right">
                        <p
                          className="text-sm font-black"
                          style={{ color: C.orange }}
                        >
                          {money(txn.finalAmount)}
                        </p>

                        {Number(txn.discount) > 0 && (
                          <p className="text-[10px]" style={{ color: "#16a34a" }}>
                            −{money(txn.discount)}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => handlePrint(txn)}
                        disabled={printing}
                        className="relative w-8 h-8 rounded-xl flex items-center justify-center border flex-shrink-0 disabled:opacity-40 transition-all hover:bg-black/5"
                        style={{
                          borderColor: C.border,
                          color: C.mutedFg,
                        }}
                        title={
                          printCount > 0
                            ? `Printed ${printCount}×`
                            : "Print receipt"
                        }
                      >
                        <Printer size={13} />

                        {printCount > 0 && (
                          <span
                            className="absolute -top-1.5 -right-1.5 text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full"
                            style={{
                              background: "#16a34a",
                              color: "white",
                            }}
                          >
                            {printCount}
                          </span>
                        )}
                      </button>
                    </div>

                    {!hasBeenVoided && !isVoidEntry ? (
                      <button
                        onClick={() => openVoidModal(txn)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center border justify-self-center flex-shrink-0 transition-all hover:bg-red-50"
                        style={{
                          borderColor: C.border,
                          color: "#dc2626",
                        }}
                        title="Void this transaction"
                      >
                        <Ban size={13} />
                      </button>
                    ) : (
                      <div />
                    )}

                    <button
                      onClick={() => loadTxnItems(txn.id)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center border justify-self-end transition-all hover:bg-black/5"
                      style={{
                        borderColor: C.border,
                        color: C.mutedFg,
                      }}
                    >
                      {isLoadingIt ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : isExpanded ? (
                        <ChevronUp size={12} />
                      ) : (
                        <ChevronDown size={12} />
                      )}
                    </button>
                  </div>

                  <div className="sm:hidden px-4 py-3 flex items-start justify-between gap-3">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => loadTxnItems(txn.id)}
                    >
                      <p
                        className="text-sm font-bold font-mono flex items-center gap-1.5 flex-wrap"
                        style={{ color: C.fg }}
                      >
                        {displayId}
                        {isVoidEntry && (
                          <span
                            className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}
                          >
                            VOID
                          </span>
                        )}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: C.mutedFg }}
                      >
                        {txn.paymentMethod ?? "—"} · {formatDate(txn.createdAt)}
                      </p>

                      {txn.cashierName && (
                        <p
                          className="text-[10px] mt-0.5 flex items-center gap-1"
                          style={{ color: C.mutedFg }}
                        >
                          <User size={9} />
                          {txn.cashierName}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span
                        className="text-sm font-black"
                        style={{ color: C.orange }}
                      >
                        {money(txn.finalAmount)}
                      </span>

                      {!hasBeenVoided && !isVoidEntry && (
                        <button
                          onClick={() => openVoidModal(txn)}
                          className="w-8 h-8 rounded-xl flex items-center justify-center border"
                          style={{
                            borderColor: C.border,
                            color: "#dc2626",
                          }}
                        >
                          <Ban size={13} />
                        </button>
                      )}

                      <button
                        onClick={() => handlePrint(txn)}
                        disabled={printing}
                        className="relative w-8 h-8 rounded-xl flex items-center justify-center border"
                        style={{
                          borderColor: C.border,
                          color: C.mutedFg,
                        }}
                      >
                        <Printer size={13} />

                        {printCount > 0 && (
                          <span
                            className="absolute -top-1.5 -right-1.5 text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full"
                            style={{
                              background: "#16a34a",
                              color: "white",
                            }}
                          >
                            {printCount}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      className="px-4 py-3 space-y-1.5"
                      style={{
                        background: C.muted,
                        borderTop: `1px solid ${C.border}`,
                      }}
                    >
                      {txn.cashierName && (
                        <p
                          className="text-[11px] mb-2.5 flex items-center gap-1.5"
                          style={{ color: C.mutedFg }}
                        >
                          <User size={10} /> Sold by{" "}
                          <strong style={{ color: C.fg }}>
                            {txn.cashierName}
                          </strong>
                        </p>
                      )}

                      {/* Void reason only shows on the reversing entry —
                          the original never surfaces void info here. */}
                      {isVoidEntry && txn.voidReason && (
                        <p
                          className="text-[11px] mb-2.5"
                          style={{ color: "#dc2626" }}
                        >
                          Void reason: <strong>{txn.voidReason}</strong>
                          {txn.voidedBy ? ` — by ${txn.voidedBy}` : ""}
                        </p>
                      )}

                      {lines.length === 0 ? (
                        <p className="text-xs py-2" style={{ color: C.mutedFg }}>
                          No line items.
                        </p>
                      ) : (
                        lines.map((item) => (
                          <div
                            key={`${txn.id}-${item.eventItemId}-${item.itemId}`}
                            className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border"
                            style={{
                              background: C.card,
                              borderColor: C.border,
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-xs font-bold truncate"
                                style={{ color: C.fg }}
                              >
                                {item.productName}
                              </p>

                              <p
                                className="text-[10px] font-mono mt-0.5"
                                style={{ color: C.mutedFg }}
                              >
                                {item.itemId} · {money(item.finalPrice)} ×{" "}
                                {item.quantity}
                                {item.promoApplied && (
                                  <span
                                    className="ml-2 px-1.5 py-0.5 rounded-full"
                                    style={{
                                      background: "rgba(124,58,237,0.1)",
                                      color: "#7c3aed",
                                    }}
                                  >
                                    {item.promoApplied}
                                  </span>
                                )}
                              </p>
                            </div>

                            <p
                              className="text-xs font-black flex-shrink-0"
                              style={{ color: C.fg }}
                            >
                              {money(item.subtotal)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {voidTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,10,40,0.45)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="rounded-2xl border w-full max-w-md shadow-2xl"
            style={{ background: C.card, borderColor: C.border }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: C.border }}
            >
              <h2 className="font-bold" style={{ color: C.fg }}>
                Void Transaction
              </h2>
              <button
                onClick={() => setVoidTarget(null)}
                className="p-1.5 rounded-lg"
                style={{ background: C.muted, color: C.mutedFg }}
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm" style={{ color: C.mutedFg }}>
                This will reverse{" "}
                <strong style={{ color: C.fg }}>
                  {voidTarget.displayId ?? voidTarget.clientTxnId ?? `#${voidTarget.id}`}
                </strong>
                , return all its items to stock, and remove it from revenue totals. This
                cannot be undone.
              </p>

              <div>
                <label
                  className="block text-[10px] font-semibold uppercase tracking-wider mb-1"
                  style={{ color: C.mutedFg }}
                >
                  Voided by
                </label>
                <input
                  value={voidedBy}
                  onChange={(e) => setVoidedBy(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                  style={{ borderColor: C.border, color: C.fg, background: C.card }}
                />
              </div>

              <div>
                <label
                  className="block text-[10px] font-semibold uppercase tracking-wider mb-1"
                  style={{ color: C.mutedFg }}
                >
                  Reason (optional)
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={2}
                  placeholder="E.g. wrong item scanned, customer changed mind"
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none"
                  style={{ borderColor: C.border, color: C.fg, background: C.card }}
                />
              </div>

              {voidError && (
                <div
                  className="text-xs font-semibold px-3 py-2 rounded-xl"
                  style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}
                >
                  {voidError}
                </div>
              )}
            </div>

            <div
              className="flex gap-2 justify-end px-5 py-4 border-t"
              style={{ borderColor: C.border, background: C.muted }}
            >
              <button
                onClick={() => setVoidTarget(null)}
                disabled={voiding}
                className="px-4 py-2 rounded-xl text-sm font-bold border"
                style={{ borderColor: C.border, color: C.fg, background: C.card }}
              >
                Cancel
              </button>
              <button
                onClick={confirmVoid}
                disabled={voiding}
                className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ background: "#dc2626", color: "white" }}
              >
                {voiding ? "Voiding…" : "Void Transaction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}