// app/(pos)/pos/history/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Search, X, RefreshCw, ChevronDown, ChevronUp,
  ChevronRight, Printer, Receipt, Filter, Calendar,
  CreditCard, CheckCircle2, AlertCircle, Clock, History,
} from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/utils";
import { usePrintReceipt } from "@/lib/hooks/usePrintReceipt";
import {
  fetchCloudReceiptPrintCount,
  getLocalReceiptPrintCount,
  incrementLocalReceiptPrintCount,
  logCloudReceiptPrint,
} from "@/lib/receipt-print-counts";

// ── Types ─────────────────────────────────────────────────────────────────────

type LocalTxn = {
  clientTxnId: string;
  eventId: number;
  totalAmount: string;
  discount: string;
  finalAmount: string;
  paymentMethod: string;
  paymentReference: string | null;
  createdAt: string;
  syncStatus: "pending" | "synced" | "failed";
  serverTransactionId: number | null;
  syncError: string | null;
};

type TxnItem = {
  clientTxnId: string;
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

type SortKey = "createdAt" | "finalAmount" | "paymentMethod" | "syncStatus";
type SortDir = "asc" | "desc";

// ── Constants ─────────────────────────────────────────────────────────────────

const SYNC_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  synced:  { label: "Synced",  color: "#16a34a", bg: "rgba(22,163,74,0.1)",  icon: <CheckCircle2 size={11}/> },
  pending: { label: "Pending", color: "#b45309", bg: "rgba(245,158,11,0.1)", icon: <Clock size={11}/> },
  failed:  { label: "Failed",  color: "#dc2626", bg: "rgba(220,38,38,0.1)",  icon: <AlertCircle size={11}/> },
};

const money = (v: string | number) => formatRupiah(v);

// ── History inner ─────────────────────────────────────────────────────────────

function HistoryInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const eventId      = searchParams.get("event") ? Number(searchParams.get("event")) : null;

  const [txns,         setTxns]         = useState<LocalTxn[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [itemsCache,   setItemsCache]   = useState<Record<string, TxnItem[]>>({});
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState<string | null>(null);
  const [printCounts, setPrintCounts] = useState<Record<string, number>>({});

  const [search,         setSearch]         = useState("");
  const [filterStatus,   setFilterStatus]   = useState("all");
  const [filterMethod,   setFilterMethod]   = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo,   setFilterDateTo]   = useState("");
  const [showFilters,    setShowFilters]    = useState(false);
  const [sortKey,        setSortKey]        = useState<SortKey>("createdAt");
  const [sortDir,        setSortDir]        = useState<SortDir>("desc");

  const { printReceipt, printing } = usePrintReceipt();

  useEffect(() => {
    if (!eventId) { setLoading(false); return; }
    loadTxns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function loadPrintCountsForTxns(list: LocalTxn[]) {
    const entries = await Promise.all(
      list.map(async (txn) => {
        if (txn.serverTransactionId) {
          const count = await fetchCloudReceiptPrintCount(txn.serverTransactionId);
          return [txn.clientTxnId, count] as const;
        }

        return [txn.clientTxnId, getLocalReceiptPrintCount(txn.clientTxnId)] as const;
      })
    );

    setPrintCounts(Object.fromEntries(entries));
  }

  async function loadTxns() {
    if (!eventId) return;
    setLoading(true);
    try {
      const data = await fetch(`/api/local/events/${eventId}/transactions`, { cache: "no-store" }).then(r => r.json());
      const list = Array.isArray(data) ? data : [];
      setTxns(list);
      await loadPrintCountsForTxns(list);
    } catch { setTxns([]); }
    finally { setLoading(false); }
  }

  async function fetchItems(clientTxnId: string): Promise<TxnItem[]> {
    if (itemsCache[clientTxnId]) return itemsCache[clientTxnId];
    try {
      const data = await fetch(
        `/api/local/events/${eventId}/transactions/${encodeURIComponent(clientTxnId)}/items`,
        { cache: "no-store" }
      ).then(r => r.json());
      const items: TxnItem[] = Array.isArray(data) ? data : [];
      setItemsCache(p => ({ ...p, [clientTxnId]: items }));
      return items;
    } catch { return []; }
  }

  async function toggleExpand(clientTxnId: string) {
    if (expanded === clientTxnId) { setExpanded(null); return; }
    setExpanded(clientTxnId);
    if (!itemsCache[clientTxnId]) {
      setLoadingItems(clientTxnId);
      await fetchItems(clientTxnId);
      setLoadingItems(null);
    }
  }

  async function handlePrint(txn: LocalTxn) {
    const items = await fetchItems(txn.clientTxnId);
    await printReceipt(txn, items);

    if (txn.serverTransactionId) {
      const nextCount = await logCloudReceiptPrint(txn.serverTransactionId);
      setPrintCounts((prev) => ({ ...prev, [txn.clientTxnId]: nextCount }));
      return;
    }

    const nextCount = incrementLocalReceiptPrintCount(txn.clientTxnId);
    setPrintCounts((prev) => ({ ...prev, [txn.clientTxnId]: nextCount }));
  }

  const allMethods = useMemo(
    () => [...new Set(txns.map(t => t.paymentMethod).filter(Boolean))].sort(),
    [txns]
  );

  const hasActiveFilters = !!(search || filterStatus !== "all" || filterMethod !== "all" || filterDateFrom || filterDateTo);

  function clearFilters() {
    setSearch(""); setFilterStatus("all"); setFilterMethod("all");
    setFilterDateFrom(""); setFilterDateTo("");
  }

  const filtered = useMemo(() => {
    let list = [...txns];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.clientTxnId.toLowerCase().includes(q) ||
        t.paymentMethod.toLowerCase().includes(q) ||
        (t.paymentReference ?? "").toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "all") list = list.filter(t => t.syncStatus === filterStatus);
    if (filterMethod !== "all") list = list.filter(t => t.paymentMethod === filterMethod);
    if (filterDateFrom) {
      const from = new Date(filterDateFrom).getTime();
      list = list.filter(t => new Date(t.createdAt).getTime() >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo).getTime() + 86_400_000;
      list = list.filter(t => new Date(t.createdAt).getTime() <= to);
    }
    list.sort((a, b) => {
      let va: number | string, vb: number | string;
      if      (sortKey === "createdAt")   { va = new Date(a.createdAt).getTime();  vb = new Date(b.createdAt).getTime(); }
      else if (sortKey === "finalAmount") { va = Number(a.finalAmount);             vb = Number(b.finalAmount); }
      else                                { va = (a as any)[sortKey] ?? "";          vb = (b as any)[sortKey] ?? ""; }
      if (va < vb) return sortDir === "asc" ? -1 :  1;
      if (va > vb) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
    return list;
  }, [txns, search, filterStatus, filterMethod, filterDateFrom, filterDateTo, sortKey, sortDir]);

  const totalRevenue  = filtered.reduce((s, t) => s + Number(t.finalAmount), 0);
  const totalDiscount = filtered.reduce((s, t) => s + Number(t.discount),    0);
  const pendingCount  = txns.filter(t => t.syncStatus === "pending" || t.syncStatus === "failed").length;
  const totalPrinted  = Object.values(printCounts).reduce((sum, count) => sum + Number(count ?? 0), 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronDown size={11} style={{ opacity: 0.3 }} />;
    return sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  }

  return (
    <div className="min-h-screen" style={{ background: "#fafaf8" }}>

      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb" }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => eventId ? router.push(`/pos?event=${eventId}`) : router.push("/pos?select=1")}
            className="p-2 rounded-xl border transition-all hover:bg-black/5 flex-shrink-0"
            style={{ borderColor: "#e5e7eb", color: "#6b7280" }}>
            <ArrowLeft size={15} />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(3,105,161,0.1)", color: "#0369a1" }}>
              <History size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black" style={{ color: "#111" }}>Transaction History</p>
              <p className="text-xs" style={{ color: "#9ca3af" }}>
                {loading ? "Loading…" : `${filtered.length} of ${txns.length} transactions`}
                {pendingCount > 0 && <span className="ml-2 font-bold" style={{ color: "#b45309" }}>· {pendingCount} pending sync</span>}
              </p>
            </div>
          </div>
          <button onClick={loadTxns} disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border disabled:opacity-40 flex-shrink-0"
            style={{ borderColor: "#e5e7eb", color: "#6b7280", background: "white" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">

        {/* Summary */}
        {!loading && txns.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Transactions",      value: String(filtered.length), color: "#0369a1" },
              { label: "Revenue",           value: money(totalRevenue),      color: "#f97316" },
              { label: "Discounts",         value: money(totalDiscount),     color: "#16a34a" },
              { label: "Receipts Printed",  value: String(totalPrinted),     color: "#7c3aed" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl border px-4 py-3" style={{ background: "white", borderColor: "#e5e7eb" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9ca3af" }}>{label}</p>
                <p className="text-lg font-black mt-0.5" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search + filters */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9ca3af" }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by ID, payment method, reference…"
                className="w-full rounded-xl pl-9 pr-8 py-2.5 text-sm focus:outline-none"
                style={{ background: "white", border: "1px solid #e5e7eb", color: "#111" }} />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded" style={{ color: "#9ca3af" }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <button onClick={() => setShowFilters(f => !f)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all flex-shrink-0"
              style={{
                background:  showFilters ? "rgba(3,105,161,0.07)" : "white",
                borderColor: showFilters ? "rgba(3,105,161,0.3)"  : "#e5e7eb",
                color:       showFilters ? "#0369a1"              : "#6b7280",
              }}>
              <Filter size={13} />
              Filters
              {hasActiveFilters && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f97316" }} />}
            </button>
          </div>

          {showFilters && (
            <div className="rounded-2xl border p-4 space-y-3" style={{ background: "white", borderColor: "#e5e7eb" }}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#9ca3af" }}>Sync Status</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-xs focus:outline-none"
                    style={{ borderColor: "#e5e7eb", color: "#111", background: "white" }}>
                    <option value="all">All</option>
                    <option value="synced">Synced</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#9ca3af" }}>Payment Method</label>
                  <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-xs focus:outline-none"
                    style={{ borderColor: "#e5e7eb", color: "#111", background: "white" }}>
                    <option value="all">All Methods</option>
                    {allMethods.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#9ca3af" }}>
                    <Calendar size={9} className="inline mr-1" />From
                  </label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-xs focus:outline-none"
                    style={{ borderColor: "#e5e7eb", color: "#111", background: "white" }} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#9ca3af" }}>
                    <Calendar size={9} className="inline mr-1" />To
                  </label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-xs focus:outline-none"
                    style={{ borderColor: "#e5e7eb", color: "#111", background: "white" }} />
                </div>
              </div>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs font-semibold" style={{ color: "#dc2626" }}>
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: "white", borderColor: "#e5e7eb" }}>
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <RefreshCw size={18} className="animate-spin" style={{ color: "#d1d5db" }} />
              <p className="text-sm" style={{ color: "#9ca3af" }}>Loading…</p>
            </div>
          ) : !eventId ? (
            <div className="py-20 text-center">
              <Receipt size={30} className="mx-auto mb-3" style={{ color: "#d1d5db" }} />
              <p className="text-sm font-semibold" style={{ color: "#9ca3af" }}>No event selected.</p>
              <p className="text-xs mt-1" style={{ color: "#d1d5db" }}>Open an event in POS first.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <Receipt size={30} className="mx-auto mb-3" style={{ color: "#d1d5db" }} />
              <p className="text-sm font-semibold" style={{ color: "#9ca3af" }}>
                {hasActiveFilters ? "No transactions match your filters." : "No transactions yet."}
              </p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs mt-2 font-semibold" style={{ color: "#f97316" }}>Clear filters</button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop header */}
              <div className="hidden sm:grid border-b text-[10px] font-bold uppercase tracking-widest"
                style={{ gridTemplateColumns: "1.6fr 1fr auto auto auto auto", background: "#f9fafb", borderColor: "#e5e7eb", color: "#9ca3af" }}>
                {(["createdAt", "paymentMethod", "finalAmount", "syncStatus"] as SortKey[]).map((k, idx) => (
                  <button key={k} onClick={() => toggleSort(k)}
                    className={`flex items-center gap-1 px-4 py-3 hover:text-gray-700 transition-colors ${idx === 2 ? "justify-end text-right" : "text-left"}`}>
                    {k === "createdAt" ? "Date" : k === "paymentMethod" ? "Payment" : k === "finalAmount" ? "Total" : "Status"}
                    <SortIcon k={k} />
                  </button>
                ))}
                <div className="px-3 py-3 text-center">Print</div>
                <div className="px-3 py-3" />
              </div>

              {filtered.map((txn, i) => {
                const sync        = SYNC_META[txn.syncStatus] ?? SYNC_META.pending;
                const isExpanded  = expanded === txn.clientTxnId;
                const isLoadingIt = loadingItems === txn.clientTxnId;
                const lines       = itemsCache[txn.clientTxnId];
                const printCount  = printCounts[txn.clientTxnId] ?? 0;

                return (
                  <div key={txn.clientTxnId} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f3f4f6" : "none" }}>

                    {/* Desktop row */}
                    <div className="hidden sm:grid items-center hover:bg-black/[0.015] transition-colors"
                      style={{ gridTemplateColumns: "1.6fr 1fr auto auto auto auto" }}>
                      <div className="px-4 py-3.5">
                        <p className="text-xs font-semibold" style={{ color: "#111" }}>{formatDate(txn.createdAt)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <p className="text-[10px] font-mono truncate max-w-[220px]" style={{ color: "#9ca3af" }}>{txn.clientTxnId}</p>
                          <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full"
                            style={{ background: printCount > 0 ? "rgba(22,163,74,0.1)" : "rgba(107,114,128,0.1)", color: printCount > 0 ? "#16a34a" : "#6b7280" }}>
                            <Printer size={8} /> {printCount}x
                          </span>
                        </div>
                      </div>
                      <div className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <CreditCard size={11} style={{ color: "#9ca3af", flexShrink: 0 }} />
                          <p className="text-xs font-semibold truncate" style={{ color: "#111" }}>{txn.paymentMethod}</p>
                        </div>
                        {txn.paymentReference && <p className="text-[10px] mt-0.5 truncate" style={{ color: "#9ca3af" }}>{txn.paymentReference}</p>}
                      </div>
                      <div className="px-4 py-3.5 text-right">
                        <p className="text-sm font-black" style={{ color: "#f97316" }}>{money(txn.finalAmount)}</p>
                        {Number(txn.discount) > 0 && <p className="text-[10px] font-mono" style={{ color: "#16a34a" }}>-{money(txn.discount)}</p>}
                      </div>
                      <div className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: sync.bg, color: sync.color }}>
                          {sync.icon}{sync.label}
                        </span>
                        {txn.syncError && <p className="text-[10px] mt-0.5" style={{ color: "#dc2626" }}>Error</p>}
                      </div>
                      <div className="px-3 py-3.5 flex justify-center">
                        <button onClick={() => handlePrint(txn)} disabled={printing} title={`Printed ${printCount} time${printCount === 1 ? "" : "s"}`}
                          className="relative p-2 rounded-xl border transition-all hover:bg-black/5 disabled:opacity-40"
                          style={{ borderColor: "#e5e7eb", color: "#6b7280" }}>
                          <Printer size={13} />
                          {printCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full"
                              style={{ background: "#16a34a", color: "white" }}>
                              {printCount}x
                            </span>
                          )}
                        </button>
                      </div>
                      <div className="px-3 py-3.5">
                        <button onClick={() => toggleExpand(txn.clientTxnId)}
                          className="p-2 rounded-xl border transition-all hover:bg-black/5"
                          style={{ borderColor: "#e5e7eb", color: "#6b7280" }}>
                          {isLoadingIt ? <RefreshCw size={13} className="animate-spin" /> : isExpanded ? <ChevronUp size={13} /> : <ChevronRight size={13} />}
                        </button>
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div className="sm:hidden px-4 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(txn.clientTxnId)}>
                        <p className="text-xs font-semibold" style={{ color: "#111" }}>{formatDate(txn.createdAt)}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{txn.paymentMethod}</p>
                        <p className="text-[10px] font-mono mt-0.5" style={{ color: "#9ca3af" }}>{txn.clientTxnId}</p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"
                          style={{ background: sync.bg, color: sync.color }}>
                          {sync.icon}{sync.label}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black" style={{ color: "#f97316" }}>{money(txn.finalAmount)}</p>
                        <div className="flex items-center gap-1 mt-1.5 justify-end">
                          <button onClick={() => handlePrint(txn)} disabled={printing}
                            className="relative p-1.5 rounded-lg border" style={{ borderColor: "#e5e7eb", color: "#6b7280" }}
                            title={`Printed ${printCount} time${printCount === 1 ? "" : "s"}`}>
                            <Printer size={12} />
                            {printCount > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black px-1 py-0.5 rounded-full"
                                style={{ background: "#16a34a", color: "white" }}>
                                {printCount}x
                              </span>
                            )}
                          </button>
                          <button onClick={() => toggleExpand(txn.clientTxnId)}
                            className="p-1.5 rounded-lg border" style={{ borderColor: "#e5e7eb", color: "#6b7280" }}>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronRight size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Line items */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 space-y-1.5" style={{ background: "#f9fafb", borderTop: "1px solid #f0f0f0" }}>
                        {!lines || isLoadingIt ? (
                          <p className="text-xs py-3 text-center" style={{ color: "#9ca3af" }}>Loading items…</p>
                        ) : lines.length === 0 ? (
                          <p className="text-xs py-3 text-center" style={{ color: "#9ca3af" }}>No line items.</p>
                        ) : (
                          <>
                            {lines.map((li, j) => (
                              <div key={j} className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-semibold" style={{ color: "#111" }}>{li.productName}</span>
                                  {li.promoApplied && (
                                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                      style={{ background: "rgba(124,58,237,0.1)", color: "#7c3aed" }}>
                                      {li.promoApplied}
                                    </span>
                                  )}
                                  <span className="ml-1.5 text-[10px] font-mono" style={{ color: "#9ca3af" }}>
                                    ×{li.quantity} @ {money(li.finalPrice)}
                                  </span>
                                </div>
                                <span className="text-xs font-black font-mono flex-shrink-0" style={{ color: "#111" }}>
                                  {money(Number(li.finalPrice) * Number(li.quantity))}
                                </span>
                              </div>
                            ))}
                            <div className="pt-2 mt-1 border-t space-y-1" style={{ borderColor: "#e5e7eb" }}>
                              {Number(txn.discount) > 0 && <>
                                <div className="flex justify-between text-[11px]">
                                  <span style={{ color: "#9ca3af" }}>Subtotal</span>
                                  <span className="font-mono" style={{ color: "#9ca3af" }}>{money(txn.totalAmount)}</span>
                                </div>
                                <div className="flex justify-between text-[11px]">
                                  <span style={{ color: "#16a34a" }}>Discount</span>
                                  <span className="font-mono" style={{ color: "#16a34a" }}>-{money(txn.discount)}</span>
                                </div>
                              </>}
                              <div className="flex justify-between text-xs font-bold">
                                <span style={{ color: "#111" }}>Total</span>
                                <span className="font-mono" style={{ color: "#f97316" }}>{money(txn.finalAmount)}</span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function POSHistoryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#fafaf8" }}>
        <div className="flex items-center gap-2" style={{ color: "#9ca3af" }}>
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">Loading history…</span>
        </div>
      </div>
    }>
      <HistoryInner />
    </Suspense>
  );
}