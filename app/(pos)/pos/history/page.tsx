// app/(pos)/pos/history/page.tsx 
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Search, X, RefreshCw, ChevronDown, ChevronUp,
  ChevronRight, Printer, Receipt, Filter, Calendar,
  CreditCard, CheckCircle2, AlertCircle, Clock, History,
  DollarSign, Tag, TrendingUp,
} from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/utils";
import { usePrintReceipt, type EventReceiptTemplate } from "@/lib/hooks/usePrintReceipt";
import { incrementLocalReceiptPrintCount } from "@/lib/receipt-print-counts";

// ── Types ─────────────────────────────────────────────────────────────────────
type LocalTxn = {
  clientTxnId: string;
  displayId?: string | null;
  eventId: number;
  totalAmount: string;
  discount: string;
  finalAmount: string;
  paymentMethod: string;
  paymentReference: string | null;
  cashTendered?: string | null;
  changeAmount?: string | null;
  createdAt: string;
  syncStatus: "pending" | "synced" | "failed";
  serverTransactionId: number | null;
  syncError: string | null;
  receiptPrintCount?: number | null;  // stored in SQLite — our source of truth
};
type TxnItem = {
  clientTxnId: string; eventItemId: number; itemId: string; productName: string;
  quantity: number; unitPrice: string; discountAmt: string; finalPrice: string;
  subtotal: string; promoApplied: string | null;
};
type SortKey = "createdAt" | "finalAmount" | "paymentMethod" | "syncStatus";
type SortDir = "asc" | "desc";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:      "var(--background)",
  card:    "var(--card)",
  border:  "var(--border)",
  muted:   "var(--muted)",
  mutedFg: "var(--muted-foreground)",
  fg:      "var(--foreground)",
  orange:  "var(--brand-orange)",
  mid:     "var(--brand-mid)",
  deep:    "var(--brand-deep)",
  yellow:  "var(--brand-yellow)",
  sec:     "var(--secondary)",
  secFg:   "var(--secondary-foreground)",
};

// ── Status config ─────────────────────────────────────────────────────────────
const SYNC_META: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  synced:  { label:"Synced",  color:"#16a34a", bg:"rgba(22,163,74,0.08)",  border:"rgba(22,163,74,0.2)",  icon:<CheckCircle2 size={11}/> },
  pending: { label:"Pending", color:"#b45309", bg:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.2)", icon:<Clock size={11}/> },
  failed:  { label:"Failed",  color:"#dc2626", bg:"rgba(220,38,38,0.08)",  border:"rgba(220,38,38,0.2)",  icon:<AlertCircle size={11}/> },
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
  const [printCounts,  setPrintCounts]  = useState<Record<string, number>>({});
  const [receiptTemplate, setReceiptTemplate] = useState<EventReceiptTemplate | null>(null);

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
    if (!eventId) {
      setLoading(false);
      return;
    }

    loadTxns();
    loadReceiptTemplate(eventId);
  }, [eventId]);

  async function loadReceiptTemplate(currentEventId: number) {
    try {
      const res = await fetch(`/api/events/${currentEventId}/receipt-template`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      setReceiptTemplate(res.ok ? data : null);
    } catch {
      setReceiptTemplate(null);
    }
  }

  async function loadPrintCountsForTxns(list: LocalTxn[]) {
    // Use receiptPrintCount stored directly in SQLite — same source the POS page uses.
    // No extra cloud fetches needed; the local count is incremented on every print
    // and synced to Neon by the /api/local/transactions/[clientTxnId]/receipt-print route.
    const entries = list.map(txn => [
      txn.clientTxnId,
      Number(txn.receiptPrintCount ?? 0),
    ] as const);
    setPrintCounts(Object.fromEntries(entries));
  }

  async function loadTxns() {
    if (!eventId) return;
    setLoading(true);
    try {
      const data = await fetch(`/api/local/events/${eventId}/transactions`, { cache: "no-store" }).then(r => r.json());
      const list: LocalTxn[] = Array.isArray(data) ? data : [];
      setTxns(list);
      loadPrintCountsForTxns(list); // sync — no await needed
    } catch {
      setTxns([]);
    } finally {
      setLoading(false);
    }
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

    const currentCount = Number(txn.receiptPrintCount ?? printCounts[txn.clientTxnId] ?? 0);
    const nextPrintNumber = currentCount + 1;

    await printReceipt(txn, items, {
      template: receiptTemplate,
      eventName: receiptTemplate?.storeName ?? null,
      printNumber: nextPrintNumber,
    });

    const result = await incrementLocalReceiptPrintCount(txn.clientTxnId);

    const nextCount =
      typeof result === "number"
        ? result
        : Number((result as any)?.receiptPrintCount ?? nextPrintNumber);

    setPrintCounts((prev) => ({
      ...prev,
      [txn.clientTxnId]: nextCount,
    }));

    setTxns((prev) =>
      prev.map((row) =>
        row.clientTxnId === txn.clientTxnId
          ? {
              ...row,
              receiptPrintCount: nextCount,
            }
          : row
      )
    );
  }

  const allMethods = useMemo(()=>[...new Set(txns.map(t=>t.paymentMethod).filter(Boolean))].sort(),[txns]);
  const hasActiveFilters = !!(search||filterStatus!=="all"||filterMethod!=="all"||filterDateFrom||filterDateTo);
  function clearFilters() { setSearch("");setFilterStatus("all");setFilterMethod("all");setFilterDateFrom("");setFilterDateTo(""); }

  const filtered = useMemo(()=>{
    let list=[...txns];
    if (search.trim()){const q=search.toLowerCase();list=list.filter(t=>t.clientTxnId.toLowerCase().includes(q)||t.paymentMethod.toLowerCase().includes(q)||(t.paymentReference??"").toLowerCase().includes(q));}
    if (filterStatus!=="all") list=list.filter(t=>t.syncStatus===filterStatus);
    if (filterMethod!=="all") list=list.filter(t=>t.paymentMethod===filterMethod);
    if (filterDateFrom){const from=new Date(filterDateFrom).getTime();list=list.filter(t=>new Date(t.createdAt).getTime()>=from);}
    if (filterDateTo){const to=new Date(filterDateTo).getTime()+86_400_000;list=list.filter(t=>new Date(t.createdAt).getTime()<=to);}
    list.sort((a,b)=>{
      let va: number|string,vb: number|string;
      if (sortKey==="createdAt"){va=new Date(a.createdAt).getTime();vb=new Date(b.createdAt).getTime();}
      else if (sortKey==="finalAmount"){va=Number(a.finalAmount);vb=Number(b.finalAmount);}
      else {va=(a as any)[sortKey]??"";vb=(b as any)[sortKey]??"";}
      if (va<vb) return sortDir==="asc"?-1:1;
      if (va>vb) return sortDir==="asc"?1:-1;
      return 0;
    });
    return list;
  },[txns,search,filterStatus,filterMethod,filterDateFrom,filterDateTo,sortKey,sortDir]);

  const totalRevenue  = filtered.reduce((s,t)=>s+Number(t.finalAmount),0);
  const totalDiscount = filtered.reduce((s,t)=>s+Number(t.discount),0);
  const pendingCount  = txns.filter(t=>t.syncStatus==="pending"||t.syncStatus==="failed").length;
  const totalPrinted  = Object.values(printCounts).reduce((s,c)=>s+Number(c??0),0);

  function toggleSort(key: SortKey) {
    if (sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortKey(key);setSortDir("desc");}
  }

  function SortIcon({k}: {k: SortKey}) {
    if (sortKey!==k) return <ChevronDown size={10} style={{ opacity:.3 }}/>;
    return sortDir==="asc"?<ChevronUp size={10}/>:<ChevronDown size={10}/>;
  }

  return (
    <div className="min-h-screen" style={{ background:C.bg }}>

      {/* ── Header ── */}
      <div style={{ background:C.deep }}>
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button onClick={()=>eventId?router.push(`/pos?event=${eventId}`):router.push("/pos?select=1")}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:bg-white/10"
            style={{ color:"rgba(255,255,255,0.7)", border:"1px solid rgba(255,255,255,0.12)" }}>
            <ArrowLeft size={15}/>
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background:"rgba(255,255,255,0.08)" }}>
              <History size={15} style={{ color:"rgba(255,255,255,0.7)" }}/>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-white">Transaction History</p>
              <p className="text-[11px] opacity-50 text-white">
                {loading?"Loading…":`${filtered.length} of ${txns.length} transactions`}
                {pendingCount>0&&<span className="ml-2 font-bold" style={{ color:"#fbbf24", opacity:1 }}>· {pendingCount} pending sync</span>}
              </p>
            </div>
          </div>
          <button onClick={loadTxns} disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border disabled:opacity-40 flex-shrink-0 transition-all hover:bg-white/10"
            style={{ borderColor:"rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.7)" }}>
            <RefreshCw size={12} className={loading?"animate-spin":""}/> Refresh
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">

        {/* ── Summary cards ── */}
        {!loading&&txns.length>0&&(
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:"Transactions",     value:String(filtered.length), color:C.mid,    bg:"rgba(69,46,90,0.08)",   icon:<History size={14}/> },
              { label:"Revenue",          value:money(totalRevenue),     color:C.orange,  bg:"rgba(255,101,63,0.08)",  icon:<DollarSign size={14}/> },
              { label:"Savings Given",    value:money(totalDiscount),    color:"#16a34a", bg:"rgba(22,163,74,0.08)",   icon:<Tag size={14}/> },
              { label:"Receipts Printed", value:String(totalPrinted),    color:"#0369a1", bg:"rgba(3,105,161,0.08)",   icon:<Printer size={14}/> },
            ].map(({label,value,color,bg,icon})=>(
              <div key={label} className="rounded-2xl px-4 py-3 flex items-start gap-3"
                style={{ background:"white", border:`1px solid ${C.border}` }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background:bg, color }}>{icon}</div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color:C.mutedFg }}>{label}</p>
                  <p className="text-lg font-black mt-0.5 truncate" style={{ color }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Search + filters ── */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:C.mutedFg }}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search by ID, payment method, reference…"
                className="w-full rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-none"
                style={{ background:"white", border:`1px solid ${C.border}`, color:C.fg }}/>
              {search&&(
                <button onClick={()=>setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 transition-all hover:text-red-500" style={{ color:C.mutedFg }}>
                  <X size={13}/>
                </button>
              )}
            </div>
            <button onClick={()=>setShowFilters(f=>!f)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-bold flex-shrink-0 transition-all"
              style={{ background:showFilters?"rgba(69,46,90,0.06)":"white", borderColor:showFilters?"rgba(69,46,90,0.3)":C.border, color:showFilters?C.mid:C.mutedFg }}>
              <Filter size={13}/>
              Filters
              {hasActiveFilters&&<span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:C.orange }}/>}
            </button>
          </div>

          {showFilters&&(
            <div className="rounded-2xl border p-4 space-y-3" style={{ background:"white", borderColor:C.border }}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label:"Sync Status", el:(
                    <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-xs focus:outline-none"
                      style={{ borderColor:C.border, color:C.fg, background:"white" }}>
                      <option value="all">All</option>
                      <option value="synced">Synced</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                    </select>
                  )},
                  { label:"Payment Method", el:(
                    <select value={filterMethod} onChange={e=>setFilterMethod(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-xs focus:outline-none"
                      style={{ borderColor:C.border, color:C.fg, background:"white" }}>
                      <option value="all">All Methods</option>
                      {allMethods.map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  )},
                  { label:"From Date", el:(
                    <input type="date" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-xs focus:outline-none"
                      style={{ borderColor:C.border, color:C.fg, background:"white" }}/>
                  )},
                  { label:"To Date", el:(
                    <input type="date" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-xs focus:outline-none"
                      style={{ borderColor:C.border, color:C.fg, background:"white" }}/>
                  )},
                ].map(({label,el})=>(
                  <div key={label}>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color:C.mutedFg }}>{label}</label>
                    {el}
                  </div>
                ))}
              </div>
              {hasActiveFilters&&(
                <button onClick={clearFilters} className="text-xs font-bold transition-all hover:opacity-70" style={{ color:"#dc2626" }}>Clear all filters</button>
              )}
            </div>
          )}
        </div>

        {/* ── Transaction table ── */}
        <div className="rounded-2xl border overflow-hidden" style={{ background:"white", borderColor:C.border }}>
          {loading?(
            <div className="flex items-center justify-center py-20 gap-3">
              <RefreshCw size={18} className="animate-spin" style={{ color:C.border }}/>
              <p className="text-sm" style={{ color:C.mutedFg }}>Loading transactions…</p>
            </div>
          ):!eventId?(
            <div className="py-20 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background:C.muted }}><Receipt size={24} style={{ color:C.border }}/></div>
              <p className="text-sm font-black" style={{ color:C.mutedFg }}>No event selected</p>
              <p className="text-xs mt-1" style={{ color:C.border }}>Open an event in POS first.</p>
            </div>
          ):filtered.length===0?(
            <div className="py-20 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background:C.muted }}><Receipt size={24} style={{ color:C.border }}/></div>
              <p className="text-sm font-black" style={{ color:C.mutedFg }}>
                {hasActiveFilters?"No transactions match your filters.":"No transactions yet."}
              </p>
              {hasActiveFilters&&<button onClick={clearFilters} className="text-xs mt-2 font-bold transition-all hover:opacity-70" style={{ color:C.orange }}>Clear filters</button>}
            </div>
          ):(
            <>
              {/* Desktop table header */}
              <div className="hidden sm:grid items-center text-[10px] font-black uppercase tracking-widest"
                style={{ gridTemplateColumns:"1.8fr 1fr 130px 90px 52px 44px", background:C.muted, borderBottom:`1px solid ${C.border}`, color:C.mutedFg }}>
                {(["createdAt","paymentMethod","finalAmount","syncStatus"] as SortKey[]).map((k,idx)=>(
                  <button key={k} onClick={()=>toggleSort(k)}
                    className={`flex items-center gap-1 px-4 py-3 hover:text-gray-700 transition-colors ${idx===2?"justify-end":""}`}>
                    {k==="createdAt"?"Date/Time":k==="paymentMethod"?"Method":k==="finalAmount"?"Amount":"Status"}
                    <SortIcon k={k}/>
                  </button>
                ))}
                <div className="px-3 py-3 text-center">Print</div>
                <div className="px-3 py-3"/>
              </div>

              {filtered.map((txn,i)=>{
                const sync       = SYNC_META[txn.syncStatus]??SYNC_META.pending;
                const isExpanded = expanded===txn.clientTxnId;
                const isLoading  = loadingItems===txn.clientTxnId;
                const lines      = itemsCache[txn.clientTxnId];
                const printCount = printCounts[txn.clientTxnId]??0;
                const isLast     = i===filtered.length-1;

                return (
                  <div key={txn.clientTxnId} style={{ borderBottom:isLast?"none":`1px solid ${C.muted}` }}>

                    {/* Desktop row */}
                    <div className="hidden sm:grid items-center transition-colors hover:bg-gray-50/50"
                      style={{ gridTemplateColumns:"1.8fr 1fr 130px 90px 52px 44px" }}>

                      {/* Date + ID */}
                      <div className="px-4 py-3.5">
                        <p className="text-xs font-bold" style={{ color:C.fg }}>{formatDate(txn.createdAt)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[10px] font-mono truncate max-w-[190px]" style={{ color:C.mutedFg }}>{txn.clientTxnId}</p>
                          {printCount>0&&(
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full"
                              style={{ background:"rgba(22,163,74,0.1)", color:"#16a34a" }}>
                              <Printer size={8}/>{printCount}×
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Method */}
                      <div className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <CreditCard size={11} style={{ color:C.mutedFg, flexShrink:0 }}/>
                          <p className="text-xs font-bold truncate" style={{ color:C.fg }}>{txn.paymentMethod}</p>
                        </div>
                        {txn.paymentReference&&<p className="text-[10px] mt-0.5 truncate" style={{ color:C.mutedFg }}>{txn.paymentReference}</p>}
                      </div>

                      {/* Amount */}
                      <div className="px-4 py-3.5 text-right">
                        <p className="text-sm font-black" style={{ color:C.orange }}>{money(txn.finalAmount)}</p>
                        {Number(txn.discount)>0&&<p className="text-[10px] font-mono" style={{ color:"#16a34a" }}>−{money(txn.discount)}</p>}
                      </div>

                      {/* Status badge */}
                      <div className="px-3 py-3.5 flex flex-col items-start gap-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg whitespace-nowrap"
                          style={{ background:sync.bg, color:sync.color, border:`1px solid ${sync.border}` }}>
                          {sync.icon}{sync.label}
                        </span>
                        {txn.syncError&&<p className="text-[9px] font-semibold truncate max-w-[80px]" style={{ color:"#dc2626" }}>Error</p>}
                      </div>

                      {/* Print button */}
                      <div className="px-2 py-3.5 flex justify-center">
                        <button onClick={()=>handlePrint(txn)} disabled={printing}
                          className="relative w-8 h-8 rounded-xl flex items-center justify-center border transition-all hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40"
                          style={{ borderColor:C.border, color:C.mutedFg }}
                          title={`Print receipt (printed ${printCount}×)`}>
                          <Printer size={13}/>
                          {printCount>0&&(
                            <span className="absolute -top-1.5 -right-1.5 text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full"
                              style={{ background:"#16a34a", color:"white" }}>{printCount}</span>
                          )}
                        </button>
                      </div>

                      {/* Expand button */}
                      <div className="px-2 py-3.5 flex justify-center">
                        <button onClick={()=>toggleExpand(txn.clientTxnId)}
                          className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all hover:bg-gray-50"
                          style={{ borderColor:C.border, color:C.mutedFg }}>
                          {isLoading?<RefreshCw size={12} className="animate-spin"/>:isExpanded?<ChevronUp size={12}/>:<ChevronRight size={12}/>}
                        </button>
                      </div>
                    </div>

                    {/* Mobile card row */}
                    <div className="sm:hidden px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={()=>toggleExpand(txn.clientTxnId)}>
                          <p className="text-sm font-black" style={{ color:C.fg }}>{money(txn.finalAmount)}</p>
                          <p className="text-xs mt-0.5" style={{ color:C.mutedFg }}>{txn.paymentMethod}</p>
                          <p className="text-[10px] font-mono mt-0.5" style={{ color:C.mutedFg }}>{formatDate(txn.createdAt)}</p>
                          <p className="text-[10px] font-mono" style={{ color:C.border }}>{txn.clientTxnId}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          {/* Status */}
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg"
                            style={{ background:sync.bg, color:sync.color, border:`1px solid ${sync.border}` }}>
                            {sync.icon}{sync.label}
                          </span>
                          {/* Action buttons grouped */}
                          <div className="flex items-center gap-1">
                            <button onClick={()=>handlePrint(txn)} disabled={printing}
                              className="relative w-8 h-8 rounded-xl flex items-center justify-center border"
                              style={{ borderColor:C.border, color:C.mutedFg }}>
                              <Printer size={13}/>
                              {printCount>0&&<span className="absolute -top-1.5 -right-1.5 text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full" style={{ background:"#16a34a", color:"white" }}>{printCount}</span>}
                            </button>
                            <button onClick={()=>toggleExpand(txn.clientTxnId)}
                              className="w-8 h-8 rounded-xl flex items-center justify-center border"
                              style={{ borderColor:C.border, color:C.mutedFg }}>
                              {isExpanded?<ChevronUp size={12}/>:<ChevronRight size={12}/>}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── Expanded line items ── */}
                    {isExpanded&&(
                      <div className="px-4 pb-4 pt-3" style={{ background:C.muted, borderTop:`1px solid ${C.border}` }}>
                        {!lines||isLoading?(
                          <div className="flex items-center justify-center py-4 gap-2">
                            <RefreshCw size={13} className="animate-spin" style={{ color:C.mutedFg }}/>
                            <p className="text-xs" style={{ color:C.mutedFg }}>Loading items…</p>
                          </div>
                        ):lines.length===0?(
                          <p className="text-xs py-4 text-center" style={{ color:C.mutedFg }}>No line items found.</p>
                        ):(
                          <div className="space-y-1.5">
                            {lines.map((li,j)=>(
                              <div key={j} className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-xl"
                                style={{ background:"white", border:`1px solid ${C.border}` }}>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-bold" style={{ color:C.fg }}>{li.productName}</span>
                                  {li.promoApplied&&(
                                    <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full"
                                      style={{ background:"rgba(69,46,90,0.1)", color:C.mid }}>{li.promoApplied}</span>
                                  )}
                                  <p className="text-[10px] font-mono mt-0.5" style={{ color:C.mutedFg }}>
                                    ×{li.quantity} @ {money(li.finalPrice)}
                                  </p>
                                </div>
                                <span className="text-xs font-black font-mono flex-shrink-0" style={{ color:C.fg }}>
                                  {money(Number(li.finalPrice)*Number(li.quantity))}
                                </span>
                              </div>
                            ))}

                            {/* Single total block */}
                            <div className="mt-2 rounded-2xl px-4 py-3" style={{ background:C.deep }}>
                              {Number(txn.discount)>0&&(
                                <div className="flex justify-between text-[11px] mb-1.5">
                                  <span style={{ color:"rgba(255,255,255,0.4)" }}>Savings</span>
                                  <span className="font-mono font-bold" style={{ color:"#4ade80" }}>−{money(txn.discount)}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:"rgba(255,255,255,0.4)" }}>Total Paid</p>
                                  <p className="text-xs font-semibold mt-0.5" style={{ color:"rgba(255,255,255,0.4)" }}>{txn.paymentMethod}</p>
                                </div>
                                <p className="text-2xl font-black" style={{ color:C.orange }}>{money(txn.finalAmount)}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Pagination hint */}
        {!loading&&filtered.length>0&&(
          <p className="text-center text-xs pb-4" style={{ color:C.border }}>
            Showing {filtered.length} transaction{filtered.length!==1?"s":""}
          </p>
        )}
      </div>
    </div>
  );
}

export default function POSHistoryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background:"#1e104e" }}>
        <div className="flex items-center gap-2.5">
          <RefreshCw size={16} className="animate-spin" style={{ color:"rgba(255,101,63,0.7)" }}/>
          <span className="text-sm font-bold" style={{ color:"rgba(255,255,255,0.4)" }}>Loading history…</span>
        </div>
      </div>
    }>
      <HistoryInner/>
    </Suspense>
  );
}