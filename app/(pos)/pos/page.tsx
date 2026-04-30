// app/(pos)/pos/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ScanLine, Plus, Minus, Trash2, ArrowLeft, CheckCircle2,
  Banknote, CreditCard, QrCode, Wallet, Tag, X, Zap,
  LogOut, Package, RefreshCw, Database, CloudUpload,
  AlertCircle, Check, MapPin, Wifi, WifiOff, ArrowRight, ChevronRight,
  BarChart2, TrendingUp, ShoppingBag, DollarSign,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";

type EventRow    = { id: number; name: string; status: string; location: string | null; startDate?: string | null; endDate?: string | null };
type EventItem   = { id: number; eventId: number; stock: number; originalStock?: number; retailPrice: string; netPrice: string; itemId: string; name: string; color: string | null; variantCode: string | null; unit: string | null };
type CartItem    = { eventItemId: number; itemId: string; productName: string; variantCode: string | null; color: string | null; quantity: number; unitPrice: number; discountAmt: number; finalPrice: number; promoApplied: string | null; freeQty: number };
type PayMethod   = { id: number; name: string; type: string; provider: string | null };
type PromoRes    = { finalUnitPrice: number; discountAmt: number; promoName: string | null; freeQty: number };
type LocalBundle = { event: EventRow; items: EventItem[]; promos: unknown[]; paymentMethods: PayMethod[] };
type Screen      = "event-select" | "sell" | "payment" | "success";

const PAY_ICON: Record<string, React.ReactNode> = {
  cash: <Banknote size={16} />, qris: <QrCode size={16} />,
  debit: <CreditCard size={16} />, credit: <CreditCard size={16} />, ewallet: <Wallet size={16} />,
};
const PAY_COLOR: Record<string, string> = {
  cash: "#16a34a", qris: "#7c3aed", debit: "#0369a1", credit: "#b45309", ewallet: "#be185d",
};
const STATUS_STYLE: Record<string, { dot: string; label: string; border: string; bg: string }> = {
  active: { dot: "#16a34a", label: "Live",   border: "rgba(22,163,74,0.3)",   bg: "rgba(22,163,74,0.06)"  },
  draft:  { dot: "#f59e0b", label: "Draft",  border: "rgba(245,158,11,0.25)", bg: "rgba(245,158,11,0.05)" },
  closed: { dot: "#dc2626", label: "Closed", border: "rgba(220,38,38,0.2)",   bg: "rgba(220,38,38,0.04)"  },
};

function money(v: number | string) { return formatRupiah(v); }
function makeClientTxnId(eventId: number) {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `LOCAL-EV${eventId}-${r}`;
}

const KEYFRAMES = `
@keyframes fadeUp   { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
@keyframes pulseDot { 0%,100% { opacity:1 } 50% { opacity:.4 } }
.anim-fade-up       { animation: fadeUp .35s ease both }
`;

function POSInner() {
  const searchParams     = useSearchParams();
  const queryEventId     = searchParams.get("event") ? Number(searchParams.get("event")) : null;
  const forceSelect      = searchParams.get("select") === "1";

  const [events,           setEvents]           = useState<EventRow[]>([]);
  const [event,            setEvent]            = useState<EventRow | null>(null);
  const [items,            setItems]            = useState<EventItem[]>([]);
  const [promos,           setPromos]           = useState<unknown[]>([]);
  const [promoCount,       setPromoCount]       = useState(0);
  const [cart,             setCart]             = useState<CartItem[]>([]);
  const [screen,           setScreen]           = useState<Screen>("event-select");
  const [query,            setQuery]            = useState("");
  const [suggestions,      setSuggestions]      = useState<EventItem[]>([]);
  const [showSug,          setShowSug]          = useState(false);
  const [payMethods,       setPayMethods]       = useState<PayMethod[]>([]);
  const [payMethod,        setPayMethod]        = useState<PayMethod | null>(null);
  const [reference,        setReference]        = useState("");
  const [lastTxn,          setLastTxn]          = useState<string | number | null>(null);
  const [processing,       setProcessing]       = useState(false);
  const [toast,            setToast]            = useState<string | null>(null);
  const [toastErr,         setToastErr]         = useState(false);
  const [online,           setOnline]           = useState(true);
  const [preparing,        setPreparing]        = useState(false);
  const [syncing,          setSyncing]          = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [localReady,       setLocalReady]       = useState(false);
  const [preparedEvents,   setPreparedEvents]   = useState<{ id:number; name:string; status:string; location:string|null; preparedAt:string; pendingSyncCount:number }[]>([]);

  const scanRef = useRef<HTMLInputElement>(null);
  const sugRef  = useRef<HTMLDivElement>(null);

  // Daily report state
  const [showReport,   setShowReport]   = useState(false);
  const [dailyStats,   setDailyStats]   = useState<{
    txnCount: number; revenue: number; discount: number; itemsSold: number;
    todayTxnCount: number; todayRevenue: number; todayDiscount: number; todayItemsSold: number;
    totalUnits: number; totalItems: number;
  } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const subtotal  = useMemo(() => cart.reduce((s,i) => s + i.unitPrice  * i.quantity, 0), [cart]);
  const discount  = useMemo(() => cart.reduce((s,i) => s + i.discountAmt, 0), [cart]);
  const total     = useMemo(() => cart.reduce((s,i) => s + i.finalPrice * i.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((s,i) => s + i.quantity, 0), [cart]);

  function flash(msg: string, err = false) {
    setToast(msg); setToastErr(err);
    setTimeout(() => { setToast(null); setToastErr(false); }, 2800);
  }

  async function loadPreparedEvents() {
    try { const d = await fetch("/api/local/prepared-events",{cache:"no-store"}).then(r=>r.json()); setPreparedEvents(Array.isArray(d.events)?d.events:[]); }
    catch { setPreparedEvents([]); }
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    const on=()=>setOnline(true), off=()=>setOnline(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    return ()=>{ window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  },[]);

  // Auto-sync: fire whenever we come online AND have a loaded event with pending txns
  useEffect(() => {
    if (!online || !event?.id || pendingSyncCount === 0 || syncing) return;
    // Small delay so the "Online" chip appears before sync starts
    const t = setTimeout(() => syncLocalTransactions(event.id), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, event?.id, pendingSyncCount]);

  useEffect(() => {
    async function boot() {
      await loadPreparedEvents();
      if (forceSelect) { setScreen("event-select"); try { setEvents(await fetch("/api/events",{cache:"no-store"}).then(r=>r.json())); } catch {} return; }
      let id = queryEventId;
      if (id) {
        const local = await loadLocalBundle(id);
        if (local) { localStorage.setItem("pos:last-event-id",String(id)); setScreen("sell"); return; }
        if (navigator.onLine) {
          try {
            const evs = await fetch("/api/events",{cache:"no-store"}).then(r=>r.json()); setEvents(evs);
            const t = evs.find((e:EventRow)=>e.id===id); if (t) { await openLocalEvent(t); return; }
          } catch { flash("Could not prepare selected event.",true); }
        }
        flash("Selected event is not prepared locally.",true); setScreen("event-select"); return;
      }
      const saved = localStorage.getItem("pos:last-event-id");
      if (saved && Number.isFinite(Number(saved))) { const l=await loadLocalBundle(Number(saved)); if(l){setScreen("sell");return;} }
      try {
        const state = await fetch("/api/local/pos-state",{cache:"no-store"}).then(r=>r.json());
        if (state?.event?.id) { const l=await loadLocalBundle(Number(state.event.id)); if(l){localStorage.setItem("pos:last-event-id",String(state.event.id));setScreen("sell");return;} }
      } catch {}
      try { setEvents(await fetch("/api/events",{cache:"no-store"}).then(r=>r.json())); } catch { flash("Offline. No prepared POS event found.",true); }
      setScreen("event-select");
    }
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  async function prepareEventOffline(eventId: number) {
    setPreparing(true);
    try {
      const res=await fetch(`/api/local/events/${eventId}/prepare`,{method:"POST"}); const data=await res.json();
      if(!res.ok) throw new Error(data.error||"Failed to prepare.");
      localStorage.setItem("pos:last-event-id",String(eventId)); applyBundle(data.bundle as LocalBundle); setLocalReady(true); flash("Event prepared for offline POS");
      return data.bundle as LocalBundle;
    } catch(e) { flash(e instanceof Error?e.message:"Failed.",true); return null; }
    finally { setPreparing(false); }
  }

  async function loadLocalBundle(eventId: number) {
    try {
      const res=await fetch(`/api/local/events/${eventId}/bundle`,{cache:"no-store"}); const data=await res.json();
      if(!res.ok) throw new Error(data.error||"Not prepared locally.");
      applyBundle(data as LocalBundle); setLocalReady(true); await refreshPendingCount(eventId);
      setScreen("sell"); setTimeout(()=>scanRef.current?.focus(),80); return data as LocalBundle;
    } catch { setLocalReady(false); return null; }
  }

  function applyBundle(b: LocalBundle) { setEvent(b.event); setItems(b.items); setPromos(b.promos); setPayMethods(b.paymentMethods); setPromoCount(b.promos.length); }

  async function openLocalEvent(ev: EventRow) {
    localStorage.setItem("pos:last-event-id",String(ev.id));
    const local = await loadLocalBundle(ev.id); if(local){setScreen("sell");return;}
    if(!navigator.onLine){flash("Offline. Prepare this event locally first.",true);return;}
    const prepared = await prepareEventOffline(ev.id);
    if(prepared){localStorage.setItem("pos:last-event-id",String(ev.id));setScreen("sell");await refreshPendingCount(ev.id);setTimeout(()=>scanRef.current?.focus(),80);}
  }

  async function refreshPendingCount(eventId: number) {
    try {
      const txns=await fetch(`/api/local/events/${eventId}/transactions`,{cache:"no-store"}).then(r=>r.json());
      setPendingSyncCount(Array.isArray(txns)?txns.filter((t:any)=>t.syncStatus==="pending"||t.syncStatus==="failed").length:0);
    } catch { setPendingSyncCount(0); }
  }

  async function syncLocalTransactions(eventId: number) {
    if(!navigator.onLine){flash("Cannot sync while offline.",true);return;}
    setSyncing(true);
    try {
      const res=await fetch(`/api/local/events/${eventId}/sync`,{method:"POST"}); const result=await res.json();
      if(!res.ok) throw new Error(result.error||"Sync failed.");
      await refreshPendingCount(eventId);
      if(result.failed>0){const fe=result.results?.find((r:any)=>!r.ok)?.error; flash(fe?`${result.synced} synced, ${result.failed} failed: ${fe}`:`${result.synced} synced, ${result.failed} failed`,true);return;}
      flash(`${result.synced} transactions synced`);
    } catch(e) { flash(e instanceof Error?e.message:"Sync failed.",true); }
    finally { setSyncing(false); }
  }

  useEffect(() => {
    if(!query.trim()){setSuggestions([]);setShowSug(false);return;}
    const q=query.toLowerCase();
    const m=items.filter(it=>it.itemId.toLowerCase().includes(q)||it.name.toLowerCase().includes(q)||(it.variantCode??"").toLowerCase().includes(q)||(it.color??"").toLowerCase().includes(q)).slice(0,12);
    setSuggestions(m); setShowSug(m.length>0);
  },[query,items]);

  useEffect(()=>{
    const fn=(e:MouseEvent)=>{if(sugRef.current&&!sugRef.current.contains(e.target as Node))setShowSug(false);};
    document.addEventListener("mousedown",fn); return ()=>document.removeEventListener("mousedown",fn);
  },[]);

  async function loadDailyStats(eventId: number) {
    setLoadingStats(true);
    try {
      const data = await fetch(`/api/local/events/${eventId}/stats`, { cache: "no-store" }).then(r => r.json());
      setDailyStats(data);
    } catch { setDailyStats(null); }
    finally { setLoadingStats(false); }
  }

  async function getPromo(item: EventItem): Promise<PromoRes> {
    return { finalUnitPrice: Number(item.netPrice), discountAmt: 0, promoName: null, freeQty: 0 };
  }

  async function addItem(item: EventItem) {
    const eq=cart.find(r=>r.eventItemId===item.id)?.quantity??0;
    // No stock guard — selling past zero is allowed; stock goes negative
    const promo=await getPromo(item);
    const row:CartItem={eventItemId:item.id,itemId:item.itemId,productName:item.name,variantCode:item.variantCode,color:item.color,quantity:eq+1,unitPrice:Number(item.netPrice),discountAmt:promo.discountAmt,finalPrice:promo.finalUnitPrice,promoApplied:promo.promoName,freeQty:promo.freeQty};
    setCart(p=>p.some(r=>r.eventItemId===item.id)?p.map(r=>r.eventItemId===item.id?row:r):[...p,row]);
    setQuery(""); setShowSug(false); setTimeout(()=>scanRef.current?.focus(),50);
  }

  async function changeQty(eventItemId: number, qty: number) {
    if(qty<1){setCart(p=>p.filter(r=>r.eventItemId!==eventItemId));return;}
    const item=items.find(r=>r.id===eventItemId); if(!item)return;
    // No stock guard — allow any quantity
    const promo=await getPromo(item);
    setCart(p=>p.map(r=>r.eventItemId===eventItemId?{...r,quantity:qty,discountAmt:promo.discountAmt,finalPrice:promo.finalUnitPrice,promoApplied:promo.promoName,freeQty:promo.freeQty}:r));
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault(); const q=query.trim().toLowerCase(); if(!q)return;
    const exact=items.find(it=>it.itemId.toLowerCase()===q||it.variantCode?.toLowerCase()===q);
    if(exact){addItem(exact);return;} if(suggestions.length===1){addItem(suggestions[0]);return;} if(suggestions.length===0)flash("Product not found.",true);
  }

  async function confirmPayment() {
    if(!event||!payMethod||cart.length===0)return; setProcessing(true);
    try {
      const label=`${payMethod.name}${payMethod.provider?` (${payMethod.provider})`:""}`;
      const cid=makeClientTxnId(event.id);
      const payload={clientTxnId:cid,totalAmount:subtotal,discount,finalAmount:total,paymentMethod:label,paymentReference:reference||null,createdAt:new Date().toISOString(),
        items:cart.map(it=>({eventItemId:it.eventItemId,itemId:it.itemId,productName:it.productName,quantity:it.quantity,unitPrice:it.unitPrice,discountAmt:it.discountAmt,finalPrice:it.finalPrice,subtotal:it.finalPrice*it.quantity,promoApplied:it.promoApplied}))};
      const res=await fetch(`/api/local/events/${event.id}/transactions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const saved=await res.json(); if(!res.ok)throw new Error(saved.error||"Failed to save.");
      const fresh=await loadLocalBundle(event.id); if(fresh)setItems(fresh.items);
      await refreshPendingCount(event.id); setLastTxn(saved.clientTxnId??cid); setScreen("success");
    } catch(e){ flash(e instanceof Error?e.message:"Failed to save local transaction.",true); }
    finally { setProcessing(false); }
  }

  function nextTransaction() { setCart([]); setPayMethod(null); setReference(""); setQuery(""); setScreen("sell"); setTimeout(()=>scanRef.current?.focus(),80); }
  function exitPOS() { window.location.href = "/"; }

  // ── Event Select ──────────────────────────────────────────────────────────

  if (screen === "event-select") {
    return (
      <div className="min-h-screen" style={{ background: "#fafaf8" }}>
        <style>{KEYFRAMES}</style>

        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl"
            style={{ background: toastErr?"#ef4444":"#16a34a", color:"white" }}>{toast}</div>
        )}

        {/* Header bar */}
        <div style={{ background:"white", borderBottom:"1px solid #e5e7eb" }}>
          <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:"var(--brand-orange)", color:"white" }}>
                <Zap size={17} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight" style={{ color:"#111" }}>Point of Sale</p>
                <p className="text-xs" style={{ color:"#9ca3af" }}>Choose an event to open</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background:online?"rgba(22,163,74,0.08)":"rgba(245,158,11,0.1)", color:online?"#16a34a":"#b45309" }}>
              {online ? <Wifi size={11} /> : <WifiOff size={11} />}
              {online ? "Online" : "Offline"}
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

          {/* Prepared local events */}
          {preparedEvents.length > 0 && (
            <section className="anim-fade-up">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full" style={{ background:"var(--brand-orange)" }} />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color:"#374151" }}>Ready to Sell</p>
              </div>
              <div className="space-y-2">
                {preparedEvents.map((ev, i) => {
                  const s = STATUS_STYLE[ev.status] ?? STATUS_STYLE.draft;
                  return (
                    <button key={ev.id}
                      onClick={()=>{ localStorage.setItem("pos:last-event-id",String(ev.id)); loadLocalBundle(ev.id).then(b=>b&&setScreen("sell")); }}
                      className="anim-fade-up w-full text-left rounded-2xl px-5 py-4 transition-all group hover:shadow-md"
                      style={{ background:"white", border:`1.5px solid ${s.border}`, animationDelay:`${i*55}ms`, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:s.bg }}>
                          <span className="w-2.5 h-2.5 rounded-full block"
                            style={{ background:s.dot, animation:ev.status==="active"?"pulseDot 2s ease-in-out infinite":undefined }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-[15px] truncate" style={{ color:"#111" }}>{ev.name}</p>
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background:s.bg, color:s.dot }}>{s.label}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {ev.location && <span className="flex items-center gap-1 text-xs" style={{ color:"#9ca3af" }}><MapPin size={10}/>{ev.location}</span>}
                            <span className="flex items-center gap-1 text-xs font-medium" style={{ color:"#0369a1" }}><Database size={9}/>Local ready</span>
                            {ev.pendingSyncCount > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md" style={{ background:"rgba(245,158,11,0.1)", color:"#b45309" }}>{ev.pendingSyncCount} unsynced</span>}
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                          style={{ background:"var(--brand-orange)", color:"white" }}>
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Online events */}
          {events.length > 0 && (
            <section className="anim-fade-up" style={{ animationDelay:"80ms" }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full" style={{ background:"#e5e7eb" }} />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color:"#374151" }}>Available Events</p>
              </div>
              <div className="space-y-2">
                {events.map((ev, i) => {
                  const s = STATUS_STYLE[ev.status] ?? STATUS_STYLE.draft;
                  return (
                    <button key={ev.id} onClick={()=>openLocalEvent(ev)} disabled={preparing}
                      className="anim-fade-up w-full text-left rounded-2xl px-5 py-4 transition-all group hover:shadow-sm disabled:opacity-50"
                      style={{ background:"white", border:"1.5px solid #e5e7eb", animationDelay:`${(i+preparedEvents.length)*55}ms`, boxShadow:"0 1px 3px rgba(0,0,0,0.03)" }}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:s.bg }}>
                          <span className="w-2.5 h-2.5 rounded-full block" style={{ background:s.dot }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-[15px] truncate" style={{ color:"#111" }}>{ev.name}</p>
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background:s.bg, color:s.dot }}>{s.label}</span>
                          </div>
                          {ev.location && <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color:"#9ca3af" }}><MapPin size={10}/>{ev.location}</span>}
                        </div>
                        {preparing
                          ? <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0" style={{ background:"rgba(255,101,63,0.08)", color:"var(--brand-orange)" }}><RefreshCw size={11} className="animate-spin"/>Preparing…</div>
                          : <div className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border flex-shrink-0 transition-all group-hover:border-orange-300 group-hover:text-orange-600" style={{ borderColor:"#e5e7eb", color:"#6b7280" }}>Open<ChevronRight size={11}/></div>
                        }
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {preparedEvents.length === 0 && events.length === 0 && (
            <div className="rounded-2xl p-10 text-center anim-fade-up" style={{ background:"white", border:"1.5px solid #e5e7eb" }}>
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background:"#f3f4f6" }}>
                <Package size={20} style={{ color:"#9ca3af" }} />
              </div>
              <p className="font-semibold text-sm mb-1" style={{ color:"#374151" }}>No events available</p>
              <p className="text-xs" style={{ color:"#9ca3af" }}>
                {online ? "No events found. Create one from the dashboard." : "Connect to the internet to load events."}
              </p>
            </div>
          )}

          <div className="text-center pt-2">
            <a href="/" className="text-xs" style={{ color:"#d1d5db" }}>← Back to dashboard</a>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────

  if (screen === "success") {
    return (
      <div className="h-screen w-screen flex items-center justify-center p-4" style={{ background:"#fafaf8" }}>
        <div className="w-full max-w-sm">
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background:"white", border:"1.5px solid #e5e7eb" }}>
            <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom:"2px dashed #e5e7eb" }}>
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background:"rgba(22,163,74,0.1)" }}>
                <CheckCircle2 size={22} style={{ color:"#16a34a" }} />
              </div>
              <p className="font-black text-base" style={{ color:"#111" }}>Sale Saved Locally</p>
              <p className="text-xs font-mono mt-0.5" style={{ color:"#9ca3af" }}>{String(lastTxn)}</p>
              <p className="text-[11px] mt-1.5" style={{ color:"#9ca3af" }}>Sync to cloud when you have a stable connection.</p>
            </div>
            <div className="px-6 py-4 space-y-2" style={{ borderBottom:"1.5px solid #f3f4f6" }}>
              {cart.map(item => (
                <div key={item.eventItemId} className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color:"#111" }}>{item.productName}{item.variantCode&&<span style={{color:"#9ca3af"}}> ({item.variantCode})</span>}</p>
                    <p className="text-xs font-mono" style={{ color:"#9ca3af" }}>{money(item.finalPrice)} × {item.quantity}</p>
                  </div>
                  <p className="text-xs font-bold font-mono flex-shrink-0" style={{ color:"#111" }}>{money(item.finalPrice*item.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-4">
              {discount>0&&<div className="flex justify-between text-xs mb-1"><span style={{color:"#9ca3af"}}>Subtotal</span><span className="font-mono" style={{color:"#9ca3af"}}>{money(subtotal)}</span></div>}
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color:"#9ca3af" }}>Total</span>
                <span className="text-2xl font-black font-mono" style={{ color:"#111" }}>{money(total)}</span>
              </div>
              <p className="text-xs mt-1" style={{ color:"#9ca3af" }}>via {payMethod?.name}{payMethod?.provider?` · ${payMethod.provider}`:""}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={nextTransaction} className="flex-1 rounded-xl py-3.5 text-sm font-black" style={{ background:"var(--brand-orange)", color:"white" }}>Next Sale</button>
            <button onClick={()=>event?.id&&syncLocalTransactions(event.id)} disabled={syncing||!online}
              className="px-4 rounded-xl text-sm font-semibold border disabled:opacity-40" style={{ borderColor:"#e5e7eb", color:"#0369a1", background:"white" }}>
              {syncing?"Syncing…":"Sync"}
            </button>
            <button onClick={exitPOS} className="px-4 rounded-xl text-sm font-semibold border" style={{ borderColor:"#e5e7eb", color:"#9ca3af", background:"white" }}>Exit</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment ───────────────────────────────────────────────────────────────

  if (screen === "payment") {
    const grouped  = Object.entries(payMethods.reduce<Record<string,PayMethod[]>>((a,pm)=>{a[pm.type]=[...(a[pm.type]??[]),pm];return a;},{}));
    const needsRef = payMethod && payMethod.type !== "cash";
    const ss       = STATUS_STYLE[event?.status??"draft"] ?? STATUS_STYLE.draft;

    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background:"#fafaf8" }}>
        <style>{KEYFRAMES}</style>

        {toast&&(
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl pointer-events-none"
            style={{ background:toastErr?"#ef4444":"#16a34a", color:"white" }}>{toast}</div>
        )}

        {/* ── Same topbar as sell screen ─────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 flex-shrink-0"
          style={{ background:"white", borderBottom:"1px solid #e5e7eb", height:52 }}>

          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background:ss.dot, animation:event?.status==="active"?"pulseDot 2s ease-in-out infinite":undefined }} />
            <p className="text-sm font-bold truncate" style={{ color:"#111" }}>{event?.name}</p>
            {event?.location&&(
              <span className="hidden lg:flex items-center gap-1 text-xs flex-shrink-0" style={{ color:"#9ca3af" }}>
                <MapPin size={10}/>{event.location}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{ background:"rgba(3,105,161,0.07)", color:"#0369a1" }}>
              <Database size={9}/>SQLite
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{ background:online?"rgba(22,163,74,0.07)":"rgba(245,158,11,0.1)", color:online?"#16a34a":"#b45309" }}>
              {online?<Wifi size={9}/>:<WifiOff size={9}/>}{online?"Online":"Offline"}
            </span>
            {pendingSyncCount>0&&(
              <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg"
                style={{ background:"rgba(245,158,11,0.1)", color:"#b45309" }}>
                <CloudUpload size={9}/>{pendingSyncCount} unsynced
              </span>
            )}
            {itemCount>0&&(
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                style={{ background:"#f3f4f6", color:"#374151" }}>
                {itemCount} · {money(total)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={()=>{setScreen("sell");setPayMethod(null);setReference("");}}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all"
              style={{ color:"#374151", background:"white", borderColor:"#e5e7eb" }}>
              <ArrowLeft size={11}/><span className="hidden sm:inline">Back</span>
            </button>
          </div>
        </div>

        {/* ── Two-pane body ─────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT — order summary + payment picker */}
          <div className="flex flex-col flex-1 overflow-hidden" style={{ borderRight:"1px solid #e5e7eb" }}>

            {/* Total due header */}
            <div className="px-6 py-5 flex-shrink-0"
              style={{ background:"white", borderBottom:"1px solid #e5e7eb" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color:"#9ca3af" }}>Total Due</p>
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-black tracking-tight" style={{ color:"#111" }}>{money(total)}</p>
                {discount>0&&(
                  <div className="flex items-center gap-1.5">
                    <span className="line-through text-sm" style={{ color:"#d1d5db" }}>{money(subtotal)}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background:"rgba(22,163,74,0.1)", color:"#16a34a" }}>
                      −{money(discount)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment method picker — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color:"#9ca3af" }}>
                Select Payment Method
              </p>

              <div className="space-y-4">
                {grouped.map(([type, methods]) => (
                  <div key={type}>
                    <p className="text-[11px] uppercase tracking-widest mb-2 font-semibold"
                      style={{ color:"#d1d5db" }}>
                      {type === "ewallet" ? "E-Wallet" : type}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {methods.map(pm => {
                        const sel   = payMethod?.id === pm.id;
                        const color = PAY_COLOR[pm.type] ?? "#374151";
                        return (
                          <button key={pm.id}
                            onClick={()=>{setPayMethod(pm);setReference("");}}
                            className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all"
                            style={{
                              background: sel ? `${color}08` : "white",
                              border:     sel ? `2px solid ${color}50` : "1.5px solid #e5e7eb",
                              boxShadow:  sel ? `0 2px 12px ${color}15` : "0 1px 3px rgba(0,0,0,0.03)",
                            }}>
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background: sel ? `${color}15` : "#f3f4f6", color: sel ? color : "#9ca3af" }}>
                              {PAY_ICON[pm.type] ?? <CreditCard size={17} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate"
                                style={{ color: sel ? color : "#111" }}>{pm.name}</p>
                              {pm.provider && (
                                <p className="text-xs truncate" style={{ color:"#9ca3af" }}>{pm.provider}</p>
                              )}
                            </div>
                            {sel && (
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Reference input — shown when non-cash selected */}
              {needsRef && (
                <div className="mt-5">
                  <label className="block text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color:"#9ca3af" }}>
                    Reference / Code
                  </label>
                  <input value={reference} onChange={e=>setReference(e.target.value)}
                    placeholder="EDC approval / QR ref…" autoFocus
                    className="w-full rounded-xl px-4 py-3 text-sm font-mono focus:outline-none"
                    style={{ background:"white", border:"1.5px solid #e5e7eb", color:"#111" }} />
                </div>
              )}
            </div>

            {/* Confirm button — sticky bottom */}
            <div className="px-5 py-4 flex-shrink-0"
              style={{ borderTop:"1px solid #e5e7eb", background:"white" }}>
              <button onClick={confirmPayment} disabled={!payMethod || processing}
                className="w-full rounded-xl py-4 text-base font-black transition-all disabled:opacity-30"
                style={{ background: payMethod ? "var(--brand-orange)" : "#f3f4f6", color: payMethod ? "white" : "#9ca3af" }}>
                {processing ? "Saving locally…" : payMethod ? `Confirm ${money(total)}` : "Choose a method above"}
              </button>
            </div>
          </div>

          {/* RIGHT — read-only receipt (same as cart panel) */}
          <div className="w-72 xl:w-80 flex flex-col flex-shrink-0" style={{ background:"white" }}>

            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom:"1px solid #f3f4f6" }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color:"#9ca3af" }}>
                Receipt <span style={{ color:"var(--brand-orange)" }}>· {itemCount}</span>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-3 space-y-2">
                {cart.map(item => (
                  <div key={item.eventItemId} className="rounded-xl p-3"
                    style={{ background:"#f9fafb", border:"1px solid #e5e7eb" }}>
                    <div className="flex-1 min-w-0 mb-1">
                      <p className="text-sm font-bold truncate" style={{ color:"#111" }}>{item.productName}</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color:"#9ca3af" }}>
                        {item.itemId}{item.variantCode ? ` · ${item.variantCode}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono" style={{ color:"#9ca3af" }}>×{item.quantity}</span>
                      <span className="text-sm font-black" style={{ color:"#111" }}>
                        {money(item.finalPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="flex-shrink-0 px-4 py-4 space-y-1.5"
              style={{ borderTop:"1px solid #f3f4f6" }}>
              <div className="flex justify-between text-xs">
                <span style={{ color:"#9ca3af" }}>Subtotal</span>
                <span className="font-mono" style={{ color:"#374151" }}>{money(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color:"#16a34a" }}>Discount</span>
                  <span className="font-mono" style={{ color:"#16a34a" }}>−{money(discount)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-1.5"
                style={{ borderTop:"1px solid #f3f4f6" }}>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color:"#9ca3af" }}>Total</span>
                <span className="text-2xl font-black" style={{ color:"#111" }}>{money(total)}</span>
              </div>
              {payMethod && (
                <div className="flex items-center gap-2 pt-1 rounded-xl px-3 py-2.5"
                  style={{ background:"rgba(255,101,63,0.05)", border:"1px solid rgba(255,101,63,0.15)" }}>
                  <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background:`${PAY_COLOR[payMethod.type]}18`, color:PAY_COLOR[payMethod.type] ?? "#374151" }}>
                    {PAY_ICON[payMethod.type] ?? <CreditCard size={11}/>}
                  </div>
                  <p className="text-xs font-semibold truncate" style={{ color:"#374151" }}>
                    {payMethod.name}{payMethod.provider ? ` · ${payMethod.provider}` : ""}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sell ──────────────────────────────────────────────────────────────────

  const ss = STATUS_STYLE[event?.status??"draft"] ?? STATUS_STYLE.draft;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background:"#fafaf8" }}>
      <style>{KEYFRAMES}</style>

      {toast&&(
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl pointer-events-none"
          style={{ background:toastErr?"#ef4444":"#16a34a", color:"white" }}>{toast}</div>
      )}

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 flex-shrink-0"
        style={{ background:"white", borderBottom:"1px solid #e5e7eb", height:52 }}>

        {/* Event identity */}
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <span className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background:ss.dot, animation:event?.status==="active"?"pulseDot 2s ease-in-out infinite":undefined }} />
          <p className="text-sm font-bold truncate" style={{ color:"#111" }}>{event?.name}</p>
          {event?.location&&(
            <span className="hidden lg:flex items-center gap-1 text-xs flex-shrink-0" style={{ color:"#9ca3af" }}>
              <MapPin size={10}/>{event.location}
            </span>
          )}
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg"
            style={{ background:"rgba(3,105,161,0.07)", color:"#0369a1" }}>
            <Database size={9}/>SQLite
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg"
            style={{ background:online?"rgba(22,163,74,0.07)":"rgba(245,158,11,0.1)", color:online?"#16a34a":"#b45309" }}>
            {online?<Wifi size={9}/>:<WifiOff size={9}/>}{online?"Online":"Offline"}
          </span>
          {promoCount>0&&(
            <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{ background:"rgba(255,101,63,0.08)", color:"var(--brand-orange)" }}>
              <Tag size={9}/>{promoCount}
            </span>
          )}
          {pendingSyncCount>0?(
            <button onClick={()=>event?.id&&syncLocalTransactions(event.id)} disabled={syncing||!online}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all disabled:opacity-60"
              style={{ background:"rgba(245,158,11,0.1)", color:"#b45309" }}>
              {syncing
                ? <><RefreshCw size={9} className="animate-spin"/>Auto-syncing…</>
                : online
                  ? <><CloudUpload size={9}/>{pendingSyncCount} pending — tap to sync</>
                  : <><CloudUpload size={9}/>{pendingSyncCount} unsynced</>}
            </button>
          ):(localReady&&(
            <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{ background:"rgba(22,163,74,0.07)", color:"#16a34a" }}>
              <Check size={9}/>Synced
            </span>
          ))}
          {itemCount>0&&(
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
              style={{ background:"#f3f4f6", color:"#374151" }}>
              {itemCount} · {money(total)}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={()=>{ setShowReport(true); if(event?.id) loadDailyStats(event.id); }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all"
            style={{ color:"#7c3aed", background:"rgba(124,58,237,0.05)", borderColor:"rgba(124,58,237,0.2)" }}>
            <BarChart2 size={11}/>
            <span className="hidden sm:inline">Report</span>
          </button>
          <button onClick={()=>event?.id&&prepareEventOffline(event.id)} disabled={preparing||!online}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all disabled:opacity-40"
            style={{ color:"#0369a1", background:"white", borderColor:"#e5e7eb" }}>
            {preparing?<RefreshCw size={11} className="animate-spin"/>:<Database size={11}/>}
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={()=>{ setCart([]); setPayMethod(null); setReference(""); setQuery(""); window.location.href="/pos?select=1"; }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all"
            style={{ color:"#374151", background:"white", borderColor:"#e5e7eb" }}>
            <span className="hidden sm:inline">Switch</span>
          </button>
          <button onClick={exitPOS}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all"
            style={{ color:"#9ca3af", background:"white", borderColor:"#e5e7eb" }}>
            <LogOut size={11}/>
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

      {/* ── Two-pane ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: scanner */}
        <div className="flex flex-col flex-1 overflow-hidden" style={{ borderRight:"1px solid #e5e7eb" }}>
          <div className="px-5 py-3.5 flex-shrink-0" style={{ borderBottom:"1px solid #e5e7eb", background:"white" }}>
            <div className="relative" ref={sugRef}>
              <form onSubmit={handleScan}>
                <div className="relative flex items-center">
                  <ScanLine size={15} className="absolute left-4 pointer-events-none" style={{ color:"var(--brand-orange)" }} />
                  <input ref={scanRef} value={query} onChange={e=>setQuery(e.target.value)}
                    onFocus={()=>{ if(suggestions.length)setShowSug(true); }}
                    placeholder="Scan barcode or search products…"
                    className="w-full rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-none"
                    style={{ background:"#f9fafb", border:"1.5px solid #e5e7eb", color:"#111" }} autoFocus />
                  {query&&(
                    <button type="button" onClick={()=>{setQuery("");setShowSug(false);scanRef.current?.focus();}}
                      className="absolute right-3 p-0.5 rounded" style={{ color:"#9ca3af" }}><X size={13}/></button>
                  )}
                </div>
              </form>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!query?(
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background:"#f3f4f6" }}>
                  <ScanLine size={24} style={{ color:"#d1d5db" }} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold" style={{ color:"#9ca3af" }}>Ready to scan</p>
                  <p className="text-xs mt-0.5" style={{ color:"#d1d5db" }}>Selling from local SQLite stock</p>
                </div>
              </div>
            ):suggestions.length===0?(
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Package size={28} style={{ color:"#d1d5db" }} />
                <p className="text-sm" style={{ color:"#9ca3af" }}>No products found for &ldquo;{query}&rdquo;</p>
              </div>
            ):(
              <div className="p-4 space-y-2">
                <p className="text-xs font-semibold px-1 mb-2" style={{ color:"#9ca3af" }}>{suggestions.length} result{suggestions.length>1?"s":""}</p>
                {suggestions.map(item=>{
                  const inCart=cart.find(r=>r.eventItemId===item.id);
                  const stock=Number(item.stock??0);
                  const stockColor = stock < 0 ? "#ef4444" : stock === 0 ? "#f59e0b" : stock <= 5 ? "#f59e0b" : "#16a34a";
                  return (
                    <button key={item.id} onClick={()=>addItem(item)}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all"
                      style={{ background:inCart?"rgba(255,101,63,0.05)":"white", border:inCart?"1.5px solid rgba(255,101,63,0.22)":"1.5px solid #e5e7eb", boxShadow:inCart?"0 1px 6px rgba(255,101,63,0.07)":"0 1px 3px rgba(0,0,0,0.03)" }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
                        style={{ background:inCart?"rgba(255,101,63,0.1)":"#f3f4f6", color:inCart?"var(--brand-orange)":"#9ca3af" }}>
                        {item.name.slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color:"#111" }}>
                          {item.name}
                          {item.variantCode&&<span className="ml-1.5 text-xs font-medium px-1.5 py-0.5 rounded" style={{ background:"#f3f4f6", color:"#6b7280" }}>{item.variantCode}</span>}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs font-mono" style={{ color:"#9ca3af" }}>{item.itemId}</span>
                          {item.color&&<span className="text-xs" style={{ color:"#9ca3af" }}>{item.color}</span>}
                          <span className="text-xs font-semibold" style={{ color: stockColor }}>
                            Stock total: {stock}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-base font-black" style={{ color:"var(--brand-orange)" }}>{money(item.netPrice)}</p>
                        {inCart&&<span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background:"var(--brand-orange)", color:"white" }}>×{inCart.quantity} in cart</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: cart */}
        <div className="w-72 xl:w-80 flex flex-col flex-shrink-0" style={{ background:"white" }}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom:"1px solid #f3f4f6" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color:"#9ca3af" }}>
              Receipt{itemCount>0&&<span style={{ color:"var(--brand-orange)" }}> · {itemCount}</span>}
            </p>
            {cart.length>0&&(
              <button onClick={()=>setCart([])} className="text-[11px] px-2 py-1 rounded-lg" style={{ background:"#fef2f2", color:"#ef4444" }}>Clear</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.length===0?(
              <div className="h-full flex flex-col items-center justify-center px-6 text-center">
                <Package size={28} style={{ color:"#e5e7eb" }} />
                <p className="text-sm font-semibold mt-2" style={{ color:"#9ca3af" }}>Cart is empty</p>
                <p className="text-xs mt-1" style={{ color:"#d1d5db" }}>Scan or search to add items</p>
              </div>
            ):(
              <div className="p-3 space-y-2">
                {cart.map(item=>(
                  <div key={item.eventItemId} className="rounded-xl p-3" style={{ background:"#f9fafb", border:"1px solid #e5e7eb" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color:"#111" }}>{item.productName}</p>
                        <p className="text-xs font-mono mt-0.5" style={{ color:"#9ca3af" }}>{item.itemId}{item.variantCode?` · ${item.variantCode}`:""}</p>
                      </div>
                      <button onClick={()=>setCart(p=>p.filter(r=>r.eventItemId!==item.eventItemId))}
                        className="p-1 rounded-lg flex-shrink-0" style={{ color:"#ef4444", background:"#fee2e2" }}>
                        <Trash2 size={11}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={()=>changeQty(item.eventItemId,item.quantity-1)} className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:"#f3f4f6", color:"#374151" }}><Minus size={11}/></button>
                        <span className="w-7 text-center text-sm font-black" style={{ color:"#111" }}>{item.quantity}</span>
                        <button onClick={()=>changeQty(item.eventItemId,item.quantity+1)} className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:"#f3f4f6", color:"#374151" }}><Plus size={11}/></button>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono" style={{ color:"#9ca3af" }}>{money(item.finalPrice)} each</p>
                        <p className="text-sm font-black" style={{ color:"#111" }}>{money(item.finalPrice*item.quantity)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 px-4 py-4 space-y-3" style={{ borderTop:"1px solid #f3f4f6" }}>
            {cart.length>0&&(
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span style={{color:"#9ca3af"}}>Subtotal</span><span className="font-mono" style={{color:"#374151"}}>{money(subtotal)}</span></div>
                {discount>0&&<div className="flex justify-between text-xs"><span style={{color:"#16a34a"}}>Discount</span><span className="font-mono" style={{color:"#16a34a"}}>−{money(discount)}</span></div>}
                <div className="flex justify-between items-baseline pt-1.5" style={{ borderTop:"1px solid #f3f4f6" }}>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color:"#9ca3af" }}>Total</span>
                  <span className="text-2xl font-black" style={{ color:"#111" }}>{money(total)}</span>
                </div>
              </div>
            )}
            <button onClick={()=>setScreen("payment")} disabled={cart.length===0}
              className="w-full rounded-xl py-3.5 text-sm font-black transition-all disabled:opacity-30"
              style={{ background:cart.length>0?"var(--brand-orange)":"#f3f4f6", color:cart.length>0?"white":"#9ca3af" }}>
              {cart.length>0?`Charge ${money(total)}`:"Scan or search to add items"}
            </button>
            {pendingSyncCount>0?(
              <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background:"#fff7ed" }}>
                <AlertCircle size={13} className="flex-shrink-0" style={{ color:"#b45309" }} />
                <p className="text-xs" style={{ color:"#b45309" }}>{pendingSyncCount} sale{pendingSyncCount>1?"s":""} pending sync</p>
              </div>
            ):localReady?(
              <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background:"#f0fdf4" }}>
                <Check size={13} style={{ color:"#16a34a" }} />
                <p className="text-xs" style={{ color:"#16a34a" }}>All sales synced</p>
              </div>
            ):null}
          </div>
        </div>
      </div>

      {/* ── Daily Report Drawer ──────────────────────────────────────────── */}
      {showReport && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" style={{ background:"rgba(0,0,0,0.18)" }}
            onClick={()=>setShowReport(false)} />

          {/* Panel */}
          <div className="fixed right-0 top-0 h-full z-50 flex flex-col"
            style={{ width:360, background:"white", boxShadow:"-4px 0 32px rgba(0,0,0,0.1)", borderLeft:"1px solid #e5e7eb" }}>

            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom:"1px solid #e5e7eb" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background:"rgba(124,58,237,0.1)", color:"#7c3aed" }}>
                  <BarChart2 size={15} />
                </div>
                <div>
                  <p className="text-sm font-black" style={{ color:"#111" }}>Daily Report</p>
                  <p className="text-xs" style={{ color:"#9ca3af" }}>{event?.name}</p>
                </div>
              </div>
              <button onClick={()=>setShowReport(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background:"#f3f4f6", color:"#6b7280" }}>
                <X size={14}/>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {loadingStats ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <RefreshCw size={20} className="animate-spin" style={{ color:"#d1d5db" }} />
                  <p className="text-xs" style={{ color:"#9ca3af" }}>Loading stats…</p>
                </div>
              ) : dailyStats ? (
                <>
                  {/* Today section */}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest mb-3"
                      style={{ color:"#9ca3af" }}>Today</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { icon:<DollarSign size={14}/>, label:"Revenue",      value:money(dailyStats.todayRevenue),                              color:"var(--brand-orange)", bg:"rgba(255,101,63,0.08)" },
                        { icon:<ShoppingBag size={14}/>, label:"Transactions", value:String(dailyStats.todayTxnCount),                            color:"#0369a1",             bg:"rgba(3,105,161,0.07)"  },
                        { icon:<TrendingUp size={14}/>,  label:"Items Sold",   value:`${dailyStats.todayItemsSold} units`,                        color:"#7c3aed",             bg:"rgba(124,58,237,0.08)" },
                        { icon:<Tag size={14}/>,          label:"Discounts",    value:money(dailyStats.todayDiscount),                             color:"#16a34a",             bg:"rgba(22,163,74,0.07)"  },
                      ].map(({ icon, label, value, color, bg }) => (
                        <div key={label} className="rounded-xl p-3" style={{ background:"#f9fafb", border:"1px solid #e5e7eb" }}>
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-2" style={{ background:bg, color }}>
                            {icon}
                          </div>
                          <p className="text-xs" style={{ color:"#9ca3af" }}>{label}</p>
                          <p className="text-sm font-black mt-0.5 truncate" style={{ color }}>{value}</p>
                        </div>
                      ))}
                    </div>
                    {dailyStats.todayTxnCount > 0 && (
                      <div className="mt-2 rounded-xl p-3 flex items-center justify-between"
                        style={{ background:"rgba(255,101,63,0.05)", border:"1px solid rgba(255,101,63,0.15)" }}>
                        <span className="text-xs" style={{ color:"#9ca3af" }}>Avg per transaction</span>
                        <span className="text-sm font-bold" style={{ color:"var(--brand-orange)" }}>
                          {money(dailyStats.todayRevenue / dailyStats.todayTxnCount)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop:"1px solid #f3f4f6" }} />

                  {/* All time section */}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest mb-3"
                      style={{ color:"#9ca3af" }}>All Time (This Event)</p>
                    <div className="space-y-2">
                      {[
                        { label:"Total Revenue",   value:money(dailyStats.revenue),           color:"var(--brand-orange)" },
                        { label:"Transactions",    value:String(dailyStats.txnCount),          color:"#0369a1"             },
                        { label:"Items Sold",      value:`${dailyStats.itemsSold} units`,      color:"#7c3aed"             },
                        { label:"Total Discounts", value:money(dailyStats.discount),           color:"#16a34a"             },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                          style={{ background:"#f9fafb" }}>
                          <span className="text-xs" style={{ color:"#9ca3af" }}>{label}</span>
                          <span className="text-sm font-bold" style={{ color }}>{value}</span>
                        </div>
                      ))}
                      {dailyStats.txnCount > 0 && (
                        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                          style={{ background:"#f9fafb" }}>
                          <span className="text-xs" style={{ color:"#9ca3af" }}>Avg per transaction</span>
                          <span className="text-sm font-bold" style={{ color:"var(--foreground)" }}>
                            {money(dailyStats.revenue / dailyStats.txnCount)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop:"1px solid #f3f4f6" }} />

                  {/* Stock summary */}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest mb-3"
                      style={{ color:"#9ca3af" }}>Stock Summary</p>
                    <div className="space-y-2">
                      {[
                        { label:"Total Items",        value:String(dailyStats.totalItems),   color:"#374151" },
                        { label:"Remaining Units",    value:String(dailyStats.totalUnits),   color:dailyStats.totalUnits < 0 ? "#ef4444" : dailyStats.totalUnits <= 10 ? "#f59e0b" : "#16a34a" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                          style={{ background:"#f9fafb" }}>
                          <span className="text-xs" style={{ color:"#9ca3af" }}>{label}</span>
                          <span className="text-sm font-bold" style={{ color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <BarChart2 size={24} style={{ color:"#d1d5db" }} />
                  <p className="text-xs text-center" style={{ color:"#9ca3af" }}>
                    Could not load stats.<br/>Check your connection and try again.
                  </p>
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div className="flex-shrink-0 px-5 py-4" style={{ borderTop:"1px solid #e5e7eb" }}>
              <button
                onClick={()=>{ if(event?.id) loadDailyStats(event.id); }}
                disabled={loadingStats}
                className="w-full rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background:"#f3f4f6", color:"#374151" }}>
                <RefreshCw size={11} className={loadingStats?"animate-spin":""} />
                Refresh Stats
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center" style={{ background:"#fafaf8" }}>
        <div className="flex items-center gap-2" style={{ color:"#9ca3af" }}>
          <RefreshCw size={16} className="animate-spin"/>
          <span className="text-sm">Loading POS…</span>
        </div>
      </div>
    }>
      <POSInner />
    </Suspense>
  );
}