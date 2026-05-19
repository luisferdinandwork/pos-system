// components/events/TransactionsTab.tsx — REDESIGNED
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronUp, CreditCard,
  Printer, Receipt, RefreshCw, Search, User, X, Tag,
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
  cashierName?: string | null;
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

export function TransactionsTab({ eventId, transactions, onRefresh }: Props) {
  const [expandedTxn,  setExpandedTxn]  = useState<number | null>(null);
  const [txnItems,     setTxnItems]     = useState<Record<number, TransactionItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<number | null>(null);
  const [printCounts,  setPrintCounts]  = useState<Record<number, number>>({});
  const [search,       setSearch]       = useState("");

  const { printReceipt, printing } = usePrintReceipt();

  async function loadPrintCounts() {
    try {
      const res  = await fetch(`/api/events/${eventId}/transactions/print-counts`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const raw  = data?.counts ?? {};
      const mapped: Record<number, number> = {};
      for (const [id, count] of Object.entries(raw)) mapped[Number(id)] = Number(count ?? 0);
      setPrintCounts(mapped);
    } catch { setPrintCounts({}); }
  }

  useEffect(() => { loadPrintCounts(); }, [eventId, transactions.length]);

  async function loadTxnItems(txnId: number) {
    if (txnItems[txnId]) { setExpandedTxn(expandedTxn === txnId ? null : txnId); return txnItems[txnId]; }
    setLoadingItems(txnId);
    try {
      const res  = await fetch(`/api/transactions/${txnId}/items`, { cache: "no-store" });
      if (!res.ok) return [];
      const data  = await res.json();
      const items = Array.isArray(data) ? data : [];
      setTxnItems(p => ({ ...p, [txnId]: items }));
      setExpandedTxn(txnId);
      return items;
    } finally { setLoadingItems(null); }
  }

  async function handlePrint(txn: Transaction) {
    const items = await loadTxnItems(txn.id);
    const txnForPrint: PrintTxn = {
      clientTxnId:      txn.displayId ?? txn.clientTxnId ?? String(txn.id),
      totalAmount:      String(txn.totalAmount ?? 0),
      discount:         String(txn.discount ?? 0),
      finalAmount:      String(txn.finalAmount ?? 0),
      paymentMethod:    txn.paymentMethod ?? "—",
      paymentReference: txn.paymentReference ?? null,
      cashTendered:     txn.cashTendered ?? null,
      changeAmount:     txn.changeAmount ?? null,
      createdAt:        txn.createdAt ?? new Date().toISOString(),
    };
    const itemsForPrint: PrintTxnItem[] = (items as TransactionItem[]).map(item => ({
      productName: item.productName, quantity: Number(item.quantity),
      unitPrice: String(item.unitPrice), discountAmt: String(item.discountAmt),
      finalPrice: String(item.finalPrice), subtotal: String(item.subtotal),
      promoApplied: item.promoApplied,
    }));
    await printReceipt(txnForPrint, itemsForPrint);
    const nextCount = await logCloudReceiptPrint(txn.id);
    setPrintCounts(p => ({ ...p, [txn.id]: nextCount }));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(txn =>
      String(txn.displayId ?? "").toLowerCase().includes(q) ||
      String(txn.clientTxnId ?? "").toLowerCase().includes(q) ||
      String(txn.paymentMethod ?? "").toLowerCase().includes(q) ||
      String(txn.paymentReference ?? "").toLowerCase().includes(q) ||
      String(txn.cashierName ?? "").toLowerCase().includes(q)
    );
  }, [transactions, search]);

  const totalRevenue = filtered.reduce((s, t) => s + Number(t.finalAmount), 0);

  const C = {
    border:  "var(--border)",
    muted:   "var(--muted)",
    mutedFg: "var(--muted-foreground)",
    fg:      "var(--foreground)",
    orange:  "var(--brand-orange)",
    mid:     "var(--brand-mid)",
    card:    "var(--card)",
  };

  return (
    <div className="space-y-3">
      {/* Search + summary */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.mutedFg }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ID, payment, cashier…"
            className="w-full rounded-xl border pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
            style={{ borderColor: C.border, color: C.fg, background: C.card }} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: C.mutedFg }}>
              <X size={13} />
            </button>
          )}
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border flex-shrink-0"
            style={{ borderColor: C.border, background: C.card }}>
            <span className="text-xs" style={{ color: C.mutedFg }}>{filtered.length} txns</span>
            <span className="text-xs font-black" style={{ color: C.orange }}>{money(totalRevenue)}</span>
          </div>
        )}
        <button onClick={() => { loadPrintCounts(); onRefresh?.(); }}
          className="p-2.5 rounded-xl border transition-all hover:bg-black/5"
          style={{ borderColor: C.border, color: C.mutedFg }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: C.card, borderColor: C.border }}>
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt size={28} className="mx-auto mb-2 opacity-20" style={{ color: C.mutedFg }} />
            <p className="text-sm" style={{ color: C.mutedFg }}>No transactions found.</p>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div className="hidden sm:grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ gridTemplateColumns: "1.2fr 1fr 1fr 120px 36px", background: C.muted, borderBottom: `1px solid ${C.border}`, color: C.mutedFg }}>
              <div>Transaction</div>
              <div>Method</div>
              <div>Cashier</div>
              <div className="text-right">Amount</div>
              <div />
            </div>

            {filtered.map((txn, idx) => {
              const isExpanded  = expandedTxn === txn.id;
              const isLoadingIt = loadingItems === txn.id;
              const lines       = txnItems[txn.id] ?? [];
              const printCount  = printCounts[txn.id] ?? 0;
              const displayId   = txn.displayId ?? txn.clientTxnId ?? `#${txn.id}`;
              const isLast      = idx === filtered.length - 1;

              return (
                <div key={txn.id} style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>

                  {/* Main row */}
                  <div className="hidden sm:grid px-4 py-3.5 items-center transition-colors hover:bg-black/[0.02]"
                    style={{ gridTemplateColumns: "1.2fr 1fr 1fr 120px 36px" }}>

                    {/* ID + date */}
                    <div className="min-w-0 pr-3">
                      <p className="text-sm font-bold font-mono truncate" style={{ color: C.fg }}>{displayId}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: C.mutedFg }}>{formatDate(txn.createdAt)}</p>
                    </div>

                    {/* Payment */}
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5">
                        <CreditCard size={11} style={{ color: C.mutedFg, flexShrink: 0 }} />
                        <p className="text-xs font-semibold truncate" style={{ color: C.fg }}>{txn.paymentMethod ?? "—"}</p>
                      </div>
                      {txn.paymentReference && <p className="text-[10px] mt-0.5 truncate" style={{ color: C.mutedFg }}>{txn.paymentReference}</p>}
                    </div>

                    {/* Cashier */}
                    <div className="min-w-0 pr-3">
                      {txn.cashierName ? (
                        <div className="flex items-center gap-1.5">
                          <User size={11} style={{ color: C.mutedFg, flexShrink: 0 }} />
                          <p className="text-xs font-semibold truncate" style={{ color: C.fg }}>{txn.cashierName}</p>
                        </div>
                      ) : (
                        <p className="text-xs" style={{ color: C.border }}>—</p>
                      )}
                    </div>

                    {/* Amount + print */}
                    <div className="flex items-center justify-end gap-2">
                      <div className="text-right">
                        <p className="text-sm font-black" style={{ color: C.orange }}>{money(txn.finalAmount)}</p>
                        {Number(txn.discount) > 0 && <p className="text-[10px]" style={{ color: "#16a34a" }}>−{money(txn.discount)}</p>}
                      </div>
                      <button onClick={() => handlePrint(txn)} disabled={printing}
                        className="relative w-8 h-8 rounded-xl flex items-center justify-center border flex-shrink-0 disabled:opacity-40 transition-all hover:bg-black/5"
                        style={{ borderColor: C.border, color: C.mutedFg }}
                        title={printCount > 0 ? `Printed ${printCount}×` : "Print receipt"}>
                        <Printer size={13} />
                        {printCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full"
                            style={{ background: "#16a34a", color: "white" }}>{printCount}</span>
                        )}
                      </button>
                    </div>

                    {/* Expand */}
                    <button onClick={() => loadTxnItems(txn.id)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center border justify-self-end transition-all hover:bg-black/5"
                      style={{ borderColor: C.border, color: C.mutedFg }}>
                      {isLoadingIt ? <RefreshCw size={12} className="animate-spin" /> : isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>

                  {/* Mobile card */}
                  <div className="sm:hidden px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadTxnItems(txn.id)}>
                      <p className="text-sm font-bold font-mono" style={{ color: C.fg }}>{displayId}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.mutedFg }}>{txn.paymentMethod ?? "—"} · {formatDate(txn.createdAt)}</p>
                      {txn.cashierName && <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: C.mutedFg }}><User size={9} />{txn.cashierName}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-sm font-black" style={{ color: C.orange }}>{money(txn.finalAmount)}</span>
                      <button onClick={() => handlePrint(txn)} disabled={printing}
                        className="relative w-8 h-8 rounded-xl flex items-center justify-center border"
                        style={{ borderColor: C.border, color: C.mutedFg }}>
                        <Printer size={13} />
                        {printCount > 0 && <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full" style={{ background: "#16a34a", color: "white" }}>{printCount}</span>}
                      </button>
                    </div>
                  </div>

                  {/* Expanded items */}
                  {isExpanded && (
                    <div className="px-4 py-3 space-y-1.5" style={{ background: C.muted, borderTop: `1px solid ${C.border}` }}>
                      {txn.cashierName && (
                        <p className="text-[11px] mb-2.5 flex items-center gap-1.5" style={{ color: C.mutedFg }}>
                          <User size={10} /> Sold by <strong style={{ color: C.fg }}>{txn.cashierName}</strong>
                        </p>
                      )}
                      {lines.length === 0 ? (
                        <p className="text-xs py-2" style={{ color: C.mutedFg }}>No line items.</p>
                      ) : lines.map(item => (
                        <div key={`${txn.id}-${item.eventItemId}-${item.itemId}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border"
                          style={{ background: C.card, borderColor: C.border }}>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate" style={{ color: C.fg }}>{item.productName}</p>
                            <p className="text-[10px] font-mono mt-0.5" style={{ color: C.mutedFg }}>
                              {item.itemId} · {money(item.finalPrice)} × {item.quantity}
                              {item.promoApplied && <span className="ml-2 px-1.5 py-0.5 rounded-full" style={{ background: "rgba(124,58,237,0.1)", color: "#7c3aed" }}>{item.promoApplied}</span>}
                            </p>
                          </div>
                          <p className="text-xs font-black flex-shrink-0" style={{ color: C.fg }}>{money(item.subtotal)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}