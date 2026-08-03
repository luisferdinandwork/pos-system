// app/(pos)/pos/page.tsx
// ─ Layout preserved: left = cart+scanner, right = payment panel
// ─ Styling: brand palette (--brand-deep, --brand-mid, --brand-orange, --brand-yellow)
// ─ Single total display, grouped action buttons, responsive tablet/mobile
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Banknote, BarChart2,
  Building2, Check, CheckCircle2, ChevronDown, ChevronRight,
  CloudUpload, CreditCard, Database, DollarSign, FileSpreadsheet, History, LogOut,
  MapPin, Minus, Package, Plus, Power, Printer, RefreshCw, ScanLine,
  Search, ShoppingBag, Tag, Trash2, TrendingUp, User, Wifi, WifiOff, X, Zap,
} from "lucide-react";
import {
  formatRupiah, suggestedCashAmounts, calculateChange,
  formatRupiahInput, parseRupiahInput,
} from "@/lib/utils";
import { usePrintReceipt, type EventReceiptTemplate } from "@/lib/hooks/usePrintReceipt";
import {
  incrementLocalReceiptPrintCount,
  syncLocalReceiptPrintCounts,
} from "@/lib/receipt-print-counts";
import { CashierSessionModal } from "@/components/pos/CashierSessionModal";
import { useSession, signOut } from "next-auth/react";

// Customer copy + merchant copy, printed automatically when a sale completes.
const DEFAULT_RECEIPT_COPIES = 2;

// ── Types (unchanged) ─────────────────────────────────────────────────────────
type EventRow = {
  id: number;
  code: string;
  name: string;
  status: string;
  location: string | null;
  startDate?: string | null;
  endDate?: string | null;
};type EventItem  = { id: number; eventId: number; stock: number; originalStock?: number; retailPrice: string; netPrice: string; itemId: string; baseItemNo?: string | null; name: string; color: string | null; variantCode: string | null; unit: string | null; };
type CartItem   = { eventItemId: number; itemId: string; baseItemNo?: string | null; productName: string; variantCode: string | null; color: string | null; quantity: number; unitPrice: number; discountAmt: number; finalPrice: number; promoApplied: string | null; freeQty: number; };
type PayMethod  = { id: number; name: string; type: string; edcMethod: string | null; edcMachineId: number | null; provider: string | null; };
type PromoRes   = { finalUnitPrice: number; discountAmt: number; promoName: string | null; freeQty: number };
type PromoTier  = { minQty: number; discountPct?: string | null; discountFix?: string | null; fixedPrice?: string | null };
type PromoItemLink = { eventItemId: number; itemId?: string; name?: string };
type PromoData  = { id: number; name: string; type: string; isActive: boolean; applyToAll: boolean; discountPct: string | null; discountFix: string | null; fixedPrice: string | null; buyQty: number | null; getFreeQty: number | null; spendMinAmount: string | null; bundlePrice: string | null; flashStartTime: string | null; flashEndTime: string | null; minPurchaseQty: number | null; maxUsageCount: number | null; usageCount: number; tiers: PromoTier[]; items: PromoItemLink[]; };
type LocalBundle = { event: EventRow; items: EventItem[]; promos: PromoData[]; paymentMethods: PayMethod[] };
type Screen      = "event-select" | "sell" | "success";
type POSActionDialog = null | "turn-off-local" | "force-turn-off-local" | "delete-event" | "force-delete-event";
type DailyStats = { txnCount: number; revenue: number; discount: number; itemsSold: number; todayTxnCount: number; todayRevenue: number; todayDiscount: number; todayItemsSold: number; totalUnits: number; totalItems: number; };
type EdcGroup   = { machineId: number | null; machineLabel: string; methods: PayMethod[]; };
type CurrentUser = {
  id?: number;
  name: string;
  role: string;   // "admin" | "user"
  eventId?: number | null;
  eventIds?: number[];
};

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { dot: string; label: string; border: string; bg: string; text: string }> = {
  active: { dot: "#22c55e", label: "Live",   border: "rgba(34,197,94,0.3)",  bg: "rgba(34,197,94,0.08)",  text: "#16a34a" },
  draft:  { dot: "#f59e0b", label: "Draft",  border: "rgba(245,158,11,0.3)", bg: "rgba(245,158,11,0.08)", text: "#b45309" },
  closed: { dot: "#ef4444", label: "Closed", border: "rgba(239,68,68,0.3)",  bg: "rgba(239,68,68,0.08)",  text: "#dc2626" },
};

const KEYFRAMES = `
@keyframes fadeUp   { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
@keyframes slideIn  { from { opacity:0; transform:translateX(16px) } to { opacity:1; transform:translateX(0) } }
@keyframes pulseDot { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:.5; transform:scale(.85) } }
@keyframes shimmer  { 0% { opacity:.6 } 50% { opacity:1 } 100% { opacity:.6 } }
.anim-fade-up  { animation: fadeUp  .32s cubic-bezier(.22,1,.36,1) both }
.anim-slide-in { animation: slideIn .28s cubic-bezier(.22,1,.36,1) both }

/* Responsive breakpoints */
@media (max-width: 1024px) {
  .pos-pay-pane   { width: 40% !important; min-width: 240px !important }
}
@media (max-width: 768px) {
  .pos-two-pane   { flex-direction: column !important; overflow-y: auto !important }
  .pos-cart-pane  { width: 100% !important; flex: none !important; max-height: 55vh }
  .pos-pay-pane   { width: 100% !important; flex: none !important; min-width: unset !important; border-left: none !important; border-top: 1px solid var(--border-col) !important }
  .topbar-status  { display: none !important }
  .topbar-label   { display: none !important }
}
`;

// brand-aligned palette tokens (CSS vars from globals.css)
const C = {
  bg:        "var(--background)",          // #f5f4fa
  card:      "var(--card)",                // #fff
  border:    "var(--border)",              // #e2ddf0
  muted:     "var(--muted)",               // #f0edf8
  mutedFg:   "var(--muted-foreground)",    // #7a6a9a
  fg:        "var(--foreground)",          // #1a1040
  primary:   "var(--primary)",             // #ff653f
  secondary: "var(--secondary)",           // #ede9f8
  secFg:     "var(--secondary-foreground)",// #452e5a
  deep:      "var(--brand-deep)",          // #1e104e
  mid:       "var(--brand-mid)",           // #452e5a
  orange:    "var(--brand-orange)",        // #ff653f
  yellow:    "var(--brand-yellow)",        // #ffc85c
};

function money(v: number | string) { return formatRupiah(v); }
function stockTone(s: number) { return s < 0 ? "#ef4444" : s <= 5 ? "#f59e0b" : "#16a34a"; }
function makeClientTxnId(eventCodeOrId: string | number) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    clientTxnId: `LOCAL-EV${eventCodeOrId}-${random}`,
    displayId: null as string | null,
  };
}

function normalizeEventIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => Number(row))
    .filter((row) => Number.isFinite(row) && row > 0);
}

function sortActiveEventsFirst(rows: EventRow[]) {
  return [...rows].sort((a, b) => {
    const statusRank = (status: string) =>
      status === "active" ? 0 : status === "draft" ? 1 : status === "closed" ? 2 : 3;

    const rankDiff = statusRank(a.status) - statusRank(b.status);
    if (rankDiff !== 0) return rankDiff;

    const aTime = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;

    if (aTime !== bTime) return aTime - bTime;

    return a.name.localeCompare(b.name);
  });
}

// ── Promo engine (unchanged logic) ───────────────────────────────────────────
function calculatePromoClient(item: EventItem, quantity: number, cartSubtotal: number, allPromos: PromoData[]): PromoRes {
  const netPrice = Number(item.netPrice);
  const base: PromoRes = { finalUnitPrice: netPrice, discountAmt: 0, promoName: null, freeQty: 0 };
  const applicable = allPromos.filter(p => { if (!p.isActive) return false; if (p.applyToAll) return true; return p.items.some(i => i.eventItemId === item.id); });
  if (!applicable.length) return base;
  let best = { ...base };
  for (const promo of applicable) {
    if (promo.type === "flash") { const now = Date.now(); if (promo.flashStartTime && now < new Date(promo.flashStartTime).getTime()) continue; if (promo.flashEndTime && now > new Date(promo.flashEndTime).getTime()) continue; }
    if (promo.minPurchaseQty && quantity < promo.minPurchaseQty) continue;
    if (promo.maxUsageCount !== null && promo.usageCount >= (promo.maxUsageCount ?? Infinity)) continue;
    let result = { ...base };
    switch (promo.type) {
      case "discount_pct": case "flash": { const pct = parseFloat(String(promo.discountPct ?? 0)) / 100; result.discountAmt = Math.round(netPrice * pct); result.finalUnitPrice = netPrice - result.discountAmt; result.promoName = promo.name; break; }
      case "discount_fix": { result.discountAmt = Math.min(parseFloat(String(promo.discountFix ?? 0)), netPrice); result.finalUnitPrice = netPrice - result.discountAmt; result.promoName = promo.name; break; }
      case "fixed_price":  { const fp = parseFloat(String(promo.fixedPrice ?? netPrice)); result.discountAmt = Math.max(0, netPrice - fp); result.finalUnitPrice = fp; result.promoName = promo.name; break; }
      case "qty_tiered":   { const tier = [...(promo.tiers ?? [])].sort((a,b)=>b.minQty-a.minQty).find(t=>quantity>=t.minQty); if (tier) { if (tier.fixedPrice) { const fp=parseFloat(String(tier.fixedPrice)); result.discountAmt=Math.max(0,netPrice-fp); result.finalUnitPrice=fp; } else if (tier.discountPct) { const pct=parseFloat(String(tier.discountPct))/100; result.discountAmt=Math.round(netPrice*pct); result.finalUnitPrice=netPrice-result.discountAmt; } else if (tier.discountFix) { result.discountAmt=Math.min(parseFloat(String(tier.discountFix)),netPrice); result.finalUnitPrice=netPrice-result.discountAmt; } result.promoName=promo.name; } break; }
      case "buy_x_get_y":  { const buyQty=promo.buyQty??1; const freeQty=promo.getFreeQty??1; if (quantity>=buyQty) { result.freeQty=freeQty*Math.floor(quantity/buyQty); result.promoName=promo.name; } break; }
      case "spend_get_free":{ const minSpend=parseFloat(String(promo.spendMinAmount??0)); if (cartSubtotal>=minSpend) { result.freeQty=1; result.promoName=promo.name; } break; }
      case "bundle":       { const bundlePrice=parseFloat(String(promo.bundlePrice??netPrice)); const itemCount=Math.max((promo.items??[]).length,1); const perItem=bundlePrice/itemCount; result.discountAmt=Math.max(0,netPrice-perItem); result.finalUnitPrice=perItem; result.promoName=promo.name; break; }
    }
    if (result.discountAmt > best.discountAmt || result.freeQty > best.freeQty) best = result;
  }
  return best;
}

// ── Cart quantity input — typeable, with a draft buffer so mid-edit states
// (cleared field, partial digits) don't get clobbered by the committed value ──
function QtyInput({ value, onChange }: { value: number; onChange: (qty: number) => void }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => { setDraft(String(value)); }, [value]);

  function commit() {
    const parsed = parseInt(draft, 10);
    if (!Number.isFinite(parsed)) { setDraft(String(value)); return; }
    if (parsed !== value) onChange(parsed);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="w-10 text-center text-sm font-black bg-transparent focus:outline-none"
      style={{ color: "var(--foreground)" }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function POSInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const queryEventId = searchParams.get("event") ? Number(searchParams.get("event")) : null;
  const forceSelect  = searchParams.get("select") === "1";

  const [events,           setEvents]           = useState<EventRow[]>([]);
  const [event,            setEvent]            = useState<EventRow | null>(null);
  const [items,            setItems]            = useState<EventItem[]>([]);
  const [promos,           setPromos]           = useState<PromoData[]>([]);
  const [promoCount,       setPromoCount]       = useState(0);
  const [cart,             setCart]             = useState<CartItem[]>([]);
  const [screen,           setScreen]           = useState<Screen>("event-select");
  const [query,            setQuery]            = useState("");
  const [suggestions,      setSuggestions]      = useState<EventItem[]>([]);
  const [searchFocused,    setSearchFocused]    = useState(false);
  const [payMethods,       setPayMethods]       = useState<PayMethod[]>([]);
  const [payMethod,        setPayMethod]        = useState<PayMethod | null>(null);
  const [reference,        setReference]        = useState("");
  const [cashTendered,     setCashTendered]     = useState<string>("");
  const [lastTxn,          setLastTxn]          = useState<string | number | null>(null);
  const [processing,       setProcessing]       = useState(false);
  const [toast,            setToast]            = useState<string | null>(null);
  const [toastErr,         setToastErr]         = useState(false);
  const [online,           setOnline]           = useState(true);
  const [preparing,        setPreparing]        = useState(false);
  const [syncing,          setSyncing]          = useState(false);
  // Ref (not state) so it's checked synchronously at call time regardless of
  // which trigger fires (checkout auto-sync, the debounced pendingSyncCount
  // effect, or the manual Sync button) — state alone let two syncs race,
  // since a timer scheduled while `syncing` was still false doesn't get
  // cancelled just because `syncing` flips true before it fires.
  const syncingRef = useRef(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [localReady,       setLocalReady]       = useState(false);
  const [preparedEvents,   setPreparedEvents]   = useState<{ id:number;name:string;status:string;location:string|null;preparedAt:string;pendingSyncCount:number; }[]>([]);
  const [actionDialog,     setActionDialog]     = useState<POSActionDialog>(null);
  const [actionLoading,    setActionLoading]    = useState(false);
  const [actionError,      setActionError]      = useState("");
  const [showReport,       setShowReport]       = useState(false);
  const [dailyStats,       setDailyStats]       = useState<DailyStats | null>(null);
  const [loadingStats,     setLoadingStats]     = useState(false);
  const [expandedEdcGroups,setExpandedEdcGroups]= useState<Set<string>>(new Set());

  const { data: authSession } = useSession();
  const currentUser: CurrentUser | null = authSession?.user
    ? {
        id:       (authSession.user as any).id,
        name:     (authSession.user as any).name     ?? "",
        role:     (authSession.user as any).role     ?? "user",
        eventId:  (authSession.user as any).eventId  ?? null,
        eventIds: normalizeEventIds((authSession.user as any).eventIds),
      }
    : null;
 
  const isAdmin    = currentUser?.role === "admin";
  const isCashier  = currentUser?.role === "user";
  const assignedEventIds = useMemo(
    () => normalizeEventIds(currentUser?.eventIds),
    [currentUser?.eventIds]
  );
  const canAccessEvent = (eventId: number) =>
    isAdmin || assignedEventIds.includes(Number(eventId));

  // ── Event select search/filter state ─────────────────────────────────────
  const [eventSearch,       setEventSearch]       = useState("");
  const [eventStatusFilter, setEventStatusFilter] = useState<"all"|"active"|"draft"|"closed">("active");
  const { printReceipt, printing } = usePrintReceipt();
  const [receiptTemplate,  setReceiptTemplate]  = useState<EventReceiptTemplate | null>(null);
  const [showDrawerCount,  setShowDrawerCount]  = useState(false);
  const [drawerActual,     setDrawerActual]     = useState("");
  const [drawerNotes,      setDrawerNotes]      = useState("");
  const [drawerExpected,   setDrawerExpected]   = useState(0);
  const [drawerSessionId,  setDrawerSessionId]  = useState<number | null>(null);
  const [drawerCashierName,setDrawerCashierName]= useState<string | null>(null);
  const [drawerSaving,     setDrawerSaving]     = useState(false);
  const [lastTxnSnapshot, setLastTxnSnapshot] = useState<{
    clientTxnId:        string;
    displayId:          string;
    cart:               CartItem[];
    payMethod:          PayMethod | null;
    subtotal:           number;
    discount:           number;
    total:              number;
    cashTendered:       number | null;
    changeAmount:       number | null;
    receiptTemplate?:   EventReceiptTemplate | null;
    eventName?:         string | null;
    cashierName?:       string | null;   // ← this was missing
    receiptPrintCount?: number;
  } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [cashierSession, setCashierSession] = useState<{
    id: number;
    cashierName: string;
    openingCash: string;
    openedAt: string;
  } | null>(null);

  const subtotal  = useMemo(() => cart.reduce((s,i) => s + i.unitPrice  * i.quantity, 0), [cart]);
  const discount  = useMemo(() => cart.reduce((s,i) => s + i.discountAmt * i.quantity, 0), [cart]);
  const total     = useMemo(() => cart.reduce((s,i) => s + i.finalPrice  * i.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((s,i) => s + i.quantity, 0), [cart]);

  const isCash          = payMethod?.type === "cash";
  const cashTenderedNum = isCash ? (parseFloat(cashTendered) || 0) : 0;
  const changeNum       = isCash ? calculateChange(cashTenderedNum, total) : 0;
  const cashSuggestions = isCash && total > 0 ? suggestedCashAmounts(total) : [];

  const { cashMethods, edcGroups } = useMemo(() => {
    const cash    = payMethods.filter(m => m.type === "cash");
    const edcRows = payMethods.filter(m => m.type === "edc");
    const groupMap = new Map<string, EdcGroup>();
    for (const m of edcRows) {
      const key = m.edcMachineId != null ? String(m.edcMachineId) : "unassigned";
      if (!groupMap.has(key)) groupMap.set(key, { machineId: m.edcMachineId, machineLabel: m.provider ?? "EDC Machine", methods: [] });
      groupMap.get(key)!.methods.push(m);
    }
    return { cashMethods: cash, edcGroups: [...groupMap.values()] };
  }, [payMethods]);

  function flash(msg: string, err = false) {
    setToast(msg); setToastErr(err);
    setTimeout(() => { setToast(null); setToastErr(false); }, 2800);
  }

  // ── API helpers (all logic unchanged) ────────────────────────────────────
  async function loadPreparedEvents() {
    try { const d = await fetch("/api/local/prepared-events",{cache:"no-store"}).then(r=>r.json()); setPreparedEvents(Array.isArray(d.events)?d.events:[]); } catch { setPreparedEvents([]); }
  }

  async function loadEventsForCurrentUser() {
    const url = isAdmin ? "/api/events" : "/api/pos/events";
    const data = await fetch(url, { cache: "no-store" }).then((r) => r.json());
    const rows = Array.isArray(data) ? data : Array.isArray(data.events) ? data.events : [];
    const sorted = sortActiveEventsFirst(rows as EventRow[]);
    setEvents(sorted);
    return sorted;
  }

  async function getReceiptTemplateForPrint() {
    if (lastTxnSnapshot?.receiptTemplate) {
      return lastTxnSnapshot.receiptTemplate;
    }

    if (receiptTemplate) {
      return receiptTemplate;
    }

    if (!event?.id) {
      return null;
    }

    const freshTemplate = await loadReceiptTemplate(event.id);

    if (freshTemplate) {
      setLastTxnSnapshot((prev) =>
        prev
          ? {
              ...prev,
              receiptTemplate: freshTemplate,
            }
          : prev
      );
    }

    return freshTemplate;
  }

  async function loadReceiptTemplate(eventId: number) {
    try { const res=await fetch(`/api/events/${eventId}/receipt-template`,{cache:"no-store"}); const d=await res.json(); setReceiptTemplate(res.ok?d:null); return res.ok?d as EventReceiptTemplate:null; } catch { setReceiptTemplate(null); return null; }
  }

  async function loadActiveCashierSession(eventId: number) {
    try {
      const res  = await fetch(`/api/local/events/${eventId}/cashier-session`, { cache: "no-store" });
      if (!res.ok) { setCashierSession(null); return null; }
      const data = await res.json();
      if (data?.id) {
        setCashierSession(data);
        return data;
      }
      setCashierSession(null);
      return null;
    } catch {
      setCashierSession(null);
      return null;
    }
  }

  function applyBundle(bundle: LocalBundle) {
    setEvent(bundle.event); setItems(bundle.items); setPromos(bundle.promos as PromoData[]); setPayMethods(bundle.paymentMethods); setPromoCount(bundle.promos.length); void loadReceiptTemplate(bundle.event.id);
    const keys = new Set<string>(); for (const m of bundle.paymentMethods.filter(m=>m.type==="edc")) keys.add(m.edcMachineId!=null?String(m.edcMachineId):"unassigned"); setExpandedEdcGroups(keys);
  }
  async function loadLocalBundle(eventId: number) {
    try { const res=await fetch(`/api/local/events/${eventId}/bundle`,{cache:"no-store"}); const d=await res.json(); if (!res.ok) throw new Error(d.error); applyBundle(d as LocalBundle); setLocalReady(true); await refreshPendingCount(eventId); setScreen("sell"); await loadActiveCashierSession(eventId); return d as LocalBundle; } catch { setLocalReady(false); return null; }
  }
  async function prepareEventOffline(eventId: number, silent=false) {
    setPreparing(true);
    try { const res=await fetch(`/api/local/events/${eventId}/prepare`,{method:"POST"}); const d=await res.json(); if (!res.ok) throw new Error(d.error); localStorage.setItem("pos:last-event-id",String(eventId)); applyBundle(d.bundle as LocalBundle); setLocalReady(true); if (!silent) flash("Event prepared for offline POS"); return d.bundle as LocalBundle; } catch(e) { if (!silent) flash(e instanceof Error?e.message:"Failed.",true); return null; } finally { setPreparing(false); }
  }
  async function openLocalEvent(ev: EventRow) {
    if (!canAccessEvent(ev.id)) {
      flash("You are not assigned to this event.", true);
      return;
    }

    localStorage.setItem("pos:last-event-id",String(ev.id));
    const local = await loadLocalBundle(ev.id);
    if (local) { setScreen("sell"); return; }
    if (!navigator.onLine) { flash("Offline. Prepare this event locally first.",true); return; }
    const prepared = await prepareEventOffline(ev.id);
    if (prepared) { setScreen("sell"); await refreshPendingCount(ev.id); }
  }
  async function refreshPendingCount(eventId: number) {
    try { const txns=await fetch(`/api/local/events/${eventId}/transactions`,{cache:"no-store"}).then(r=>r.json()); setPendingSyncCount(Array.isArray(txns)?txns.filter((t:any)=>t.syncStatus==="pending"||t.syncStatus==="failed").length:0); } catch { setPendingSyncCount(0); }
  }

  async function syncLocalTransactions(eventId: number) {
    if (!navigator.onLine) {
      flash("Cannot sync while offline.", true);
      return;
    }

    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);

    try {
      const res = await fetch(`/api/local/events/${eventId}/sync`, {
        method: "POST",
      });

      const result = await res.json().catch(() => null);

      if (!res.ok && res.status !== 207) {
        throw new Error(result?.error ?? "Failed to sync local transactions.");
      }

      await refreshPendingCount(eventId);

      // Pull fresh event/items/promos down from the cloud too — "Sync" only
      // used to push local sales up and re-read the (still stale) local
      // snapshot, so edits made on the events page never showed up here
      // until someone separately clicked "Refresh". Re-pulling after a
      // successful push keeps local stock in step with what the cloud now
      // reflects for the sales that just synced.
      await prepareEventOffline(eventId, true);

      if (Number(result?.failed ?? 0) > 0) {
        const firstError = result?.results?.find((r: any) => !r.ok)?.error;

        flash(
          `${result.synced} synced, ${result.failed} failed${
            firstError ? `: ${firstError}` : "."
          }`,
          true
        );

        return;
      }

      if (Number(result?.synced ?? 0) > 0) {
        flash(`${result.synced} transaction(s) synced to cloud.`);
        return;
      }

      flash("No pending transactions to sync.");
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Sync failed.",
        true
      );
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  async function loadDailyStats(eventId: number) {
    setLoadingStats(true);
    try { const d=await fetch(`/api/local/events/${eventId}/stats`,{cache:"no-store"}).then(r=>r.json()); setDailyStats(d); } catch { setDailyStats(null); } finally { setLoadingStats(false); }
  }

  function getPromo(item: EventItem, qty: number, sub=0): PromoRes { return calculatePromoClient(item, qty, sub, promos); }
  
  async function addItem(item: EventItem) {
    const existingQty =
      cart.find((row) => row.eventItemId === item.id)?.quantity ?? 0;

    const newQty = existingQty + 1;

    const otherSub = cart
      .filter((row) => row.eventItemId !== item.id)
      .reduce((sum, row) => sum + row.finalPrice * row.quantity, 0);

    const promo = getPromo(item, newQty, otherSub);

    const row: CartItem = {
      eventItemId: item.id,
      itemId: item.itemId,
      baseItemNo: item.baseItemNo,
      productName: item.name,
      variantCode: item.variantCode,
      color: item.color,
      quantity: newQty,
      unitPrice: Number(item.netPrice),
      discountAmt: promo.discountAmt,
      finalPrice: promo.finalUnitPrice,
      promoApplied: promo.promoName,
      freeQty: promo.freeQty,
    };

    setCart((prev) =>
      prev.some((cartRow) => cartRow.eventItemId === item.id)
        ? prev.map((cartRow) =>
            cartRow.eventItemId === item.id ? row : cartRow
          )
        : [...prev, row]
    );

    // Clearing the query already hides the suggestions overlay (it requires
    // both searchFocused AND a non-empty query) — don't also flip
    // searchFocused here. The input never actually loses DOM focus when a
    // suggestion is picked (rows use onMouseDown preventDefault), so setting
    // this to false would desync it from real focus and the overlay would
    // stay hidden on the next keystroke until the input is blurred/refocused.
    setQuery("");
  }

  async function changeQty(eventItemId: number, qty: number) {
    if (qty<1) { setCart(prev=>prev.filter(r=>r.eventItemId!==eventItemId)); return; }
    const item = items.find(r=>r.id===eventItemId); if (!item) return;
    const otherSub = cart.filter(r=>r.eventItemId!==eventItemId).reduce((s,r)=>s+r.finalPrice*r.quantity,0);
    const promo = getPromo(item,qty,otherSub);
    setCart(prev=>prev.map(r=>r.eventItemId===eventItemId?{...r,quantity:qty,discountAmt:promo.discountAmt,finalPrice:promo.finalUnitPrice,promoApplied:promo.promoName,freeQty:promo.freeQty}:r));
  }
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault(); const q=query.trim().toLowerCase(); if (!q) return;
    const exact=items.find(it=>it.itemId.toLowerCase()===q||it.variantCode?.toLowerCase()===q);
    if (exact) { addItem(exact); return; }
    if (suggestions.length===1) { addItem(suggestions[0]); return; }
    if (suggestions.length===0) flash("Product not found.",true);
  }

  async function confirmPayment() {
    if (!event || !payMethod || cart.length === 0) return;
 
    if (isCash && cashTenderedNum < total) {
      flash("Cash tendered is less than the total amount.", true);
      return;
    }
 
    setProcessing(true);
 
    try {
      const label = `${payMethod.name}${
        payMethod.provider ? ` (${payMethod.provider})` : ""
      }`;
 
      const ids = makeClientTxnId(event.code || event.id);
 
      const tenderedVal = isCash && cashTenderedNum > 0 ? cashTenderedNum : null;
      const changeVal   = isCash && cashTenderedNum > 0 ? changeNum : null;
 
      const payload = {
        clientTxnId:      ids.clientTxnId,
        displayId:        ids.displayId,
        totalAmount:      subtotal,
        discount,
        finalAmount:      total,
        paymentMethod:    label,
        paymentReference: reference || null,
        cashTendered:     tenderedVal,
        changeAmount:     changeVal,
        cashierSessionId: cashierSession?.id ?? null,
        cashierName:      cashierSession?.cashierName ?? null,
        createdAt:        new Date().toISOString(),
        items: cart.map((item) => ({
          eventItemId:  item.eventItemId,
          itemId:       item.itemId,
          productName:  item.productName,
          quantity:     item.quantity,
          unitPrice:    item.unitPrice,
          discountAmt:  item.discountAmt,
          finalPrice:   item.finalPrice,
          subtotal:     item.finalPrice * item.quantity,
          promoApplied: item.promoApplied,
        })),
      };
 
      const res = await fetch(`/api/local/events/${event.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
 
      const saved = await res.json();
 
      if (!res.ok) {
        throw new Error(saved.error || "Failed to save local transaction.");
      }
 
      if (navigator.onLine) {
        try {
          await syncLocalTransactions(event.id);
        } catch (syncError) {
          console.warn("[POS] Auto-sync failed:", syncError);
        }
      }
 
      const fresh = await loadLocalBundle(event.id);
      if (fresh) setItems(fresh.items);
 
      await refreshPendingCount(event.id);
 
      const savedClientTxnId = saved.clientTxnId ?? ids.clientTxnId;
      const savedDisplayId   = saved.displayId   ?? ids.displayId ?? savedClientTxnId;
 
      setLastTxn(savedDisplayId);
 
      setLastTxnSnapshot({
        clientTxnId:       savedClientTxnId,
        displayId:         savedDisplayId,
        cart:              [...cart],
        payMethod,
        subtotal,
        discount,
        total,
        cashTendered:      tenderedVal,
        changeAmount:      changeVal,
        receiptTemplate,
        eventName:         event.name,
        cashierName:       cashierSession?.cashierName ?? null,  // ← added
        receiptPrintCount: Number(saved.receiptPrintCount ?? 0),
      });
 
      setScreen("success");
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Failed to save local transaction.",
        true
      );
    } finally {
      setProcessing(false);
    }
  }

  async function turnOffLocalPOS(force=false) {
    if (!event?.id) return; setActionLoading(true); setActionError("");
    try { const res=await fetch(`/api/local/events/${event.id}${force?"?force=true":""}`,{method:"DELETE"}); const result=await res.json(); if (!res.ok) { if (res.status===409){setActionDialog("force-turn-off-local");setActionError(result.error);return;} throw new Error(result.error); } localStorage.removeItem("pos:last-event-id"); setActionDialog(null); setActionError(""); router.push("/pos?select=1"); } catch(e) { setActionError(e instanceof Error?e.message:"Failed."); } finally { setActionLoading(false); }
  }

  async function deleteCurrentEvent(forceLocalDelete=false) {
    if (!event?.id) return; setActionLoading(true); setActionError("");
    try { const res=await fetch(`/api/events?id=${event.id}${forceLocalDelete?"&forceLocalDelete=true":""}`,{method:"DELETE"}); const result=await res.json(); if (!res.ok) { if (res.status===409&&result.code==="LOCAL_POS_HAS_UNSYNCED_SALES"){setActionDialog("force-delete-event");setActionError(result.error);return;} throw new Error(result.error); } localStorage.removeItem("pos:last-event-id"); setActionDialog(null); setActionError(""); router.push("/events"); } catch(e) { setActionError(e instanceof Error?e.message:"Failed."); } finally { setActionLoading(false); }
  }
  
  function nextTransaction() {
    setCart([]); setPayMethod(null); setReference(""); setCashTendered(""); setQuery("");
    setScreen("sell");
    // NOTE: do NOT reset cashierSession here — the same cashier continues selling
  }

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setOnline(navigator.onLine);
    const on=()=>setOnline(true), off=()=>setOnline(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    return ()=>{ window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  },[]);
  useEffect(()=>{ if (!online||!event?.id||pendingSyncCount===0||syncing) return; const t=setTimeout(()=>syncLocalTransactions(event.id),1500); return ()=>clearTimeout(t); },[online,event?.id,pendingSyncCount]);
  useEffect(()=>{
    if (!authSession?.user) return;

    async function boot() {
      await loadPreparedEvents();

      if (!isAdmin && assignedEventIds.length === 0) {
        setEvents([]);
        setScreen("event-select");
        flash("This cashier is not assigned to any event.", true);
        return;
      }

      if (forceSelect) {
        setScreen("event-select");
        if (navigator.onLine) {
          try { await loadEventsForCurrentUser(); } catch {}
        }
        return;
      }

      if (queryEventId) {
        if (!canAccessEvent(queryEventId)) {
          router.replace("/pos?select=1");
          setScreen("event-select");
          if (navigator.onLine) {
            try { await loadEventsForCurrentUser(); } catch {}
          }
          flash("You are not assigned to that event.", true);
          return;
        }

        const local=await loadLocalBundle(queryEventId);
        if (local){localStorage.setItem("pos:last-event-id",String(queryEventId));setScreen("sell");return;}
        if (navigator.onLine) {
          try {
            const evs=await loadEventsForCurrentUser();
            const t=evs.find((ev:EventRow)=>ev.id===queryEventId);
            if(t){await openLocalEvent(t);return;}
          } catch { flash("Could not prepare selected event.",true); }
        }
        flash("Selected event is not prepared locally.",true);
        setScreen("event-select");
        return;
      }

      const saved=localStorage.getItem("pos:last-event-id");
      if (saved&&Number.isFinite(Number(saved))&&canAccessEvent(Number(saved))){
        const l=await loadLocalBundle(Number(saved));
        if(l){setScreen("sell");return;}
      }

      try {
        const state=await fetch("/api/local/pos-state",{cache:"no-store"}).then(r=>r.json());
        if(state?.event?.id && canAccessEvent(Number(state.event.id))){
          const l=await loadLocalBundle(Number(state.event.id));
          if(l){localStorage.setItem("pos:last-event-id",String(state.event.id));setScreen("sell");return;}
        }
      } catch {}

      try { await loadEventsForCurrentUser(); } catch { flash("Offline. No prepared POS event found.",true); }
      setScreen("event-select");
    }
    boot();
  },[authSession?.user, forceSelect, queryEventId, isAdmin, assignedEventIds.join(",")]);
  useEffect(()=>{ if (!query.trim()){setSuggestions([]);return;} const q=query.toLowerCase(); setSuggestions(items.filter(it=>it.itemId.toLowerCase().includes(q)||it.name.toLowerCase().includes(q)||(it.variantCode??"").toLowerCase().includes(q)||(it.color??"").toLowerCase().includes(q)).slice(0,24)); },[query,items]);
  useEffect(()=>{ setCashTendered(""); },[payMethod]);

  // ── Sub-components ────────────────────────────────────────────────────────
  function ModalShell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        style={{ background: "rgba(30,16,78,0.65)", backdropFilter: "blur(8px)" }}
        onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
        {children}
      </div>
    );
  }

  function POSActionModal() {
    if (!actionDialog||!event) return null;
    const isForceTurnOff = actionDialog==="force-turn-off-local";
    const isTurnOff      = actionDialog==="turn-off-local"||actionDialog==="force-turn-off-local";
    const isForceDelete  = actionDialog==="force-delete-event";
    const isDelete       = actionDialog==="delete-event"||actionDialog==="force-delete-event";
    const isDanger       = isDelete||isForceTurnOff;
    const title          = isDelete?(isForceDelete?"Force Delete Event?":"Delete Event?"):(isForceTurnOff?"Force Turn Off Local POS?":"Turn Off Local POS?");
    const description    = isDelete?(isForceDelete?"This will delete the cloud event and force remove local POS data. Unsynced sales will be lost.":"This will delete the event from the system and remove its local POS data."):(isForceTurnOff?"This will remove local POS data even with unsynced sales. Unsynced sales will be lost.":"This will turn off the prepared local POS on this computer. The cloud event will remain.");
    const confirmLabel   = isDelete?(isForceDelete?"Force Delete Event":"Delete Event"):(isForceTurnOff?"Force Turn Off":"Turn Off Local POS");
    const confirmBg      = isDanger?"#dc2626":"#b45309";

    return (
      <ModalShell onClose={()=>{setActionDialog(null);setActionError("");}}>
        <div className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden anim-fade-up" style={{ background:"white" }}>
          <div className="p-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: isDanger?"rgba(220,38,38,0.08)":"rgba(245,158,11,0.08)", color:confirmBg }}>
                {isDelete?<Trash2 size={22}/>:<Power size={22}/>}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-black" style={{ color:C.fg }}>{title}</h2>
                <p className="text-sm mt-1 leading-relaxed" style={{ color:C.mutedFg }}>{description}</p>
                <div className="mt-4 rounded-2xl px-4 py-3" style={{ background:C.muted, border:`1px solid ${C.border}` }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color:C.mutedFg }}>Event</p>
                  <p className="text-sm font-black truncate" style={{ color:C.fg }}>{event.name}</p>
                  {event.location&&<p className="text-xs mt-0.5 flex items-center gap-1" style={{ color:C.mutedFg }}><MapPin size={10}/>{event.location}</p>}
                </div>
                {pendingSyncCount>0&&(
                  <div className="mt-3 rounded-2xl px-4 py-3 flex gap-2" style={{ background:"rgba(245,158,11,0.08)", color:"#b45309" }}>
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/>
                    <p className="text-xs leading-relaxed">{pendingSyncCount} local sale{pendingSyncCount>1?"s":""} still pending sync.</p>
                  </div>
                )}
                {actionError&&<div className="mt-3 rounded-2xl px-4 py-3 text-xs font-semibold" style={{ background:"#fef2f2",color:"#dc2626" }}>{actionError}</div>}
              </div>
            </div>
          </div>
          <div className="px-6 py-4 flex gap-2 justify-end" style={{ background:C.muted, borderTop:`1px solid ${C.border}` }}>
            <button onClick={()=>{setActionDialog(null);setActionError("");}} disabled={actionLoading}
              className="px-5 py-2.5 rounded-xl text-sm font-bold border disabled:opacity-50 transition-all hover:bg-white"
              style={{ background:"white", borderColor:C.border, color:C.secFg }}>Cancel</button>
            <button onClick={()=>isDelete?deleteCurrentEvent(isForceDelete):isTurnOff&&turnOffLocalPOS(isForceTurnOff)}
              disabled={actionLoading}
              className="px-5 py-2.5 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background:confirmBg, color:"white" }}>
              {actionLoading?"Processing…":confirmLabel}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  function SearchResultsOverlay() {
    if (!searchFocused||!query.trim()) return null;
    return (
      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[120] rounded-2xl shadow-2xl overflow-hidden anim-fade-up"
        style={{ background:"white", border:`1px solid ${C.border}`, boxShadow:"0 20px 60px rgba(30,16,78,0.18)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom:`1px solid ${C.muted}` }}>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:C.mutedFg }}>
            {suggestions.length} result{suggestions.length!==1?"s":""} — press Enter for exact match
          </p>
          <button type="button" onClick={()=>{setQuery("");setSearchFocused(false);scanRef.current?.focus();}} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-50" style={{ color:C.mutedFg }}><X size={13}/></button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {suggestions.length===0?(
            <div className="py-10 text-center">
              <Package size={28} className="mx-auto mb-2.5" style={{ color:C.border }}/>
              <p className="text-sm font-bold" style={{ color:C.mutedFg }}>No products found</p>
              <p className="text-xs mt-0.5" style={{ color:C.border }}>Try item ID, name, variant, or color.</p>
            </div>
          ):(
            <div className="space-y-1.5">
              {suggestions.map(item => {
                const inCart = cart.find(r=>r.eventItemId===item.id);
                const stock  = Number(item.stock??0);
                const previewQty = (inCart?.quantity??0)+1;
                const otherSub   = cart.filter(r=>r.eventItemId!==item.id).reduce((s,r)=>s+r.finalPrice*r.quantity,0);
                const preview    = calculatePromoClient(item,previewQty,otherSub,promos);
                const hasDiscount= preview.discountAmt>0||preview.freeQty>0;
                return (
                  <button key={item.id} type="button"
                    onMouseDown={e=>e.preventDefault()} onClick={()=>addItem(item)}
                    className="w-full text-left rounded-xl p-3 transition-all"
                    style={{ background:inCart?"rgba(255,101,63,0.05)":"#fafaf8", border:`1.5px solid ${inCart?"rgba(255,101,63,0.3)":C.border}` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
                        style={{ background:inCart?"rgba(255,101,63,0.12)":C.muted, color:inCart?C.orange:C.mutedFg }}>
                        {item.name.slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black truncate" style={{ color:C.fg }}>{item.name}</p>
                        <p className="text-xs font-mono mt-0.5 truncate" style={{ color:C.mutedFg }}>{item.itemId}{item.variantCode?` · ${item.variantCode}`:""}</p>
                        {hasDiscount&&preview.promoName&&(
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background:"rgba(69,46,90,0.12)", color:C.mid }}>
                            <Tag size={8}/>{preview.promoName}{preview.discountAmt>0?` · -${money(preview.discountAmt)}`:""}{preview.freeQty>0?` · +${preview.freeQty} free`:""}
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {hasDiscount&&preview.discountAmt>0?(
                          <><p className="text-xs line-through" style={{ color:C.border }}>{money(item.netPrice)}</p>
                          <p className="text-sm font-black" style={{ color:C.orange }}>{money(preview.finalUnitPrice)}</p></>
                        ):(
                          <p className="text-sm font-black" style={{ color:C.orange }}>{money(item.netPrice)}</p>
                        )}
                        <span className="inline-flex mt-1 text-[10px] font-black px-2 py-1 rounded-lg" style={{ background:stock<0?"#fef2f2":C.muted, color:stockTone(stock) }}>
                          Stock {stock.toLocaleString("id-ID")}
                        </span>
                        {inCart&&<p className="text-[10px] font-bold mt-1" style={{ color:C.orange }}>×{inCart.quantity} in cart</p>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  function PaymentSuccessOverlay() {
    if (screen !== "success") return null;

    const snap = lastTxnSnapshot;
    const snapCart = snap?.cart ?? cart;
    const snapPay = snap?.payMethod ?? payMethod;
    const snapDiscount = snap?.discount ?? discount;
    const snapTotal = snap?.total ?? total;
    const snapQty = snapCart.reduce((sum, item) => sum + item.quantity, 0);
    const snapCash = snap?.cashTendered ?? null;
    const snapChange = snap?.changeAmount ?? null;
    const snapCashier = snap?.cashierName ?? cashierSession?.cashierName ?? null;
    const printCount = Number(snap?.receiptPrintCount ?? 0);

    async function handlePrintSuccess(copies = DEFAULT_RECEIPT_COPIES) {
      if (!snap) return;

      /**
       * Receipt print number logic:
       * current count 0 → next print 1 → original receipt, no re-print marker
       * current count 1 → next print 2 → RE-PRINTED #2
       * current count 2 → next print 3 → RE-PRINTED #3
       */
      const currentPrintCount = Number(snap.receiptPrintCount ?? 0);
      const nextPrintNumber = currentPrintCount + 1;

      /**
       * Important:
       * Always resolve the latest event receipt template before printing.
       * Without this, snap.receiptTemplate can be null because loadReceiptTemplate()
       * runs async when opening/preparing the event.
       */
      const templateForPrint = await getReceiptTemplateForPrint();

      const txnForPrint = {
        clientTxnId: snap.clientTxnId,
        displayId: snap.displayId,
        eventName: snap.eventName ?? event?.name ?? null,
        cashierName: snap.cashierName ?? cashierSession?.cashierName ?? null,
        totalAmount: String(snap.subtotal),
        discount: String(snap.discount),
        finalAmount: String(snap.total),
        paymentMethod: snapPay?.provider
          ? `${snapPay.name} (${snapPay.provider})`
          : snapPay?.name ?? "—",
        paymentReference: reference || null,
        cashTendered:
          snap.cashTendered != null ? String(snap.cashTendered) : null,
        changeAmount:
          snap.changeAmount != null ? String(snap.changeAmount) : null,
        createdAt: new Date().toISOString(),
      };

      const itemsForPrint = snap.cart.map((item) => ({
        itemId: item.itemId,
        baseItemNo: item.baseItemNo,
        productName: item.productName,
        color: item.color,
        variantCode: item.variantCode,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        discountAmt: String(item.discountAmt),
        finalPrice: String(item.finalPrice),
        subtotal: String(item.finalPrice * item.quantity),
        promoApplied: item.promoApplied,
      }));

      await printReceipt(txnForPrint, itemsForPrint, {
        template: templateForPrint,
        eventName: snap.eventName ?? event?.name ?? null,
        cashierName: snap.cashierName ?? cashierSession?.cashierName ?? null,
        printNumber: nextPrintNumber,
        copies,
      });

      const result = await incrementLocalReceiptPrintCount(snap.clientTxnId);

      const nextCount =
        typeof result === "number"
          ? result
          : Number((result as any)?.receiptPrintCount ?? nextPrintNumber);

      setLastTxnSnapshot((prev) =>
        prev
          ? {
              ...prev,
              receiptTemplate: templateForPrint,
              receiptPrintCount: nextCount,
            }
          : prev
      );

      if (event?.id && navigator.onLine) {
        try {
          await syncLocalReceiptPrintCounts(event.id);
        } catch (error) {
          console.warn("[POS] Receipt print count sync failed:", error);
        }
      }

      flash(
        nextCount > 1
          ? `Receipt re-printed #${nextCount}`
          : "Receipt printed"
      );
    }

    function handleNextSale() {
      // Fire-and-forget — don't make the cashier wait on the printer before
      // moving to the next sale. handlePrintSuccess reads from `snap`
      // (lastTxnSnapshot), which nextTransaction() below does not clear, so
      // it stays valid for the async print/count-increment work to finish.
      void handlePrintSuccess();
      nextTransaction();
    }

    return (
      <ModalShell onClose={nextTransaction}>
        <div
          className="w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden anim-fade-up"
          style={{ background: "white" }}
        >
          {/* Success header */}
          <div
            className="px-6 pt-7 pb-5 text-center"
            style={{
              background:
                "linear-gradient(135deg,rgba(30,16,78,0.03),rgba(255,101,63,0.04))",
              borderBottom: `2px dashed ${C.border}`,
            }}
          >
            <div
              className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{
                background: "rgba(22,163,74,0.08)",
                border: "2px solid rgba(22,163,74,0.2)",
              }}
            >
              <CheckCircle2 size={30} style={{ color: "#16a34a" }} />
            </div>

            <p className="font-black text-lg" style={{ color: C.fg }}>
              Payment Complete
            </p>

            <p
              className="text-[11px] font-mono mt-1 px-2 py-1 rounded-lg inline-block"
              style={{
                background: C.muted,
                color: C.mutedFg,
              }}
            >
              {snap?.displayId ?? String(lastTxn)}
            </p>

            <p className="text-xs mt-2" style={{ color: C.mutedFg }}>
              Saved locally · syncs when online
            </p>

            {printCount > 0 && (
              <div
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-[11px] font-black"
                style={{
                  background: "rgba(3,105,161,0.08)",
                  color: "#0369a1",
                  border: "1px solid rgba(3,105,161,0.16)",
                }}
              >
                <Printer size={11} />
                Printed {printCount}×
              </div>
            )}
          </div>

          {/* Line items */}
          <div
            className="px-5 py-3 space-y-2 max-h-44 overflow-y-auto"
            style={{ borderBottom: `1px solid ${C.muted}` }}
          >
            {snapCart.map((item) => (
              <div
                key={item.eventItemId}
                className="flex justify-between items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-bold truncate"
                    style={{ color: C.fg }}
                  >
                    {item.productName}
                    {item.variantCode && (
                      <span style={{ color: C.mutedFg }}>
                        {" "}
                        ({item.variantCode})
                      </span>
                    )}
                  </p>

                  <p className="text-xs font-mono" style={{ color: C.mutedFg }}>
                    {money(item.finalPrice)} × {item.quantity}
                  </p>

                  {item.promoApplied && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
                      style={{
                        background: "rgba(69,46,90,0.1)",
                        color: C.mid,
                      }}
                    >
                      <Tag size={8} />
                      {item.promoApplied}
                    </span>
                  )}
                </div>

                <p
                  className="text-xs font-black font-mono flex-shrink-0"
                  style={{ color: C.fg }}
                >
                  {money(item.finalPrice * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span style={{ color: C.mutedFg }}>
                {snapQty} item{snapQty !== 1 ? "s" : ""}
              </span>

              {snapDiscount > 0 && (
                <span style={{ color: "#16a34a" }}>
                  Saved {money(snapDiscount)}
                </span>
              )}
            </div>

            {/* Total paid block */}
            <div
              className="rounded-2xl px-4 py-3 flex items-center justify-between"
              style={{
                background: C.muted,
                border: `1px solid ${C.border}`,
              }}
            >
              <div>
                <p
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: C.mutedFg }}
                >
                  Total Paid
                </p>

                <p className="text-xs mt-0.5" style={{ color: C.mutedFg }}>
                  via {snapPay?.name}
                  {snapPay?.provider ? ` · ${snapPay.provider}` : ""}
                </p>
              </div>

              <p className="text-3xl font-black" style={{ color: C.orange }}>
                {money(snapTotal)}
              </p>
            </div>

            {/* Cashier row */}
            {snapCashier && (
              <div
                className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{
                  background: C.muted,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(69,46,90,0.1)",
                    color: C.mid,
                  }}
                >
                  <User size={11} />
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-[10px] font-black uppercase tracking-widest"
                    style={{ color: C.mutedFg }}
                  >
                    Cashier
                  </p>

                  <p
                    className="text-xs font-bold truncate"
                    style={{ color: C.fg }}
                  >
                    {snapCashier}
                  </p>
                </div>
              </div>
            )}

            {/* Cash change section */}
            {snapCash != null && snapCash > 0 && (
              <div
                className="mt-3 rounded-2xl px-4 py-3"
                style={{
                  background: "rgba(3,105,161,0.05)",
                  border: "1px solid rgba(3,105,161,0.15)",
                }}
              >
                <div className="flex justify-between text-xs mb-2">
                  <span style={{ color: C.mutedFg }}>Cash Tendered</span>

                  <span className="font-mono font-bold" style={{ color: C.fg }}>
                    {money(snapCash)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-black" style={{ color: "#0369a1" }}>
                    Change
                  </span>

                  <span
                    className="text-2xl font-black"
                    style={{ color: "#0369a1" }}
                  >
                    {money(snapChange ?? 0)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 pb-5 flex gap-2">
            <button
              onClick={handleNextSale}
              className="flex-1 rounded-2xl py-3.5 text-sm font-black transition-all hover:opacity-90"
              style={{
                background: C.orange,
                color: "white",
              }}
            >
              Next Sale
            </button>

            <button
              onClick={() => handlePrintSuccess()}
              disabled={printing}
              className="px-5 rounded-2xl text-sm font-bold border flex items-center gap-1.5 disabled:opacity-40 transition-all hover:bg-gray-50"
              style={{
                borderColor: C.border,
                color: C.secFg,
                background: "white",
              }}
            >
              <Printer size={14} />
              {printing
                ? "Printing…"
                : printCount > 0
                  ? `Re-print #${printCount + 1}`
                  : "Print"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  async function openDrawerCountModal() {
    if (!event?.id) return; setShowDrawerCount(true); setDrawerActual(""); setDrawerNotes(""); setDrawerExpected(0); setDrawerSessionId(null); setDrawerCashierName(null);
    try { const res=await fetch(`/api/events/${event.id}/cash-drawer-counts`,{cache:"no-store"}); const d=await res.json(); if(res.ok){setDrawerExpected(Number(d.expectedCash??0));setDrawerSessionId(d.activeSession?.id??null);setDrawerCashierName(d.activeSession?.cashierName??null);} } catch {}
  }
  async function saveDrawerCount(e: React.FormEvent) {
    e.preventDefault(); if (!event?.id) return;
    const actualCash=parseRupiahInput(drawerActual); setDrawerSaving(true);
    try { const res=await fetch(`/api/events/${event.id}/cash-drawer-counts`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cashierSessionId:drawerSessionId,countedBy:drawerCashierName,expectedCash:drawerExpected,actualCash,reason:"count",notes:drawerNotes||null})}); const json=await res.json().catch(()=>null); if(!res.ok) throw new Error(json?.error??"Failed"); setShowDrawerCount(false); setDrawerActual(""); setDrawerNotes(""); flash("Cash drawer count saved."); } catch(error) { flash(error instanceof Error?error.message:"Failed to save drawer count",true); } finally { setDrawerSaving(false); }
  }

  function CashDrawerCountModal() {
    if (!showDrawerCount) return null;
    const actualCash = parseRupiahInput(drawerActual);
    const diff = actualCash - drawerExpected;
    return (
      <ModalShell onClose={()=>setShowDrawerCount(false)}>
        <form onSubmit={saveDrawerCount} className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden anim-fade-up" style={{ background:"white" }}>
          <div className="px-6 py-5" style={{ borderBottom:`1px solid ${C.border}` }}>
            <p className="text-base font-black" style={{ color:C.fg }}>Check Cash Drawer</p>
            <p className="text-xs mt-0.5" style={{ color:C.mutedFg }}>{drawerCashierName?`Active cashier: ${drawerCashierName}`:"No active cashier session"}</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl px-4 py-3" style={{ background:C.muted, border:`1px solid ${C.border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color:C.mutedFg }}>Expected</p>
                <p className="text-lg font-black" style={{ color:"#0369a1" }}>{money(drawerExpected)}</p>
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ background:C.muted, border:`1px solid ${C.border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color:C.mutedFg }}>Difference</p>
                <p className="text-lg font-black" style={{ color:diff===0?"#16a34a":diff<0?"#dc2626":"#0369a1" }}>{money(diff)}</p>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color:C.mutedFg }}>Actual Cash Counted</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black" style={{ color:C.mutedFg }}>Rp</span>
                <input required inputMode="numeric" value={drawerActual} onChange={e=>setDrawerActual(formatRupiahInput(e.target.value))}
                  placeholder="0" className="w-full rounded-2xl pl-12 pr-4 py-3 text-lg font-black focus:outline-none focus:ring-2"
                  style={{ border:`1px solid ${C.border}`, color:C.fg, background:"white", "--tw-ring-color":"rgba(255,101,63,0.3)" } as React.CSSProperties}/>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color:C.mutedFg }}>Notes (optional)</label>
              <textarea value={drawerNotes} onChange={e=>setDrawerNotes(e.target.value)} rows={2} placeholder="E.g. after lunch rush, shift handover…"
                className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none resize-none"
                style={{ border:`1px solid ${C.border}`, color:C.fg, background:"white" }}/>
            </div>
          </div>
          <div className="px-6 py-4 flex gap-2 justify-end" style={{ background:C.muted, borderTop:`1px solid ${C.border}` }}>
            <button type="button" onClick={()=>setShowDrawerCount(false)} disabled={drawerSaving}
              className="px-5 py-2.5 rounded-xl text-sm font-bold border disabled:opacity-50" style={{ background:"white", borderColor:C.border, color:C.secFg }}>Cancel</button>
            <button disabled={drawerSaving} className="px-5 py-2.5 rounded-xl text-sm font-black disabled:opacity-50 transition-all hover:opacity-90" style={{ background:C.orange, color:"white" }}>
              {drawerSaving?"Saving…":"Save Count"}
            </button>
          </div>
        </form>
      </ModalShell>
    );
  }

  function ReportDrawer() {
    if (!showReport) return null;
    return (
      <>
        <div className="fixed inset-0 z-40" style={{ background:"rgba(30,16,78,0.2)" }} onClick={()=>setShowReport(false)}/>
        <div className="fixed right-0 top-0 h-full z-50 flex flex-col anim-slide-in" style={{ width:340, background:"white", boxShadow:"-8px 0 40px rgba(30,16,78,0.12)", borderLeft:`1px solid ${C.border}` }}>
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom:`1px solid ${C.border}` }}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:"rgba(69,46,90,0.08)", color:C.mid }}><BarChart2 size={16}/></div>
              <div>
                <p className="text-sm font-black" style={{ color:C.fg }}>Sales Report</p>
                <p className="text-xs truncate max-w-[220px]" style={{ color:C.mutedFg }}>{event?.name}</p>
              </div>
            </div>
            <button onClick={()=>setShowReport(false)} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-red-50" style={{ color:C.mutedFg }}><X size={14}/></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {loadingStats?(
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <RefreshCw size={20} className="animate-spin" style={{ color:C.border }}/>
                <p className="text-xs" style={{ color:C.mutedFg }}>Loading stats…</p>
              </div>
            ):dailyStats?(
              <>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color:C.mutedFg }}>Today</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon:<DollarSign size={13}/>, label:"Revenue",      value:money(dailyStats.todayRevenue),           color:C.orange, bg:"rgba(255,101,63,0.08)"  },
                      { icon:<ShoppingBag size={13}/>,label:"Transactions", value:String(dailyStats.todayTxnCount),         color:"#0369a1", bg:"rgba(3,105,161,0.07)"   },
                      { icon:<TrendingUp size={13}/>, label:"Items Sold",   value:`${dailyStats.todayItemsSold} units`,     color:C.mid,     bg:"rgba(69,46,90,0.07)"    },
                      { icon:<Tag size={13}/>,        label:"Discounts",    value:money(dailyStats.todayDiscount),          color:"#16a34a", bg:"rgba(22,163,74,0.07)"   },
                    ].map(({icon,label,value,color,bg})=>(
                      <div key={label} className="rounded-xl p-3" style={{ background:"#f9fafb", border:`1px solid ${C.border}` }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background:bg, color }}>{icon}</div>
                        <p className="text-[10px]" style={{ color:C.mutedFg }}>{label}</p>
                        <p className="text-sm font-black mt-0.5 truncate" style={{ color }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ borderTop:`1px solid ${C.border}` }}/>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color:C.mutedFg }}>Total Event Sales</p>
                  <div className="space-y-1.5">
                    {[
                      {label:"Total Revenue",   value:money(dailyStats.revenue),       color:C.orange},
                      {label:"Transactions",    value:String(dailyStats.txnCount),     color:"#0369a1"},
                      {label:"Items Sold",      value:`${dailyStats.itemsSold} units`, color:C.mid},
                      {label:"Total Discounts", value:money(dailyStats.discount),      color:"#16a34a"},
                      {label:"Total Stock",     value:String(dailyStats.totalUnits),   color:stockTone(dailyStats.totalUnits)},
                    ].map(({label,value,color})=>(
                      <div key={label} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background:C.muted }}>
                        <span className="text-xs" style={{ color:C.mutedFg }}>{label}</span>
                        <span className="text-sm font-black" style={{ color }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ):(
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <BarChart2 size={24} style={{ color:C.border }}/>
                <p className="text-xs text-center" style={{ color:C.mutedFg }}>Could not load stats.<br/>Check connection and retry.</p>
              </div>
            )}
          </div>
          <div className="flex-shrink-0 px-5 py-4 space-y-2" style={{ borderTop:`1px solid ${C.border}` }}>
            {event?.id && (
              <div className="grid grid-cols-2 gap-2">
                <a href={`/api/local/events/${event.id}/transactions/export?scope=today`}
                  className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold border transition-all hover:bg-gray-50"
                  style={{ borderColor:C.border, color:C.secFg }} title="Export today's transactions to Excel">
                  <FileSpreadsheet size={12}/> Today
                </a>
                <a href={`/api/local/events/${event.id}/transactions/export?scope=all`}
                  className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold border transition-all hover:bg-gray-50"
                  style={{ borderColor:C.border, color:C.secFg }} title="Export all event transactions to Excel">
                  <FileSpreadsheet size={12}/> Whole Event
                </a>
              </div>
            )}
            <button onClick={()=>event?.id&&loadDailyStats(event.id)} disabled={loadingStats}
              className="w-full rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-all hover:bg-gray-100"
              style={{ background:C.muted, color:C.secFg }}>
              <RefreshCw size={11} className={loadingStats?"animate-spin":""}/> Refresh Stats
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Event select screen ───────────────────────────────────────────────────
  if (screen==="event-select") {
    // Merge prepared + cloud events, deduplicate by id, apply search + status filter
    const allowedPreparedEvents = isAdmin
      ? preparedEvents
      : preparedEvents.filter((ev) => assignedEventIds.includes(Number(ev.id)));
    const allowedEvents = isAdmin
      ? events
      : events.filter((ev) => assignedEventIds.includes(Number(ev.id)));

    const allEventIds = new Set(allowedPreparedEvents.map(e=>e.id));
    const cloudOnly   = allowedEvents.filter(e=>!allEventIds.has(e.id));

    const esq = eventSearch.trim().toLowerCase();
    const filteredPrepared = allowedPreparedEvents.filter(ev=>{
      if (eventStatusFilter!=="all" && ev.status!==eventStatusFilter) return false;
      if (esq && !ev.name.toLowerCase().includes(esq) && !(ev.location??"").toLowerCase().includes(esq)) return false;
      return true;
    });
    const filteredCloud = cloudOnly.filter(ev=>{
      if (eventStatusFilter!=="all" && ev.status!==eventStatusFilter) return false;
      if (esq && !ev.name.toLowerCase().includes(esq) && !(ev.location??"").toLowerCase().includes(esq)) return false;
      return true;
    });
    const totalVisible = filteredPrepared.length + filteredCloud.length;
    const totalAll     = allowedPreparedEvents.length + cloudOnly.length;
    const hasFilter    = esq || eventStatusFilter!=="all";

    const STATUS_FILTERS: { value: "all"|"active"|"draft"|"closed"; label: string }[] = [
      { value:"active", label:"Active" },
      { value:"draft",  label:"Draft"  },
      { value:"closed", label:"Closed" },
      { value:"all",    label:"All"    },
    ];

    return (
      <div className="h-screen flex flex-col overflow-hidden" style={{ background:C.bg }}>
        <style>{KEYFRAMES}</style>
        {toast&&<div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl" style={{ background:toastErr?"#ef4444":"#16a34a", color:"white" }}>{toast}</div>}

        {/* ── Sticky header ── */}
        <div className="flex-shrink-0" style={{ background:C.deep }}>
          {/* Top row: back + branding + status + dashboard */}
          <div className="px-4 py-3 flex items-center gap-3">
            {isAdmin && (
              <button onClick={()=>window.location.href="/"}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:bg-white/10"
                style={{ border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.7)" }}
                title="Back to dashboard">
                <ArrowLeft size={15}/>
              </button>
            )}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:C.orange }}>
              <Zap size={16} strokeWidth={2.5} style={{ color:"white" }}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white leading-tight">Point of Sale</p>
              <p className="text-[11px] opacity-50 text-white">
                {totalAll>0?`${totalVisible} of ${totalAll} events`:"No events loaded"}
              </p>
            </div>
            {/* Online pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0"
              style={{ background:online?"rgba(34,197,94,0.15)":"rgba(245,158,11,0.2)", color:online?"#4ade80":"#fbbf24" }}>
              {online?<Wifi size={11}/>:<WifiOff size={11}/>}
              <span className="hidden sm:inline">{online?"Online":"Offline"}</span>
            </div>
            {/* Dashboard link — admin only */}
            {isAdmin ? (
              <button onClick={()=>window.location.href="/"}
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-all hover:bg-white/10"
                style={{ color:"rgba(255,255,255,0.55)", border:"1px solid rgba(255,255,255,0.1)" }}>
                <LogOut size={12}/>Dashboard
              </button>
            ) : (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-all hover:bg-red-500/20"
                style={{ color:"rgba(248,113,113,0.85)", border:"1px solid rgba(248,113,113,0.16)" }}>
                <LogOut size={12}/>Log Out
              </button>
            )}
          </div>

          {/* Search + filter row */}
          <div className="px-4 pb-3 flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:"rgba(255,255,255,0.35)" }}/>
              <input
                value={eventSearch} onChange={e=>setEventSearch(e.target.value)}
                placeholder="Search events…"
                className="w-full rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none"
                style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", color:"white" }}/>
              {eventSearch&&(
                <button onClick={()=>setEventSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color:"rgba(255,255,255,0.4)" }}>
                  <X size={12}/>
                </button>
              )}
            </div>
            {/* Status filter pills */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {STATUS_FILTERS.map(f=>(
                <button key={f.value} onClick={()=>setEventStatusFilter(f.value)}
                  className="text-[11px] font-black px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: eventStatusFilter===f.value?"rgba(255,255,255,0.18)":"transparent",
                    color:      eventStatusFilter===f.value?"white":"rgba(255,255,255,0.45)",
                    border:     `1px solid ${eventStatusFilter===f.value?"rgba(255,255,255,0.25)":"transparent"}`,
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Scrollable event list ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto px-4 py-5 space-y-6">

            {/* Prepared / local-ready events */}
            {filteredPrepared.length>0&&(
              <section className="anim-fade-up">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-1.5 h-4 rounded-full" style={{ background:C.orange }}/>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:C.secFg }}>Ready to Sell</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto" style={{ background:"rgba(255,101,63,0.1)", color:C.orange }}>{filteredPrepared.length}</span>
                </div>
                <div className="space-y-2">
                  {filteredPrepared.map((ev,i)=>{ const s=STATUS_STYLE[ev.status]??STATUS_STYLE.draft; return (
                    <button key={ev.id}
                      onClick={()=>{localStorage.setItem("pos:last-event-id",String(ev.id));loadLocalBundle(ev.id).then(b=>b&&setScreen("sell"));}}
                      className="anim-fade-up w-full text-left rounded-2xl px-4 py-3.5 transition-all group hover:shadow-md"
                      style={{ background:"white", border:`1.5px solid ${s.border}`, animationDelay:`${i*40}ms` }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:s.bg }}>
                          <span className="w-2.5 h-2.5 rounded-full block" style={{ background:s.dot, animation:ev.status==="active"?"pulseDot 2s ease-in-out infinite":undefined }}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-sm truncate" style={{ color:C.fg }}>{ev.name}</p>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-black flex-shrink-0" style={{ background:s.bg, color:s.text }}>{s.label}</span>
                          </div>
                          <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
                            {ev.location&&<span className="flex items-center gap-1 text-xs" style={{ color:C.mutedFg }}><MapPin size={9}/>{ev.location}</span>}
                            <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color:"#0369a1" }}><Database size={9}/>Local ready</span>
                            {ev.pendingSyncCount>0&&<span className="text-[10px] font-black px-1.5 py-0.5 rounded-md" style={{ background:"rgba(245,158,11,0.1)", color:"#b45309" }}>{ev.pendingSyncCount} unsynced</span>}
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110" style={{ background:C.orange, color:"white" }}><ArrowRight size={14}/></div>
                      </div>
                    </button>
                  );})}
                </div>
              </section>
            )}

            {/* Cloud-only events */}
            {filteredCloud.length>0&&(
              <section className="anim-fade-up" style={{ animationDelay:"60ms" }}>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-1.5 h-4 rounded-full" style={{ background:C.border }}/>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:C.secFg }}>Available Events</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto" style={{ background:C.muted, color:C.mutedFg }}>{filteredCloud.length}</span>
                </div>
                <div className="space-y-2">
                  {filteredCloud.map((ev,i)=>{ const s=STATUS_STYLE[ev.status]??STATUS_STYLE.draft; return (
                    <button key={ev.id} onClick={()=>openLocalEvent(ev)} disabled={preparing}
                      className="anim-fade-up w-full text-left rounded-2xl px-4 py-3.5 transition-all group hover:shadow-sm disabled:opacity-50"
                      style={{ background:"white", border:`1.5px solid ${C.border}`, animationDelay:`${i*40}ms` }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:s.bg }}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background:s.dot }}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-sm truncate" style={{ color:C.fg }}>{ev.name}</p>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-black flex-shrink-0" style={{ background:s.bg, color:s.text }}>{s.label}</span>
                          </div>
                          {ev.location&&<span className="flex items-center gap-1 text-xs mt-0.5" style={{ color:C.mutedFg }}><MapPin size={9}/>{ev.location}</span>}
                        </div>
                        {preparing?(
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl flex-shrink-0" style={{ background:"rgba(255,101,63,0.08)", color:C.orange }}>
                            <RefreshCw size={11} className="animate-spin"/>Preparing…
                          </div>
                        ):(
                          <div className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border flex-shrink-0 transition-all group-hover:border-orange-300 group-hover:text-orange-600" style={{ borderColor:C.border, color:C.mutedFg }}>
                            Open<ChevronRight size={11}/>
                          </div>
                        )}
                      </div>
                    </button>
                  );})}
                </div>
              </section>
            )}

            {/* Empty state */}
            {totalVisible===0&&(
              <div className="rounded-2xl p-10 text-center anim-fade-up" style={{ background:"white", border:`1.5px solid ${C.border}` }}>
                <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background:C.muted }}>
                  <Package size={20} style={{ color:C.border }}/>
                </div>
                {hasFilter?(
                  <>
                    <p className="font-black text-sm mb-1" style={{ color:C.secFg }}>No events match</p>
                    <p className="text-xs mb-3" style={{ color:C.mutedFg }}>Try a different search or filter.</p>
                    <button onClick={()=>{setEventSearch("");setEventStatusFilter("all");}}
                      className="text-xs font-bold px-4 py-2 rounded-xl transition-all hover:opacity-80"
                      style={{ background:C.orange, color:"white" }}>
                      Clear filters
                    </button>
                  </>
                ):(
                  <>
                    <p className="font-black text-sm mb-1" style={{ color:C.secFg }}>No events available</p>
                    <p className="text-xs" style={{ color:C.mutedFg }}>{online?"No events found. Create one from the dashboard.":"Connect to internet to load events."}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Sell / success screen ─────────────────────────────────────────────────
  const eventStyle = STATUS_STYLE[event?.status??"draft"]??STATUS_STYLE.draft;
  const needsRef   = payMethod&&payMethod.type!=="cash";
  const canConfirm = !!(payMethod&&cart.length>0&&(!isCash||cashTenderedNum>=total));

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background:C.bg }}>
      <style>{KEYFRAMES}</style>
      <POSActionModal/>
      <PaymentSuccessOverlay/>
      <CashDrawerCountModal/>
      <ReportDrawer/>


      {toast&&<div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl pointer-events-none" style={{ background:toastErr?"#ef4444":"#16a34a", color:"white" }}>{toast}</div>}

      {/* ── Topbar ── */}
      <header className="flex items-center gap-2 px-3 flex-shrink-0" style={{ background:C.deep, height:56 }}>

        {/* Event info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:"rgba(255,255,255,0.08)" }}>
            <Zap size={15} strokeWidth={2.5} style={{ color:C.orange }}/>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:eventStyle.dot, animation:event?.status==="active"?"pulseDot 2s ease-in-out infinite":undefined }}/>
              <p className="text-sm font-black truncate text-white">{event?.name}</p>
            </div>
            {event?.location&&<p className="hidden md:flex items-center gap-1 text-[11px] opacity-50 text-white"><MapPin size={9}/>{event.location}</p>}
          </div>
          {cashierSession && (
            <div
              className="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
              style={{ color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <User size={11} />
              <span className="max-w-[110px] truncate font-semibold">{cashierSession.cashierName}</span>
            </div>
          )}
        </div>

        {/* Status pills — hidden on mobile */}
        <div className="topbar-status hidden lg:flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.6)" }}>
            <Database size={9}/> SQLite
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background:online?"rgba(34,197,94,0.15)":"rgba(245,158,11,0.15)", color:online?"#4ade80":"#fbbf24" }}>
            {online?<Wifi size={9}/>:<WifiOff size={9}/>}{online?"Online":"Offline"}
          </span>
          {promoCount>0&&<span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background:"rgba(255,200,92,0.15)", color:C.yellow }}>
            <Tag size={9}/>{promoCount} promo{promoCount>1?"s":""}
          </span>}
          {pendingSyncCount>0?(
            <button onClick={()=>event?.id&&syncLocalTransactions(event.id)} disabled={syncing||!online}
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg disabled:opacity-60 transition-all hover:opacity-80"
              style={{ background:"rgba(245,158,11,0.2)", color:"#fbbf24" }}>
              {syncing?<RefreshCw size={9} className="animate-spin"/>:<CloudUpload size={9}/>}{pendingSyncCount} pending
            </button>
          ):localReady?(
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background:"rgba(34,197,94,0.12)", color:"#4ade80" }}>
              <Check size={9}/>Synced
            </span>
          ):null}
        </div>

        {/* ── Action button groups ── */}
        {/* Group 1: View / Info actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={openDrawerCountModal}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-white/10"
            style={{ color:"rgba(255,255,255,0.75)" }} title="Cash Drawer Count">
            <Banknote size={13}/><span className="hidden sm:inline topbar-label">Drawer</span>
          </button>
          <button onClick={()=>event?.id&&(window.location.href=`/pos/history?event=${event.id}`)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-white/10"
            style={{ color:"rgba(255,255,255,0.75)" }} title="Transaction History">
            <History size={13}/><span className="hidden sm:inline topbar-label">History</span>
          </button>
          <button onClick={()=>{setShowReport(true);if(event?.id)loadDailyStats(event.id);}}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-white/10"
            style={{ color:"rgba(255,255,255,0.75)" }} title="Sales Report">
            <BarChart2 size={13}/><span className="hidden sm:inline topbar-label">Report</span>
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 flex-shrink-0" style={{ background:"rgba(255,255,255,0.12)" }}/>

        {/* Group 2: Data / Sync actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={()=>event?.id&&prepareEventOffline(event.id)} disabled={preparing||!online}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 hover:bg-white/10"
            style={{ color:"rgba(255,255,255,0.75)" }} title="Refresh local data">
            {preparing?<RefreshCw size={13} className="animate-spin"/>:<Database size={13}/>}
            <span className="hidden sm:inline topbar-label">Refresh</span>
          </button>
          {/* Switch event */}
          {(isAdmin || isCashier) && (
            <button onClick={async ()=>{
                setCart([]); setPayMethod(null); setReference(""); setCashTendered(""); setQuery("");
                setEventSearch(""); setEventStatusFilter("active");
                await loadPreparedEvents();
                if (navigator.onLine) { try { await loadEventsForCurrentUser(); } catch {} }
                router.replace("/pos?select=1");
                setScreen("event-select");
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-white/10"
              style={{ color:"rgba(255,255,255,0.75)" }} title="Switch event">
              <ArrowRight size={13}/><span className="hidden sm:inline topbar-label">Switch</span>
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-6 flex-shrink-0" style={{ background:"rgba(255,255,255,0.12)" }}/>

        {/* Group 3: Exit / Danger actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Turn Off — admin only */}
          {isAdmin && (
            <button onClick={()=>{setActionError("");setActionDialog("turn-off-local");}}
              className="hidden md:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-white/10"
              style={{ color:"rgba(255,200,92,0.85)" }} title="Turn off local POS">
              <Power size={13}/><span className="topbar-label">Turn Off</span>
            </button>
          )}
          {/* Cashier: Log Out button (signs out of next-auth) */}
          {isCashier && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-red-500/20"
              style={{ color:"rgba(248,113,113,0.85)" }} title="Log out">
              <LogOut size={13}/><span className="hidden sm:inline topbar-label">Log Out</span>
            </button>
          )}
          {/* Admin: Exit to dashboard */}
          {isAdmin && (
            <button onClick={()=>window.location.href="/"}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-red-500/20"
              style={{ color:"rgba(248,113,113,0.85)" }} title="Exit POS">
              <LogOut size={13}/><span className="hidden sm:inline topbar-label">Exit</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Two-pane layout ── */}
      <div className="pos-two-pane flex flex-1 overflow-hidden">

        {/* ── LEFT: Cart + Scanner ── */}
        <section className="pos-cart-pane flex flex-col overflow-hidden" style={{ flex:"1 1 0", minWidth:0, background:"white", borderRight:`1px solid ${C.border}`, "--border-col":C.border } as React.CSSProperties}>

          {/* Scanner bar */}
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom:`1px solid ${C.muted}` }}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:C.mutedFg }}>Cart</p>
                <p className="text-sm font-black" style={{ color:C.fg }}>{itemCount} item{itemCount===1?"":"s"}</p>
              </div>
              {cart.length>0&&(
                <button onClick={()=>setCart([])} className="text-[10px] px-3 py-1.5 rounded-xl font-black transition-all hover:bg-red-100"
                  style={{ background:"#fef2f2", color:"#ef4444" }}>
                  <Trash2 size={11} className="inline mr-1"/>Clear
                </button>
              )}
            </div>
            <div className="relative">
              <form onSubmit={handleSearchSubmit}>
                <div className="relative">
                  <ScanLine size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:C.orange }}/>
                  <input ref={scanRef} value={query} onChange={e=>setQuery(e.target.value)} onFocus={()=>setSearchFocused(true)}
                    placeholder="Scan barcode or search product…"
                    className="w-full rounded-2xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2"
                    style={{ background:C.muted, border:`1.5px solid ${C.border}`, color:C.fg, "--tw-ring-color":"rgba(255,101,63,0.3)" } as React.CSSProperties}
                    autoFocus/>
                  {query&&(
                    <button type="button" onClick={()=>{setQuery("");setSearchFocused(false);scanRef.current?.focus();}}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-50"
                      style={{ background:"white", color:C.mutedFg }}><X size={13}/></button>
                  )}
                </div>
              </form>
              <SearchResultsOverlay/>
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto p-3">
            {cart.length===0?(
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-3" style={{ background:C.muted }}>
                  <Package size={26} style={{ color:C.border }}/>
                </div>
                <p className="text-sm font-black" style={{ color:C.mutedFg }}>Cart is empty</p>
                <p className="text-xs mt-1" style={{ color:C.border }}>Scan a barcode or search above to add products.</p>
              </div>
            ):(
              <div className="space-y-2">
                {cart.map(item=>(
                  <div key={item.eventItemId} className="rounded-2xl p-3 transition-all hover:shadow-sm"
                    style={{ background:C.muted, border:`1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black truncate" style={{ color:C.fg }}>{item.productName}</p>
                        <p className="text-[10px] font-mono mt-0.5" style={{ color:C.mutedFg }}>{item.itemId}{item.variantCode?` · ${item.variantCode}`:""}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.promoApplied&&(
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
                              style={{ background:"rgba(69,46,90,0.1)", color:C.mid }}><Tag size={8}/>{item.promoApplied}</span>
                          )}
                          {item.freeQty>0&&(
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
                              style={{ background:"rgba(22,163,74,0.1)", color:"#16a34a" }}>+{item.freeQty} free</span>
                          )}
                        </div>
                      </div>
                      <button onClick={()=>setCart(prev=>prev.filter(r=>r.eventItemId!==item.eventItemId))}
                        className="p-1.5 rounded-xl flex-shrink-0 transition-all hover:bg-red-100"
                        style={{ color:"#ef4444", background:"#fef2f2" }}><Trash2 size={12}/></button>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      {/* Qty control */}
                      <div className="flex items-center gap-1 rounded-xl overflow-hidden" style={{ background:"white", border:`1px solid ${C.border}` }}>
                        <button onClick={()=>changeQty(item.eventItemId,item.quantity-1)}
                          className="w-8 h-8 flex items-center justify-center transition-all hover:bg-red-50"
                          style={{ color:"#ef4444" }}><Minus size={13}/></button>
                        <QtyInput value={item.quantity} onChange={(qty)=>changeQty(item.eventItemId,qty)}/>
                        <button onClick={()=>changeQty(item.eventItemId,item.quantity+1)}
                          className="w-8 h-8 flex items-center justify-center transition-all hover:bg-green-50"
                          style={{ color:"#16a34a" }}><Plus size={13}/></button>
                      </div>
                      {/* Price */}
                      <div className="text-right">
                        {item.discountAmt>0&&<p className="text-[10px] line-through" style={{ color:C.border }}>{money(item.unitPrice)}</p>}
                        <p className="text-[11px]" style={{ color:C.mutedFg }}>{money(item.finalPrice)} each</p>
                        <p className="text-base font-black" style={{ color:C.fg }}>{money(item.finalPrice*item.quantity)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart footer — SINGLE total */}
          <div className="flex-shrink-0 px-4 py-3" style={{ borderTop:`1px solid ${C.border}`, background:"white" }}>
            {discount>0&&(
              <div className="flex items-center justify-between text-xs mb-2 px-1">
                <span style={{ color:C.mutedFg }}>Subtotal</span>
                <span className="font-mono" style={{ color:C.mutedFg }}>{money(subtotal)}</span>
              </div>
            )}
            {discount>0&&(
              <div className="flex items-center justify-between text-xs mb-2 px-1">
                <span className="flex items-center gap-1 font-semibold" style={{ color:"#16a34a" }}><Tag size={10}/>Savings</span>
                <span className="font-mono font-bold" style={{ color:"#16a34a" }}>−{money(discount)}</span>
              </div>
            )}
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background:cart.length>0?C.deep:C.muted }}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:cart.length>0?"rgba(255,255,255,0.5)":C.mutedFg }}>
                  {itemCount} item{itemCount===1?"":"s"}
                </p>
                <p className="text-xs mt-0.5 font-semibold" style={{ color:cart.length>0?"rgba(255,255,255,0.5)":C.mutedFg }}>Total</p>
              </div>
              <p className="text-3xl font-black" style={{ color:cart.length>0?C.orange:C.border }}>
                {money(total)}
              </p>
            </div>
          </div>
        </section>

        {/* ── RIGHT: Payment panel ── */}
        <main className="pos-pay-pane flex flex-col overflow-hidden" style={{ flexShrink:0, width:"25%", minWidth:260, background:C.bg, "--border-col":C.border } as React.CSSProperties}>

          {/* Payment header */}
          <div className="px-4 py-3 flex-shrink-0" style={{ background:"white", borderBottom:`1px solid ${C.border}` }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:C.mutedFg }}>Payment Method</p>
            <p className="text-sm font-black mt-0.5" style={{ color:C.fg }}>
              {payMethod?payMethod.name:"Choose method"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

            {/* ── Cash methods ── */}
            {cashMethods.length>0&&(
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-1.5 font-black px-1" style={{ color:C.mutedFg }}>Cash</p>
                <div className="space-y-1.5">
                  {cashMethods.map(method=>{
                    const selected = payMethod?.id===method.id;
                    return (
                      <button key={method.id} onClick={()=>{setPayMethod(method);setReference("");}}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all"
                        style={{ background:selected?"rgba(255,101,63,0.06)":"white", border:`1.5px solid ${selected?C.orange:C.border}` }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background:selected?"rgba(255,101,63,0.12)":C.muted, color:selected?C.orange:C.mutedFg }}>
                          <Banknote size={15}/>
                        </div>
                        <p className="text-sm font-black flex-1 truncate" style={{ color:selected?C.orange:C.fg }}>{method.name}</p>
                        {selected&&<div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:C.orange }}/>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Cash calculator ── */}
            {isCash&&cart.length>0&&(
              <div className="rounded-2xl p-3 space-y-2.5" style={{ background:C.muted, border:`1.5px solid ${C.border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:C.mutedFg }}>Cash Calculator</p>
                {cashSuggestions.length>0&&(
                  <div className="flex flex-wrap gap-1.5">
                    {cashSuggestions.map(amt=>(
                      <button key={amt} onClick={()=>setCashTendered(String(amt))}
                        className="text-[10px] font-black px-2.5 py-1.5 rounded-xl transition-all"
                        style={{ background:cashTenderedNum===amt?C.deep:"white", color:cashTenderedNum===amt?"white":C.secFg, border:`1px solid ${cashTenderedNum===amt?C.deep:C.border}` }}>
                        {money(amt)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black" style={{ color:C.mutedFg }}>Rp</span>
                  <input type="number" min="0" step="1000" value={cashTendered} onChange={e=>setCashTendered(e.target.value)}
                    placeholder={money(total).replace("Rp\u00a0","").replace("Rp ","")}
                    className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm font-mono font-black focus:outline-none"
                    style={{ background:"white", border:`1px solid ${C.border}`, color:C.fg }}/>
                </div>
                {cashTenderedNum>0&&(
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                    style={{ background:cashTenderedNum>=total?"rgba(22,163,74,0.08)":"white", border:`1px solid ${cashTenderedNum>=total?"rgba(22,163,74,0.25)":C.border}` }}>
                    <span className="text-xs font-bold" style={{ color:cashTenderedNum>=total?"#16a34a":C.mutedFg }}>
                      {cashTenderedNum>=total?"Change":"Short by"}
                    </span>
                    <span className="text-base font-black font-mono" style={{ color:cashTenderedNum>=total?"#16a34a":C.fg }}>
                      {cashTenderedNum>=total?money(changeNum):`−${money(total-cashTenderedNum)}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── EDC groups ── */}
            {edcGroups.length>0&&(
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-1.5 font-black px-1" style={{ color:C.mutedFg }}>EDC / Card</p>
                <div className="space-y-1.5">
                  {edcGroups.map(group=>{
                    const groupKey    = group.machineId!=null?String(group.machineId):"unassigned";
                    const isExpanded  = expandedEdcGroups.has(groupKey);
                    const groupSelected = group.methods.some(m=>m.id===payMethod?.id);
                    return (
                      <div key={groupKey} className="rounded-xl overflow-hidden"
                        style={{ border:`1.5px solid ${groupSelected?C.mid:C.border}`, background:"white" }}>
                        <button onClick={()=>setExpandedEdcGroups(prev=>{const next=new Set(prev);next.has(groupKey)?next.delete(groupKey):next.add(groupKey);return next;})}
                          className="w-full flex items-center gap-2 px-3 py-2.5 transition-all hover:bg-gray-50"
                          style={{ background:groupSelected?"rgba(69,46,90,0.04)":"white" }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:"rgba(69,46,90,0.08)", color:C.mid }}>
                            <Building2 size={12}/>
                          </div>
                          <span className="flex-1 text-left text-xs font-black truncate" style={{ color:groupSelected?C.mid:C.fg }}>
                            {group.machineLabel}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg mr-1" style={{ background:C.muted, color:C.mutedFg }}>{group.methods.length}</span>
                          <ChevronDown size={12} style={{ color:C.mutedFg, transform:isExpanded?"rotate(180deg)":"none", transition:"transform .15s" }}/>
                        </button>
                        {isExpanded&&(
                          <div style={{ borderTop:`1px solid ${C.muted}` }}>
                            {group.methods.map(method=>{
                              const selected = payMethod?.id===method.id;
                              return (
                                <button key={method.id} onClick={()=>{setPayMethod(method);setReference("");}}
                                  className="w-full flex items-center gap-2 pl-9 pr-3 py-2 text-left transition-all hover:bg-gray-50"
                                  style={{ background:selected?"rgba(255,101,63,0.05)":"white", borderTop:`1px solid ${C.muted}` }}>
                                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:selected?"rgba(255,101,63,0.12)":C.muted, color:selected?C.orange:C.mutedFg }}>
                                    <CreditCard size={11}/>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-black truncate" style={{ color:selected?C.orange:C.fg }}>{method.name}</p>
                                    {method.edcMethod&&<p className="text-[10px] capitalize" style={{ color:C.mutedFg }}>{method.edcMethod}</p>}
                                  </div>
                                  {selected&&<div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:C.orange }}/>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reference */}
            {needsRef&&(
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 px-1" style={{ color:C.mutedFg }}>Reference No.</label>
                <input value={reference} onChange={e=>setReference(e.target.value)} placeholder="EDC / QR reference…"
                  className="w-full rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none"
                  style={{ background:"white", border:`1px solid ${C.border}`, color:C.fg }}/>
              </div>
            )}

            {/* ── Quick action icons ── */}
            <div className="pt-1">
              <p className="text-[10px] uppercase tracking-widest mb-1.5 font-black px-1" style={{ color:C.mutedFg }}>Quick Actions</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { icon:<ScanLine size={14}/>, label:"Scan",    color:C.orange, action:()=>scanRef.current?.focus()                                                  },
                  { icon:<BarChart2 size={14}/>,label:"Report",  color:C.mid,    action:()=>{setShowReport(true);if(event?.id)loadDailyStats(event.id);}              },
                  { icon:<CloudUpload size={14}/>,label:"Sync",  color:"#b45309",action:()=>event?.id&&syncLocalTransactions(event.id),
                    disabled:syncing||!online||pendingSyncCount===0,
                    badge:pendingSyncCount>0?String(pendingSyncCount):undefined                                                                                         },
                  { icon:<Banknote size={14}/>, label:"Drawer",  color:"#0369a1",action:openDrawerCountModal                                                          },
                ].map(({icon,label,color,action,disabled,badge})=>(
                  <button key={label} onClick={action} disabled={disabled}
                    className="relative rounded-xl py-2.5 text-center border transition-all hover:shadow-sm disabled:opacity-40"
                    style={{ background:"white", borderColor:C.border }}>
                    <div className="flex justify-center mb-1" style={{ color }}>{icon}</div>
                    <p className="text-[9px] font-black" style={{ color:C.mutedFg }}>{label}</p>
                    {badge&&<span className="absolute -top-1.5 -right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background:"#b45309", color:"white" }}>{badge}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Confirm payment footer ── */}
          <div className="flex-shrink-0 px-3 pb-3 pt-2" style={{ background:C.deep, borderTop:`1px solid rgba(255,255,255,0.08)` }}>
            {/* Cash shortfall */}
            {isCash&&cashTenderedNum>0&&cashTenderedNum<total&&(
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold mb-2"
                style={{ background:"rgba(220,38,38,0.15)", color:"#fca5a5", border:"1px solid rgba(220,38,38,0.3)" }}>
                <AlertCircle size={12}/> Cash is {money(total-cashTenderedNum)} short
              </div>
            )}

            <button onClick={confirmPayment} disabled={!canConfirm||processing}
              className="w-full rounded-2xl py-4 text-sm font-black transition-all disabled:opacity-30"
              style={{ background:canConfirm?C.orange:"rgba(255,255,255,0.08)", color:canConfirm?"white":"rgba(255,255,255,0.3)" }}>
              {processing?"Saving…"
                :cart.length===0?"Add items to cart"
                :!payMethod?"Select payment method"
                :isCash&&cashTenderedNum===0?"Enter cash amount"
                :isCash&&cashTenderedNum<total?"Insufficient cash"
                :`Confirm · ${money(total)}`}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center" style={{ background:"#1e104e" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"rgba(255,101,63,0.2)" }}>
            <Zap size={16} style={{ color:"#ff653f" }}/>
          </div>
          <span className="text-sm font-bold" style={{ color:"rgba(255,255,255,0.5)" }}>Loading POS…</span>
        </div>
      </div>
    }>
      <POSInner/>
    </Suspense>
  );
}