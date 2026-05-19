// app/(main)/events/[id]/page.tsx — FULL REDESIGN
"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Trash2, X, Upload, Download, Pencil,
  Tag, ChevronLeft, Search, Package2, Check,
  AlertCircle, Layers, Zap, ToggleLeft, ToggleRight,
  LayoutDashboard, History, ShoppingBag,
  TrendingUp, DollarSign, Activity, RefreshCw,
  User, FileSpreadsheet, ReceiptText, WalletCards,
  ArrowUpRight, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { formatRupiah, formatDate, safeFloat } from "@/lib/utils";
import { EventUsersPanel } from "@/components/events/EventUsersPanel";
import { StockTab } from "@/components/events/StockTab";
import { CashDrawerCountsTab } from "@/components/events/CashDrawerCountsTab";
import { ReceiptTemplateTab } from "@/components/events/ReceiptTemplateTab";
import { TransactionsTab } from "@/components/events/TransactionsTab";
import { PromoFormModal, type PromoFormData } from "@/components/events/PromoFormModal";
import { CashierSessionsTab } from "@/components/events/CashierSessionsTab";

// ── Types ─────────────────────────────────────────────────────────────────────
type EventRow = { id: number; name: string; status: string; location: string | null; startDate: string | null; endDate: string | null; };
type EventItem = { id: number; eventId: number; stock: number; retailPrice: string; netPrice: string; itemId: string; name: string; color: string | null; variantCode: string | null; unit: string | null; baseItemNo: string | null; };
type PromoItem = { id: number; eventItemId: number; name: string; variantCode: string | null; itemId: string; };
type Tier = { minQty: number; discount: string; };
type Promo = { id: number; name: string; type: string; isActive: boolean; applyToAll: boolean; discountPct: string | null; discountFix: string | null; fixedPrice: string | null; buyQty: number | null; getFreeQty: number | null; spendMinAmount: string | null; bundlePrice: string | null; flashStartTime: string | null; flashEndTime: string | null; minPurchaseQty: number | null; maxUsageCount: number | null; tiers: Tier[]; items: PromoItem[]; };
type Transaction = { id: number; displayId?: string | null; eventId: number; clientTxnId?: string | null; cashierSessionId?: number | null; cashierName?: string | null; totalAmount: string; discount: string; finalAmount: string; cashTendered?: string | null; changeAmount?: string | null; paymentMethod: string | null; paymentReference: string | null; createdAt: string | null; };
type EventStats = { txnCount: number; revenue: number; discount: number; itemsSold: number; today: { txnCount: number; revenue: number; discount: number; itemsSold: number }; stock: { totalItems: number; outOfStock: number; lowStock: number; totalUnits: number; originalUnits: number; totalStockValue: number; remainingValue: number; }; };
type Tab = "dashboard" | "items" | "promos" | "stock" | "transactions" | "cashDrawer" | "receipt" | "users" | "cashierSessions";

const PROMO_TYPES = [
  { value: "discount_pct", label: "Discount %", icon: "%" },
  { value: "discount_fix", label: "Fixed Amount", icon: "−" },
  { value: "fixed_price", label: "Fixed Price", icon: "=" },
  { value: "qty_tiered", label: "Tiered", icon: "↑" },
  { value: "buy_x_get_y", label: "Buy X Get Y", icon: "🎁" },
  { value: "spend_get_free", label: "Spend & Free", icon: "🛍" },
  { value: "bundle", label: "Bundle", icon: "📦" },
  { value: "flash", label: "Flash Sale", icon: "⚡" },
] as const;

const STATUS_COLORS: Record<string, { dot: string; label: string; bg: string; text: string }> = {
  active: { dot: "#16a34a", label: "Active", bg: "rgba(22,163,74,0.1)", text: "#16a34a" },
  draft:  { dot: "#6b7280", label: "Draft",  bg: "rgba(107,114,128,0.1)", text: "#6b7280" },
  closed: { dot: "#dc2626", label: "Closed", bg: "rgba(220,38,38,0.1)",  text: "#dc2626" },
};

const emptyItem = () => ({ itemId: "", baseItemNo: "", name: "", color: "", variantCode: "", unit: "PCS", netPrice: "", retailPrice: "", stock: "" });
const emptyPromo = (): PromoFormData => ({ name: "", type: "discount_pct", isActive: true, applyToAll: false, discountPct: "", discountFix: "", fixedPrice: "", buyQty: 1, getFreeQty: 1, spendMinAmount: "", bundlePrice: "", flashStartTime: "", flashEndTime: "", minPurchaseQty: 1, maxUsageCount: "", tiers: [], itemIds: [] });

// ── Ring chart component ───────────────────────────────────────────────────────
function RingChart({ pct, color, size = 64, stroke = 7 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct, 100) / 100 * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)" }} />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);

  const [event,  setEvent]  = useState<EventRow | null>(null);
  const [items,  setItems]  = useState<EventItem[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [stats,  setStats]  = useState<EventStats | null>(null);
  const [txns,   setTxns]   = useState<Transaction[]>([]);
  const [tab,    setTab]    = useState<Tab>("dashboard");
  const [isLocalView, setIsLocalView] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const [pendingLocalCount, setPendingLocalCount] = useState(0);

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm,     setItemForm]     = useState(emptyItem());
  const [editItemId,   setEditItemId]   = useState<number | null>(null);
  const [savingItem,   setSavingItem]   = useState(false);
  const [itemSearch,   setItemSearch]   = useState("");
  const [inlineEdit,   setInlineEdit]   = useState<number | null>(null);
  const [inlineVals,   setInlineVals]   = useState({ retailPrice: "", netPrice: "", stock: "" });
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoForm,     setPromoForm]     = useState<PromoFormData>(emptyPromo());
  const [editPromoId,   setEditPromoId]   = useState<number | null>(null);
  const [savingPromo,   setSavingPromo]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const evRes = await fetch(`/api/events`, { cache: "no-store" });
      if (!evRes.ok) throw new Error();
      const evRows = (await evRes.json()) as EventRow[];
      const ev = evRows.find((row) => row.id === eventId) ?? null;
      if (ev) {
        const [itemsR, promosR, statsR, txnsR] = await Promise.allSettled([
          fetch(`/api/events/${eventId}/products`, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
          fetch(`/api/events/${eventId}/promos`, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
          fetch(`/api/events/${eventId}/stats`, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
          fetch(`/api/events/${eventId}/transactions`, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
        ]);
        setEvent(ev);
        setItems(itemsR.status === "fulfilled" && Array.isArray(itemsR.value) ? itemsR.value : []);
        setPromos(promosR.status === "fulfilled" && Array.isArray(promosR.value) ? promosR.value : []);
        setStats(statsR.status === "fulfilled" ? statsR.value : null);
        setTxns(txnsR.status === "fulfilled" && Array.isArray(txnsR.value) ? txnsR.value : []);
        setIsLocalView(false);
        try {
          const localTxns = await fetch(`/api/local/events/${eventId}/transactions`, { cache: "no-store" }).then(r => r.ok ? r.json() : []);
          setPendingLocalCount(Array.isArray(localTxns) ? localTxns.filter((t: any) => t.syncStatus === "pending" || t.syncStatus === "failed").length : 0);
        } catch { setPendingLocalCount(0); }
        return;
      }
      setEvent(null); setItems([]); setPromos([]); setStats(null); setTxns([]); setPendingLocalCount(0); setIsLocalView(false);
    } catch {
      try {
        const [bundle, localStats, localTxns] = await Promise.all([
          fetch(`/api/local/events/${eventId}/bundle`, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
          fetch(`/api/local/events/${eventId}/stats`, { cache: "no-store" }).then(r => r.json()),
          fetch(`/api/local/events/${eventId}/transactions`, { cache: "no-store" }).then(r => r.json()),
        ]);
        const localItems = bundle.items as EventItem[];
        const pendingCount = Array.isArray(localTxns) ? localTxns.filter((t: any) => t.syncStatus === "pending" || t.syncStatus === "failed").length : 0;
        setEvent(bundle.event as EventRow);
        setItems(localItems);
        setPromos(Array.isArray(bundle.promos) ? bundle.promos as Promo[] : []);
        setTxns(localTxns as Transaction[]);
        setStats({ txnCount: Number(localStats.txnCount ?? 0), revenue: Number(localStats.revenue ?? 0), discount: Number(localStats.discount ?? 0), itemsSold: Number(localStats.itemsSold ?? 0), today: { txnCount: Number(localStats.todayTxnCount ?? 0), revenue: Number(localStats.todayRevenue ?? 0), discount: Number(localStats.todayDiscount ?? 0), itemsSold: Number(localStats.todayItemsSold ?? 0) }, stock: { totalItems: Number(localStats.totalItems ?? localItems.length), outOfStock: localItems.filter(i => Number(i.stock) <= 0).length, lowStock: localItems.filter(i => Number(i.stock) > 0 && Number(i.stock) <= 5).length, totalUnits: Number(localStats.totalUnits ?? 0), originalUnits: Number(localStats.totalUnits ?? 0) + Number(localStats.itemsSold ?? 0), totalStockValue: localItems.reduce((s, i) => s + Number(i.stock ?? 0) * Number(i.netPrice ?? 0), 0), remainingValue: localItems.reduce((s, i) => s + Number(i.stock ?? 0) * Number(i.netPrice ?? 0), 0) } });
        setPendingLocalCount(pendingCount);
        setIsLocalView(true);
      } catch { setEvent(null); setItems([]); setPromos([]); setStats(null); setTxns([]); setPendingLocalCount(0); setIsLocalView(false); }
    }
  }, [eventId]);

  async function syncLocalSales() {
    setSyncingLocal(true);
    try {
      const res = await fetch(`/api/local/events/${eventId}/sync`, { method: "POST" });
      const result = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(result.error);
      await load();
      if (result.synced > 0) alert(`${result.synced} sale(s) synced to cloud.`);
      else alert("No pending local sales to sync.");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed to sync."); } finally { setSyncingLocal(false); }
  }

  useEffect(() => { load(); }, [load]);

  const card = { background: "var(--card)", borderColor: "var(--border)" };
  const inp  = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400";
  const ist  = { borderColor: "var(--border)", color: "var(--foreground)", background: "var(--input, var(--card))" };
  const statusMeta = STATUS_COLORS[event?.status ?? "draft"] ?? STATUS_COLORS.draft;

  const filteredItems = items.filter(it => {
    const q = itemSearch.toLowerCase();
    return !q || it.name.toLowerCase().includes(q) || it.itemId.toLowerCase().includes(q) || (it.variantCode ?? "").toLowerCase().includes(q);
  });

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault(); setSavingItem(true);
    if (editItemId) { await fetch(`/api/events/${eventId}/products`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editItemId, ...itemForm }) }); }
    else { await fetch(`/api/events/${eventId}/products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(itemForm) }); }
    setSavingItem(false); setShowItemForm(false); setItemForm(emptyItem()); setEditItemId(null); load();
  }
  async function handleDeleteItem(itemId: number) { if (!confirm("Remove this item?")) return; await fetch(`/api/events/${eventId}/products?id=${itemId}`, { method: "DELETE" }); load(); }
  function openEditItem(item: EventItem) { setItemForm({ itemId: item.itemId, baseItemNo: item.baseItemNo ?? "", name: item.name, color: item.color ?? "", variantCode: item.variantCode ?? "", unit: item.unit ?? "PCS", netPrice: item.netPrice, retailPrice: item.retailPrice, stock: String(item.stock) }); setEditItemId(item.id); setShowItemForm(true); }
  function startInlineEdit(item: EventItem) { setInlineEdit(item.id); setInlineVals({ retailPrice: item.retailPrice, netPrice: item.netPrice, stock: String(item.stock) }); }
  async function saveInlineEdit(itemId: number) { await fetch(`/api/events/${eventId}/products`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: itemId, ...inlineVals }) }); setInlineEdit(null); load(); }
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; setImporting(true); setImportMsg(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`/api/events/${eventId}/products/import`, { method: "POST", body: fd });
      const result = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(result.error);
      const errors = Array.isArray(result.errors) ? result.errors : [];
      setImportMsg({ ok: errors.length === 0, text: `${result.inserted ?? 0} inserted, ${result.updated ?? 0} updated, ${result.skipped ?? 0} skipped${errors.length > 0 ? ` — ${errors.slice(0, 2).join("; ")}` : ""}` });
      await load();
    } catch (error) { setImportMsg({ ok: false, text: error instanceof Error ? error.message : "Import failed." }); } finally { setImporting(false); if (e.target) e.target.value = ""; setTimeout(() => setImportMsg(null), 7000); }
  }
  async function handleSavePromo(e: React.FormEvent) {
    e.preventDefault(); setSavingPromo(true);
    const payload = { ...promoForm, discountPct: promoForm.discountPct || null, discountFix: promoForm.discountFix || null, fixedPrice: promoForm.fixedPrice || null, spendMinAmount: promoForm.spendMinAmount || null, bundlePrice: promoForm.bundlePrice || null, flashStartTime: promoForm.flashStartTime || null, flashEndTime: promoForm.flashEndTime || null, maxUsageCount: promoForm.maxUsageCount || null, ...(editPromoId ? { id: editPromoId } : {}) };
    await fetch(`/api/events/${eventId}/promos`, { method: editPromoId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSavingPromo(false); setShowPromoForm(false); setPromoForm(emptyPromo()); setEditPromoId(null); load();
  }
  async function handleDeletePromo(promoId: number) { if (!confirm("Delete this promo?")) return; await fetch(`/api/events/${eventId}/promos?id=${promoId}`, { method: "DELETE" }); load(); }
  async function togglePromoActive(p: Promo) { await fetch(`/api/events/${eventId}/promos`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...p, id: p.id, isActive: !p.isActive, tiers: p.tiers, itemIds: p.items.map(i => i.eventItemId) }) }); load(); }
  function openEditPromo(p: Promo) { setPromoForm({ name: p.name, type: p.type, isActive: p.isActive, applyToAll: p.applyToAll, discountPct: p.discountPct ?? "", discountFix: p.discountFix ?? "", fixedPrice: p.fixedPrice ?? "", buyQty: p.buyQty ?? 1, getFreeQty: p.getFreeQty ?? 1, spendMinAmount: p.spendMinAmount ?? "", bundlePrice: p.bundlePrice ?? "", flashStartTime: p.flashStartTime ?? "", flashEndTime: p.flashEndTime ?? "", minPurchaseQty: p.minPurchaseQty ?? 1, maxUsageCount: String(p.maxUsageCount ?? ""), tiers: p.tiers, itemIds: p.items.map(i => i.eventItemId) }); setEditPromoId(p.id); setShowPromoForm(true); }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "dashboard",       label: "Overview",     icon: <LayoutDashboard size={13} /> },
    { key: "transactions",    label: "Sales",        icon: <History size={13} />,        count: txns.length },
    { key: "items",           label: "Items",        icon: <Package2 size={13} />,       count: items.length },
    { key: "stock",           label: "Stock",        icon: <Activity size={13} /> },
    { key: "promos",          label: "Promos",       icon: <Tag size={13} />,            count: promos.length },
    { key: "cashierSessions", label: "Sessions",     icon: <User size={13} /> },
    { key: "cashDrawer",      label: "Cash",         icon: <WalletCards size={13} /> },
    { key: "receipt",         label: "Receipt",      icon: <ReceiptText size={13} /> },
    { key: "users",           label: "Users",        icon: <User size={13} /> },
  ];

  return (
    <div className="space-y-4 pb-10">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <Link href="/events" className="mt-1 p-2 rounded-xl border transition-all hover:bg-black/5" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          <ChevronLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--foreground)" }}>{event?.name ?? "Loading…"}</h1>
            <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: statusMeta.bg, color: statusMeta.text }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusMeta.dot }} />
              {statusMeta.label}
            </span>
            {pendingLocalCount > 0 && (
              <button onClick={syncLocalSales} disabled={syncingLocal}
                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full disabled:opacity-50 transition-all"
                style={{ background: "rgba(245,158,11,0.12)", color: "#b45309" }}>
                {syncingLocal ? <RefreshCw size={10} className="animate-spin" /> : <ArrowUpRight size={10} />}
                {pendingLocalCount} pending
              </button>
            )}
          </div>
          {event?.location && <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{event.location}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a href={`/api/events/${eventId}/report`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-black/5"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            <FileSpreadsheet size={13} /> Export
          </a>
          <Link href={`/pos?event=${eventId}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: "var(--brand-orange)", color: "white" }}>
            <Zap size={14} /> Open POS
          </Link>
        </div>
      </div>

      {/* ── Tabs (scrollable) ── */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto no-scrollbar" style={{ background: "var(--muted)" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0"
            style={{ background: tab === t.key ? "var(--card)" : "transparent", color: tab === t.key ? "var(--brand-orange)" : "var(--muted-foreground)", boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>
            {t.icon}{t.label}
            {t.count !== undefined && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: tab === t.key ? "rgba(255,101,63,0.12)" : "var(--border)", color: tab === t.key ? "var(--brand-orange)" : "var(--muted-foreground)" }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DASHBOARD TAB — ring charts, clean numbers, recent sales  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {tab === "dashboard" && stats && (() => {
        const soldPct  = stats.stock.originalUnits > 0 ? Math.round((stats.itemsSold / stats.stock.originalUnits) * 100) : 0;
        const revPct   = stats.stock.totalStockValue > 0 ? Math.round((stats.revenue / stats.stock.totalStockValue) * 100) : 0;
        return (
          <div className="space-y-4">
            {/* ── Top KPI row ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Revenue", value: formatRupiah(stats.revenue), sub: `Today ${formatRupiah(stats.today.revenue)}`, color: "var(--brand-orange)", icon: <DollarSign size={14} /> },
                { label: "Transactions", value: stats.txnCount.toLocaleString("id-ID"), sub: `Today ${stats.today.txnCount}`, color: "#0369a1", icon: <TrendingUp size={14} /> },
                { label: "Items Sold", value: `${stats.itemsSold.toLocaleString("id-ID")}`, sub: `Today ${stats.today.itemsSold} units`, color: "#7c3aed", icon: <ShoppingBag size={14} /> },
                { label: "Discounts", value: formatRupiah(stats.discount), sub: `Today ${formatRupiah(stats.today.discount)}`, color: "#16a34a", icon: <Tag size={14} /> },
              ].map(({ label, value, sub, color, icon }) => (
                <div key={label} className="rounded-2xl border p-4" style={card}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{label}</p>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>{icon}</div>
                  </div>
                  <p className="text-xl font-black" style={{ color: "var(--foreground)" }}>{value}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{sub}</p>
                </div>
              ))}
            </div>

            {/* ── Ring charts + recent sales ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">

              {/* Ring charts */}
              <div className="rounded-2xl border p-5 space-y-5" style={card}>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Inventory Progress</p>
                <div className="space-y-4">
                  {/* Revenue vs Stock Value */}
                  <div className="flex items-center gap-4">
                    <div className="relative flex-shrink-0">
                      <RingChart pct={revPct} color="var(--brand-orange)" size={72} stroke={8} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-black" style={{ color: "var(--brand-orange)" }}>{revPct}%</span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Revenue Percentage</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{formatRupiah(stats.revenue)} of {formatRupiah(stats.stock.totalStockValue)}</p>
                    </div>
                  </div>
                  {/* Units sold */}
                  <div className="flex items-center gap-4">
                    <div className="relative flex-shrink-0">
                      <RingChart pct={soldPct} color="#7c3aed" size={72} stroke={8} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-black" style={{ color: "#7c3aed" }}>{soldPct}%</span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Units Sold Percentage</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{stats.itemsSold.toLocaleString("id-ID")} of {stats.stock.originalUnits.toLocaleString("id-ID")} total</p>
                    </div>
                  </div>
                  {/* Stock health row */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { label: "Remaining", value: stats.stock.totalUnits, color: "var(--foreground)" },
                      { label: "Low Stock", value: stats.stock.lowStock, color: "#f59e0b" },
                      { label: "Out", value: stats.stock.outOfStock, color: "#ef4444" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: "var(--muted)" }}>
                        <p className="text-base font-black" style={{ color }}>{value}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setTab("stock")} className="w-full rounded-xl py-2 text-xs font-semibold border transition-all hover:bg-black/5" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                    Manage Stock →
                  </button>
                </div>
              </div>

              {/* Recent sales */}
              <div className="rounded-2xl border p-5" style={card}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Recent Sales</p>
                  <button onClick={() => setTab("transactions")} className="text-xs font-bold flex items-center gap-1" style={{ color: "var(--brand-orange)" }}>
                    All <ChevronRight size={12} />
                  </button>
                </div>
                {txns.length === 0 ? (
                  <div className="py-8 text-center">
                    <History size={28} className="mx-auto mb-2 opacity-20" style={{ color: "var(--muted-foreground)" }} />
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {txns.slice(0, 7).map(txn => {
                      const displayId = txn.displayId ?? txn.clientTxnId ?? `#${txn.id}`;
                      return (
                        <div key={txn.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-black/[0.03]" style={{ borderBottom: "none" }}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,101,63,0.08)" }}>
                            <DollarSign size={13} style={{ color: "var(--brand-orange)" }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold font-mono truncate" style={{ color: "var(--foreground)" }}>{displayId}</p>
                            <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{txn.paymentMethod ?? "—"} · {formatDate(txn.createdAt)}</p>
                          </div>
                          <span className="text-sm font-black flex-shrink-0" style={{ color: "var(--brand-orange)" }}>{formatRupiah(txn.finalAmount)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ITEMS TAB — scrollable table                               */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {tab === "items" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted-foreground)" }} />
              <input value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Search items…" className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" style={ist} />
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
            <button onClick={() => fileRef.current?.click()} disabled={importing || isLocalView} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              <Upload size={12} /> {importing ? "Importing…" : "Import"}
            </button>
            <a href={`/api/events/${eventId}/products/export`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              <Download size={12} /> Export
            </a>
            <button disabled={isLocalView} onClick={() => { setItemForm(emptyItem()); setEditItemId(null); setShowItemForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ml-auto"
              style={{ background: "var(--brand-orange)", color: "white" }}>
              <Plus size={13} /> Add Item
            </button>
          </div>

          {importMsg && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium" style={{ background: importMsg.ok ? "rgba(22,163,74,0.08)" : "rgba(239,68,68,0.08)", color: importMsg.ok ? "#16a34a" : "#dc2626" }}>
              {importMsg.ok ? <Check size={13} /> : <AlertCircle size={13} />} {importMsg.text}
            </div>
          )}

          {/* Scrollable table container */}
          <div className="rounded-2xl border overflow-hidden" style={card}>
            <div className="overflow-x-auto" style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
              {filteredItems.length === 0 ? (
                <div className="py-16 text-center">
                  <Package2 size={32} className="mx-auto opacity-15" style={{ color: "var(--muted-foreground)" }} />
                  <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>{itemSearch ? "No items match." : "No items yet."}</p>
                </div>
              ) : (
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="sticky top-0 z-10" style={{ background: "var(--muted)" }}>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Ref / Variant", "Name", "Net Price", "Stock", ""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, i) => {
                      const isEditing = inlineEdit === item.id;
                      const stock = Number(item.stock);
                      const stockColor = stock <= 0 ? "#ef4444" : stock <= 5 ? "#f59e0b" : "#16a34a";
                      const stockBg = stock <= 0 ? "rgba(239,68,68,0.08)" : stock <= 5 ? "rgba(245,158,11,0.08)" : "rgba(22,163,74,0.08)";
                      return (
                        <tr key={item.id} className="transition-colors hover:bg-black/[0.02]" style={{ borderBottom: i < filteredItems.length - 1 ? "1px solid var(--border)" : "none" }}>
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-bold" style={{ color: "var(--foreground)" }}>{item.itemId}</p>
                            {item.variantCode && <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{item.variantCode}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm truncate max-w-[200px]" style={{ color: "var(--foreground)" }}>{item.name}</p>
                            {item.color && <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{item.color}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing
                              ? <input type="number" min="0" value={inlineVals.netPrice} onChange={e => setInlineVals({ ...inlineVals, netPrice: e.target.value })} className="w-28 rounded-lg border px-2 py-1 text-xs focus:outline-none" style={ist} />
                              : <span className="text-sm font-bold" style={{ color: "var(--brand-orange)" }}>{formatRupiah(item.netPrice)}</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            {isEditing
                              ? <input type="number" min="0" value={inlineVals.stock} onChange={e => setInlineVals({ ...inlineVals, stock: e.target.value })} className="w-20 rounded-lg border px-2 py-1 text-xs focus:outline-none" style={ist} />
                              : <span className="inline-flex px-2 py-1 rounded-full text-xs font-bold" style={{ color: stockColor, background: stockBg }}>{stock <= 0 ? "Out" : stock}</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {isEditing ? (
                                <>
                                  <button onClick={() => saveInlineEdit(item.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}><Check size={11} /> Save</button>
                                  <button onClick={() => setInlineEdit(null)} className="p-1.5 rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}><X size={11} /></button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => startInlineEdit(item)} className="p-1.5 rounded-lg" style={{ background: "rgba(255,200,92,0.12)", color: "#b45309" }}><Pencil size={11} /></button>
                                  <button onClick={() => openEditItem(item)} className="p-1.5 rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}><Layers size={11} /></button>
                                  <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 rounded-lg" style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}><Trash2 size={11} /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {filteredItems.length > 0 && (
              <div className="px-4 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* PROMOS TAB                                                  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {tab === "promos" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button disabled={isLocalView} onClick={() => { setPromoForm(emptyPromo()); setEditPromoId(null); setShowPromoForm(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: "var(--brand-orange)", color: "white" }}>
              <Plus size={14} /> New Promo
            </button>
          </div>
          {promos.length === 0 ? (
            <div className="rounded-2xl border py-16 text-center" style={card}>
              <Tag size={28} className="mx-auto opacity-15" style={{ color: "var(--muted-foreground)" }} />
              <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>No promos yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {promos.map(p => {
                const meta = PROMO_TYPES.find(t => t.value === p.type);
                return (
                  <div key={p.id} className="rounded-2xl border px-4 py-3.5 flex items-center gap-4 transition-all" style={{ ...card, opacity: p.isActive ? 1 : 0.5 }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg" style={{ background: "var(--muted)" }}>{meta?.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{p.name}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{meta?.label}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: p.applyToAll ? "rgba(255,101,63,0.08)" : "var(--secondary)", color: p.applyToAll ? "var(--brand-orange)" : "var(--secondary-foreground)" }}>{p.applyToAll ? "All items" : `${p.items.length} item(s)`}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => togglePromoActive(p)} className="p-1.5 rounded-lg" style={{ background: p.isActive ? "rgba(22,163,74,0.1)" : "var(--muted)", color: p.isActive ? "#16a34a" : "var(--muted-foreground)" }}>{p.isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}</button>
                      <button onClick={() => openEditPromo(p)} className="p-1.5 rounded-lg" style={{ background: "rgba(255,200,92,0.12)", color: "#b45309" }}><Pencil size={13} /></button>
                      <button onClick={() => handleDeletePromo(p.id)} className="p-1.5 rounded-lg" style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "stock" && <StockTab eventId={eventId} items={items} onStockUpdated={load} ist={ist} card={card} />}
      {tab === "transactions" && <TransactionsTab eventId={eventId} transactions={txns} onRefresh={load} />}
      {tab === "cashDrawer" && <CashDrawerCountsTab eventId={eventId} />}
      {tab === "receipt" && <ReceiptTemplateTab eventId={eventId} eventName={event?.name} />}
      {tab === "users" && <EventUsersPanel eventId={eventId} />}
      {tab === "cashierSessions" && <CashierSessionsTab eventId={eventId} />}

      {/* ── Add/Edit Item Modal ── */}
      {showItemForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,10,40,0.45)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl border w-full max-w-lg shadow-2xl" style={card}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="font-bold" style={{ color: "var(--foreground)" }}>{editItemId ? "Edit Item" : "Add Item"}</h2>
              <button onClick={() => setShowItemForm(false)} className="p-1.5 rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}><X size={14} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Reference No. *</label><input required value={itemForm.itemId} onChange={e => setItemForm({ ...itemForm, itemId: e.target.value })} className={inp} style={ist} /></div>
                <div><label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Variant Code</label><input value={itemForm.variantCode} onChange={e => setItemForm({ ...itemForm, variantCode: e.target.value })} className={inp} style={ist} /></div>
              </div>
              <div><label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Product Name *</label><input required value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} className={inp} style={ist} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Color</label><input value={itemForm.color} onChange={e => setItemForm({ ...itemForm, color: e.target.value })} className={inp} style={ist} /></div>
                <div><label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Unit</label><select value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })} className={inp} style={ist}>{["PCS","PRS","SET","BOX","KG"].map(u => <option key={u}>{u}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Net Price *</label><input type="number" min="0" required value={itemForm.netPrice} onChange={e => setItemForm({ ...itemForm, netPrice: e.target.value })} className={inp} style={ist} /></div>
                <div><label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Retail Price</label><input type="number" min="0" value={itemForm.retailPrice} onChange={e => setItemForm({ ...itemForm, retailPrice: e.target.value })} className={inp} style={ist} /></div>
                <div><label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Stock</label><input type="number" min="0" required value={itemForm.stock} onChange={e => setItemForm({ ...itemForm, stock: e.target.value })} className={inp} style={ist} /></div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={savingItem} className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40" style={{ background: "var(--brand-orange)", color: "white" }}>{savingItem ? "Saving…" : editItemId ? "Update" : "Add to Event"}</button>
                <button type="button" onClick={() => setShowItemForm(false)} className="px-4 rounded-xl border text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPromoForm && (
        <PromoFormModal editPromoId={editPromoId} promoForm={promoForm} setPromoForm={setPromoForm} items={items} onSave={handleSavePromo} onClose={() => { setShowPromoForm(false); setPromoForm(emptyPromo()); setEditPromoId(null); }} saving={savingPromo} card={card} inp={inp} ist={ist} />
      )}
    </div>
  );
}