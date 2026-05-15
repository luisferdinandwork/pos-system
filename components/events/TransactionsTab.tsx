// components/events/TransactionsTab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CreditCard,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { formatDate, formatRupiah } from "@/lib/utils";
import { usePrintReceipt, type PrintTxn, type PrintTxnItem } from "@/lib/hooks/usePrintReceipt";
import { logCloudReceiptPrint } from "@/lib/receipt-print-counts";

type Transaction = {
  id: number;
  displayId?: string | null;
  eventId: number;
  clientTxnId?: string | null;
  cashierSessionId?: number | null;
  totalAmount: string;
  discount: string;
  finalAmount: string;
  cashTendered?: string | null;
  changeAmount?: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  createdAt: string | null;
};

type TransactionItem = {
  id?: number;
  transactionId?: number;
  eventItemId: number;
  itemId: string;
  productName: string;
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
  onRefresh?: () => void | Promise<void>;
};

const money = (v: string | number | null | undefined) => formatRupiah(v ?? 0);

function printCountLabel(count: number) {
  if (count <= 0) return "Not printed";
  if (count === 1) return "Printed 1x";
  return `Printed ${count}x`;
}

export function TransactionsTab({ eventId, transactions, onRefresh }: Props) {
  const [expandedTxn, setExpandedTxn] = useState<number | null>(null);
  const [txnItems, setTxnItems] = useState<Record<number, TransactionItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<number | null>(null);
  const [printCounts, setPrintCounts] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");

  const { printReceipt, printing } = usePrintReceipt();

  async function loadPrintCounts() {
    try {
      const res = await fetch(`/api/events/${eventId}/transactions/print-counts`, {
        cache: "no-store",
      });

      if (!res.ok) return;

      const data = await res.json();
      const raw = data?.counts ?? {};
      const mapped: Record<number, number> = {};

      for (const [id, count] of Object.entries(raw)) {
        mapped[Number(id)] = Number(count ?? 0);
      }

      setPrintCounts(mapped);
    } catch {
      setPrintCounts({});
    }
  }

  useEffect(() => {
    loadPrintCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, transactions.length]);

  async function loadTxnItems(txnId: number) {
    if (txnItems[txnId]) {
      setExpandedTxn(expandedTxn === txnId ? null : txnId);
      return txnItems[txnId];
    }

    setLoadingItems(txnId);

    try {
      const res = await fetch(`/api/transactions/${txnId}/items`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error ?? "Failed to load transaction items");
        return [];
      }

      const data = await res.json();
      const items = Array.isArray(data) ? data : [];

      setTxnItems((prev) => ({ ...prev, [txnId]: items }));
      setExpandedTxn(txnId);

      return items;
    } finally {
      setLoadingItems(null);
    }
  }

  async function handlePrint(txn: Transaction) {
    const items = await loadTxnItems(txn.id);

    const txnForPrint: PrintTxn = {
      clientTxnId: txn.displayId ?? txn.clientTxnId ?? String(txn.id),
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
      productName: item.productName,
      quantity: Number(item.quantity),
      unitPrice: String(item.unitPrice),
      discountAmt: String(item.discountAmt),
      finalPrice: String(item.finalPrice),
      subtotal: String(item.subtotal),
      promoApplied: item.promoApplied,
    }));

    await printReceipt(txnForPrint, itemsForPrint);

    const nextCount = await logCloudReceiptPrint(txn.id);

    setPrintCounts((prev) => ({
      ...prev,
      [txn.id]: nextCount,
    }));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return transactions;

    return transactions.filter((txn) => {
      return (
        String(txn.displayId ?? "").toLowerCase().includes(q) ||
        String(txn.clientTxnId ?? "").toLowerCase().includes(q) ||
        String(txn.paymentMethod ?? "").toLowerCase().includes(q) ||
        String(txn.paymentReference ?? "").toLowerCase().includes(q)
      );
    });
  }, [transactions, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--muted-foreground)" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transaction ID, payment, reference..."
            className="w-full rounded-xl border pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
            style={{
              borderColor: "var(--border)",
              color: "var(--foreground)",
              background: "var(--card)",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--muted-foreground)" }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <button
          onClick={() => {
            loadPrintCounts();
            onRefresh?.();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold"
          style={{
            borderColor: "var(--border)",
            background: "var(--card)",
            color: "var(--foreground)",
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt
              size={32}
              className="mx-auto mb-3 opacity-25"
              style={{ color: "var(--muted-foreground)" }}
            />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              No transactions found.
            </p>
          </div>
        ) : (
          filtered.map((txn, idx) => {
            const isExpanded = expandedTxn === txn.id;
            const isLoadingIt = loadingItems === txn.id;
            const lines = txnItems[txn.id] ?? [];
            const printCount = printCounts[txn.id] ?? 0;
            const displayId = txn.displayId ?? txn.clientTxnId ?? `#${txn.id}`;

            return (
              <div
                key={txn.id}
                style={{
                  borderBottom:
                    idx < filtered.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_auto_auto_auto] gap-3 lg:gap-0 items-center px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className="text-sm font-black font-mono"
                        style={{ color: "var(--foreground)" }}
                      >
                        {displayId}
                      </p>
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            printCount > 0
                              ? "rgba(22,163,74,0.1)"
                              : "rgba(107,114,128,0.1)",
                          color: printCount > 0 ? "#16a34a" : "#6b7280",
                        }}
                        title="Receipt print count"
                      >
                        <Printer size={10} />
                        {printCountLabel(printCount)}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {formatDate(txn.createdAt)}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <CreditCard
                        size={12}
                        style={{ color: "var(--muted-foreground)" }}
                      />
                      <p
                        className="text-xs font-semibold truncate"
                        style={{ color: "var(--foreground)" }}
                      >
                        {txn.paymentMethod ?? "—"}
                      </p>
                    </div>
                    {txn.paymentReference && (
                      <p
                        className="text-[10px] mt-0.5 truncate"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {txn.paymentReference}
                      </p>
                    )}
                  </div>

                  <div className="lg:text-right">
                    <p className="text-base font-black" style={{ color: "var(--brand-orange)" }}>
                      {money(txn.finalAmount)}
                    </p>
                    {Number(txn.discount) > 0 && (
                      <p className="text-[10px] font-mono" style={{ color: "#16a34a" }}>
                        -{money(txn.discount)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 lg:justify-center">
                    <button
                      onClick={() => handlePrint(txn)}
                      disabled={printing}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold disabled:opacity-40"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                        background: "var(--card)",
                      }}
                      title={`Receipt printed ${printCount} time${printCount === 1 ? "" : "s"}`}
                    >
                      <Printer size={12} />
                      Print
                      {printCount > 0 && (
                        <span
                          className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{
                            background: "rgba(22,163,74,0.1)",
                            color: "#16a34a",
                          }}
                        >
                          {printCount}x
                        </span>
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => loadTxnItems(txn.id)}
                    className="justify-self-start lg:justify-self-end p-2 rounded-xl border"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--muted-foreground)",
                      background: "var(--card)",
                    }}
                  >
                    {isLoadingIt ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : isExpanded ? (
                      <ChevronUp size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </button>
                </div>

                {isExpanded && (
                  <div
                    className="px-4 py-3"
                    style={{ background: "var(--muted)" }}
                  >
                    {lines.length === 0 ? (
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        No line items loaded.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {lines.map((item) => (
                          <div
                            key={`${txn.id}-${item.eventItemId}-${item.itemId}`}
                            className="rounded-xl border px-3 py-2"
                            style={{
                              background: "var(--card)",
                              borderColor: "var(--border)",
                            }}
                          >
                            <div className="flex justify-between gap-3">
                              <div className="min-w-0">
                                <p
                                  className="text-xs font-bold truncate"
                                  style={{ color: "var(--foreground)" }}
                                >
                                  {item.productName}
                                </p>
                                <p
                                  className="text-[10px] font-mono"
                                  style={{ color: "var(--muted-foreground)" }}
                                >
                                  {item.itemId} · {money(item.finalPrice)} × {item.quantity}
                                </p>
                                {item.promoApplied && (
                                  <p className="text-[10px] mt-0.5" style={{ color: "#7c3aed" }}>
                                    {item.promoApplied}
                                  </p>
                                )}
                              </div>
                              <p
                                className="text-xs font-black"
                                style={{ color: "var(--foreground)" }}
                              >
                                {money(item.subtotal)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
