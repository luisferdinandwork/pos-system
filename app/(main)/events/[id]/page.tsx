// app/(main)/events/[id]/page.tsx
// Each event opens as its own mini-app with 5 tabs:
//   Dashboard · Items · Promos · Stock · Transactions · Users
"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Trash2, X, Upload, Download, Pencil,
  Tag, ChevronLeft, Search, Package2, Check,
  AlertCircle, Layers, Zap, ToggleLeft, ToggleRight,
  LayoutDashboard, History, ShoppingBag,
  TrendingUp, DollarSign, Activity, RefreshCw,
  User, FileSpreadsheet,
} from "lucide-react";
import Link from "next/link";
import { formatRupiah, formatDate, safeFloat } from "@/lib/utils";
import { EventUsersPanel } from "@/components/events/EventUsersPanel";
import { StockTab } from "@/components/events/StockTab";
import { PromoFormModal, type PromoFormData } from "@/components/events/PromoFormModal";

// ── Types ─────────────────────────────────────────────────────────────────────
type EventRow = {
  id: number; name: string; status: string;
  location: string | null; startDate: string | null; endDate: string | null;
};

type EventItem = {
  id: number; eventId: number; stock: number;
  retailPrice: string; netPrice: string;
  itemId: string; name: string; color: string | null;
  variantCode: string | null; unit: string | null; baseItemNo: string | null;
};

type PromoItem = {
  id: number; eventItemId: number;
  name: string; variantCode: string | null; itemId: string;
};

type Tier = {
  minQty: number; discount: string;
};

type Promo = {
  id: number; name: string; type: string;
  isActive: boolean; applyToAll: boolean;
  discountPct: string | null; discountFix: string | null;
  fixedPrice: string | null; buyQty: number | null; getFreeQty: number | null;
  spendMinAmount: string | null; bundlePrice: string | null;
  flashStartTime: string | null; flashEndTime: string | null;
  minPurchaseQty: number | null; maxUsageCount: number | null;
  tiers: Tier[]; items: PromoItem[];
};

type Transaction = {
  id: number; eventId: number; totalAmount: string; discount: string;
  finalAmount: string; paymentMethod: string | null;
  paymentReference: string | null; createdAt: string | null;
};

type EventStats = {
  txnCount: number; revenue: number; discount: number; itemsSold: number;
  today: { txnCount: number; revenue: number; discount: number; itemsSold: number };
  stock: {
    totalItems:      number;
    outOfStock:      number;
    lowStock:        number;
    totalUnits:      number;
    originalUnits:   number;
    totalStockValue: number;
    remainingValue:  number;
  };
};

type Tab = "dashboard" | "items" | "promos" | "stock" | "transactions" | "users";

// ── Promo type definitions ────────────────────────────────────────────────────
const PROMO_TYPES = [
  { value: "discount_pct",   label: "Discount %",   desc: "Percentage off the net price",              icon: "%" },
  { value: "discount_fix",   label: "Fixed Amount", desc: "Fixed Rp amount off",                       icon: "−" },
  { value: "fixed_price",    label: "Fixed Price",  desc: "Sell at a set price regardless of net",     icon: "=" },
  { value: "qty_tiered",     label: "Tiered",       desc: "Buy more, get higher discount",             icon: "↑" },
  { value: "buy_x_get_y",    label: "Buy X Get Y",  desc: "Buy X qty, get Y qty free",                 icon: "🎁" },
  { value: "spend_get_free", label: "Spend & Free", desc: "Spend min amount → receive free item",      icon: "🛍" },
  { value: "bundle",         label: "Bundle",       desc: "Selected items together at a bundle price", icon: "📦" },
  { value: "flash",          label: "Flash Sale",   desc: "Time-limited discount",                     icon: "⚡" },
] as const;

const STATUS_COLORS: Record<string, { dot: string; label: string; bg: string }> = {
  active: { dot: "#16a34a", label: "Active", bg: "rgba(22,163,74,0.1)"   },
  draft:  { dot: "#6b7280", label: "Draft",  bg: "rgba(107,114,128,0.1)" },
  closed: { dot: "#dc2626", label: "Closed", bg: "rgba(220,38,38,0.1)"   },
};

const emptyItem = () => ({
  itemId: "", baseItemNo: "", name: "", color: "",
  variantCode: "", unit: "PCS", netPrice: "", retailPrice: "", stock: "",
});

const emptyPromo = (): PromoFormData => ({
  name: "", type: "discount_pct", isActive: true, applyToAll: false,
  discountPct: "", discountFix: "", fixedPrice: "",
  buyQty: 1, getFreeQty: 1, spendMinAmount: "", bundlePrice: "",
  flashStartTime: "", flashEndTime: "",
  minPurchaseQty: 1, maxUsageCount: "",
  tiers: [], itemIds: [],
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function StockBadge({ stock }: { stock: number }) {
  const color = stock <= 0 ? "#ef4444" : stock <= 5 ? "#f59e0b" : "#16a34a";
  const bg    = stock <= 0 ? "rgba(239,68,68,0.1)" : stock <= 5 ? "rgba(245,158,11,0.1)" : "rgba(22,163,74,0.1)";
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ color, background: bg }}>
      {stock <= 0 ? "Out" : stock}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EventDetailPage() {
  const { id }  = useParams<{ id: string }>();
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

  // Item form
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm,     setItemForm]     = useState(emptyItem());
  const [editItemId,   setEditItemId]   = useState<number | null>(null);
  const [savingItem,   setSavingItem]   = useState(false);
  const [itemSearch,   setItemSearch]   = useState("");

  // Inline edit
  const [inlineEdit, setInlineEdit] = useState<number | null>(null);
  const [inlineVals, setInlineVals] = useState({ retailPrice: "", netPrice: "", stock: "" });

  // Promo form
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoForm,     setPromoForm]     = useState<PromoFormData>(emptyPromo());
  const [editPromoId,   setEditPromoId]   = useState<number | null>(null);
  const [savingPromo,   setSavingPromo]   = useState(false);

  // Product import
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Expanded transaction
  const [expandedTxn, setExpandedTxn] = useState<number | null>(null);
  const [txnItems,    setTxnItems]    = useState<Record<number, unknown[]>>({});

  const load = useCallback(async () => {
    // 1. Try cloud first
    try {
      const evRes = await fetch(`/api/events`, { cache: "no-store" });
      if (!evRes.ok) throw new Error("Failed to load events");

      const evRows = (await evRes.json()) as EventRow[];
      const ev = evRows.find((row) => row.id === eventId) ?? null;

      if (ev) {
        const [itemsResult, promosResult, statsResult, txnsResult] =
          await Promise.allSettled([
            fetch(`/api/events/${eventId}/products`, { cache: "no-store" }).then((r) => {
              if (!r.ok) throw new Error("Failed to load products");
              return r.json();
            }),
            fetch(`/api/events/${eventId}/promos`, { cache: "no-store" }).then((r) => {
              if (!r.ok) throw new Error("Failed to load promos");
              return r.json();
            }),
            fetch(`/api/events/${eventId}/stats`, { cache: "no-store" }).then((r) => {
              if (!r.ok) throw new Error("Failed to load stats");
              return r.json();
            }),
            fetch(`/api/events/${eventId}/transactions`, { cache: "no-store" }).then((r) => {
              if (!r.ok) throw new Error("Failed to load transactions");
              return r.json();
            }),
          ]);

        setEvent(ev);
        setItems(itemsResult.status === "fulfilled" && Array.isArray(itemsResult.value) ? itemsResult.value : []);
        setPromos(promosResult.status === "fulfilled" && Array.isArray(promosResult.value) ? promosResult.value : []);
        setStats(statsResult.status === "fulfilled" ? statsResult.value : {
          txnCount: 0, revenue: 0, discount: 0, itemsSold: 0,
          today: { txnCount: 0, revenue: 0, discount: 0, itemsSold: 0 },
          stock: { totalItems: 0, outOfStock: 0, lowStock: 0, totalUnits: 0, originalUnits: 0, totalStockValue: 0, remainingValue: 0 },
        });
        setTxns(txnsResult.status === "fulfilled" && Array.isArray(txnsResult.value) ? txnsResult.value : []);
        setIsLocalView(false);
        setPendingLocalCount(0);
        return;
      }

      // Event not found in cloud
      setEvent(null); setItems([]); setPromos([]); setStats(null); setTxns([]);
      setPendingLocalCount(0); setIsLocalView(false);
      return;
    } catch (cloudError) {
      console.warn("[EventDetailPage] Cloud load failed, trying local SQLite:", cloudError);
    }

    // 2. Local SQLite fallback
    try {
      const [bundle, localStats, localTxns] = await Promise.all([
        fetch(`/api/local/events/${eventId}/bundle`, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error("Local event is not prepared");
          return r.json();
        }),
        fetch(`/api/local/events/${eventId}/stats`, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error("Failed to load local stats");
          return r.json();
        }),
        fetch(`/api/local/events/${eventId}/transactions`, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error("Failed to load local transactions");
          return r.json();
        }),
      ]);

      const localEvent  = bundle.event as EventRow;
      const localItems  = bundle.items as EventItem[];
      const localPromos = Array.isArray(bundle.promos) ? bundle.promos : [];
      const pendingCount = Array.isArray(localTxns)
        ? localTxns.filter((t) => t.syncStatus === "pending" || t.syncStatus === "failed").length
        : 0;

      setEvent(localEvent);
      setItems(localItems);
      setPromos(localPromos as Promo[]);
      setTxns(localTxns as Transaction[]);
      setStats({
        txnCount:  Number(localStats.txnCount  ?? 0),
        revenue:   Number(localStats.revenue   ?? 0),
        discount:  Number(localStats.discount  ?? 0),
        itemsSold: Number(localStats.itemsSold ?? 0),
        today: {
          txnCount:  Number(localStats.todayTxnCount  ?? localStats.txnCount  ?? 0),
          revenue:   Number(localStats.todayRevenue   ?? localStats.revenue   ?? 0),
          discount:  Number(localStats.todayDiscount  ?? 0),
          itemsSold: Number(localStats.todayItemsSold ?? 0),
        },
        stock: {
          totalItems:      Number(localStats.totalItems ?? localItems.length),
          outOfStock:      localItems.filter((i) => Number(i.stock) <= 0).length,
          lowStock:        localItems.filter((i) => Number(i.stock) > 0 && Number(i.stock) <= 5).length,
          totalUnits:      Number(localStats.totalUnits ?? 0),
          originalUnits:   Number(localStats.totalUnits ?? 0) + Number(localStats.itemsSold ?? 0),
          totalStockValue: localItems.reduce((s, i) => s + Number(i.stock ?? 0) * Number(i.netPrice ?? 0), 0),
          remainingValue:  localItems.reduce((s, i) => s + Number(i.stock ?? 0) * Number(i.netPrice ?? 0), 0),
        },
      });
      setPendingLocalCount(pendingCount);
      setIsLocalView(true);
    } catch (localError) {
      console.warn("[EventDetailPage] Local fallback unavailable:", localError);
      setEvent(null); setItems([]); setPromos([]); setStats(null); setTxns([]);
      setPendingLocalCount(0); setIsLocalView(false);
    }
  }, [eventId]);

  async function syncLocalSales() {
    setSyncingLocal(true);
    try {
      const res    = await fetch(`/api/local/events/${eventId}/sync`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to sync local sales");
      alert(result.failed > 0 ? `${result.synced} synced, ${result.failed} failed.` : `${result.synced} local sales synced.`);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to sync local sales");
    } finally { setSyncingLocal(false); }
  }

  useEffect(() => { load(); }, [load]);

  // ── Style constants ─────────────────────────────────────────────────────────
  const card = { background: "var(--card)", borderColor: "var(--border)" };
  const inp  = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400";
  const ist  = { borderColor: "var(--border)", color: "var(--foreground)", background: "var(--input, var(--card))" };

  const statusMeta   = STATUS_COLORS[event?.status ?? "draft"] ?? STATUS_COLORS.draft;
  const filteredItems = items.filter((it) => {
    const q = itemSearch.toLowerCase();
    return !q || it.name.toLowerCase().includes(q) || it.itemId.toLowerCase().includes(q)
      || (it.variantCode ?? "").toLowerCase().includes(q);
  });

  // ── Item CRUD ───────────────────────────────────────────────────────────────
  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault(); setSavingItem(true);
    if (editItemId) {
      await fetch(`/api/events/${eventId}/products`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editItemId, ...itemForm }) });
    } else {
      await fetch(`/api/events/${eventId}/products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(itemForm) });
    }
    setSavingItem(false); setShowItemForm(false); setItemForm(emptyItem()); setEditItemId(null); load();
  }

  async function handleDeleteItem(itemId: number) {
    if (!confirm("Remove this item from the event?")) return;
    await fetch(`/api/events/${eventId}/products?id=${itemId}`, { method: "DELETE" });
    load();
  }

  function openEditItem(item: EventItem) {
    setItemForm({ itemId: item.itemId, baseItemNo: item.baseItemNo ?? "", name: item.name, color: item.color ?? "", variantCode: item.variantCode ?? "", unit: item.unit ?? "PCS", netPrice: item.netPrice, retailPrice: item.retailPrice, stock: String(item.stock) });
    setEditItemId(item.id); setShowItemForm(true);
  }

  function startInlineEdit(item: EventItem) {
    setInlineEdit(item.id);
    setInlineVals({ retailPrice: item.retailPrice, netPrice: item.netPrice, stock: String(item.stock) });
  }

  async function saveInlineEdit(itemId: number) {
    await fetch(`/api/events/${eventId}/products`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: itemId, ...inlineVals }) });
    setInlineEdit(null); load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setImportMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const res    = await fetch(`/api/events/${eventId}/products/import`, { method: "POST", body: fd });
    const result = await res.json();
    setImporting(false); e.target.value = "";
    const hasErrors = result.errors?.length > 0;
    setImportMsg({ ok: !hasErrors, text: hasErrors ? `${result.inserted} inserted, ${result.updated} updated — ${result.errors.length} error(s): ${result.errors.slice(0, 2).join("; ")}` : `✓ ${result.inserted} inserted, ${result.updated} updated` });
    setTimeout(() => setImportMsg(null), 6000);
    load();
  }

  // ── Promo CRUD ──────────────────────────────────────────────────────────────
  async function handleSavePromo(e: React.FormEvent) {
    e.preventDefault(); setSavingPromo(true);
    const payload = { ...promoForm, discountPct: promoForm.discountPct || null, discountFix: promoForm.discountFix || null, fixedPrice: promoForm.fixedPrice || null, spendMinAmount: promoForm.spendMinAmount || null, bundlePrice: promoForm.bundlePrice || null, flashStartTime: promoForm.flashStartTime || null, flashEndTime: promoForm.flashEndTime || null, maxUsageCount: promoForm.maxUsageCount || null, ...(editPromoId ? { id: editPromoId } : {}) };
    await fetch(`/api/events/${eventId}/promos`, { method: editPromoId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSavingPromo(false); setShowPromoForm(false); setPromoForm(emptyPromo()); setEditPromoId(null); load();
  }

  async function handleDeletePromo(promoId: number) {
    if (!confirm("Delete this promo?")) return;
    await fetch(`/api/events/${eventId}/promos?id=${promoId}`, { method: "DELETE" });
    load();
  }

  async function togglePromoActive(p: Promo) {
    await fetch(`/api/events/${eventId}/promos`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...p, id: p.id, isActive: !p.isActive, tiers: p.tiers, itemIds: p.items.map((i) => i.eventItemId) }) });
    load();
  }

  function openEditPromo(p: Promo) {
    setPromoForm({ name: p.name, type: p.type, isActive: p.isActive, applyToAll: p.applyToAll, discountPct: p.discountPct ?? "", discountFix: p.discountFix ?? "", fixedPrice: p.fixedPrice ?? "", buyQty: p.buyQty ?? 1, getFreeQty: p.getFreeQty ?? 1, spendMinAmount: p.spendMinAmount ?? "", bundlePrice: p.bundlePrice ?? "", flashStartTime: p.flashStartTime ?? "", flashEndTime: p.flashEndTime ?? "", minPurchaseQty: p.minPurchaseQty ?? 1, maxUsageCount: String(p.maxUsageCount ?? ""), tiers: p.tiers, itemIds: p.items.map((i) => i.eventItemId) });
    setEditPromoId(p.id); setShowPromoForm(true);
  }

  // ── Transactions ────────────────────────────────────────────────────────────
  async function loadTxnItems(txnId: number) {
    if (txnItems[txnId]) { setExpandedTxn(expandedTxn === txnId ? null : txnId); return; }
    const data = await fetch(`/api/transactions/${txnId}/items`).then((r) => r.json());
    setTxnItems((p) => ({ ...p, [txnId]: data }));
    setExpandedTxn(txnId);
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "dashboard",    label: "Dashboard",    icon: <LayoutDashboard size={14} /> },
    { key: "items",        label: "Items",        icon: <Package2 size={14} />, count: items.length },
    { key: "promos",       label: "Promos",       icon: <Tag size={14} />, count: promos.length },
    { key: "stock",        label: "Stock",        icon: <Activity size={14} /> },
    { key: "transactions", label: "Transactions", icon: <History size={14} />, count: txns.length },
    { key: "users",        label: "Users",        icon: <User size={14} /> },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-10">

      {/* ── Event header ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Link href="/events" className="mt-1 p-2 rounded-xl border transition-all hover:bg-black/5" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          <ChevronLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate" style={{ color: "var(--foreground)" }}>{event?.name ?? "Loading…"}</h1>
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: statusMeta.bg, color: statusMeta.dot }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: statusMeta.dot }} />
              {statusMeta.label}
            </span>
          </div>
          {event?.location && <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>{event.location}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={`/api/events/${eventId}/report`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all hover:bg-black/5"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}
            title="Export full event report (Items, Stock, Transactions, Promos, Summary)"
          >
            <FileSpreadsheet size={14} /> Export Report
          </a>
          <Link href={`/pos?event=${eventId}`} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold flex-shrink-0" style={{ background: "var(--brand-orange)", color: "white" }}>
            <Zap size={14} /> Open POS
          </Link>
        </div>
      </div>

      {isLocalView && (
        <div className="rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: "rgba(3,105,161,0.08)", borderColor: "rgba(3,105,161,0.20)", color: "#0369a1" }}>
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-bold">Viewing local SQLite event data</p>
            <p className="text-xs">This event is loaded from the cashier computer because cloud data is unavailable.</p>
          </div>
          {pendingLocalCount > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(245,158,11,0.15)", color: "#b45309" }}>
              {pendingLocalCount} sale{pendingLocalCount > 1 ? "s" : ""} pending sync
            </span>
          )}
          <button onClick={syncLocalSales} disabled={syncingLocal} className="px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50" style={{ background: "#0369a1", color: "white" }}>
            {syncingLocal ? "Syncing…" : "Sync Local Sales"}
          </button>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: "var(--muted)" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0"
            style={{ background: tab === t.key ? "var(--card)" : "transparent", color: tab === t.key ? "var(--brand-orange)" : "var(--muted-foreground)", boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,0.12)" : "none" }}>
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: tab === t.key ? "rgba(255,101,63,0.15)" : "var(--border)", color: tab === t.key ? "var(--brand-orange)" : "var(--muted-foreground)" }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DASHBOARD TAB                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "dashboard" && stats && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2 px-0.5" style={{ color: "var(--muted-foreground)" }}>All Time</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Revenue",         value: formatRupiah(stats.revenue),   sub: `of ${formatRupiah(stats.stock.totalStockValue)} stock value`, color: "var(--brand-orange)", icon: <DollarSign size={16} /> },
                { label: "Units Sold",      value: `${stats.itemsSold.toLocaleString("id-ID")} / ${stats.stock.originalUnits.toLocaleString("id-ID")}`, sub: stats.stock.originalUnits > 0 ? `${Math.round((stats.itemsSold / stats.stock.originalUnits) * 100)}% of total stock sold` : "no stock recorded", color: "#7c3aed", icon: <ShoppingBag size={16} /> },
                { label: "Transactions",    value: stats.txnCount.toLocaleString("id-ID"), sub: stats.txnCount > 0 ? `${formatRupiah(stats.revenue / stats.txnCount)} avg/txn` : "no transactions yet", color: "#0369a1", icon: <TrendingUp size={16} /> },
                { label: "Total Discounts", value: formatRupiah(stats.discount),  sub: "saved by customers", color: "#16a34a", icon: <Tag size={16} /> },
              ].map(({ label, value, sub, color, icon }) => (
                <div key={label} className="rounded-2xl border p-4" style={card}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>{icon}</div>
                    <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{label}</p>
                  </div>
                  <p className="text-xl font-black" style={{ color: "var(--foreground)" }}>{value}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2 px-0.5" style={{ color: "var(--muted-foreground)" }}>Today</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Revenue Today",      value: formatRupiah(stats.today.revenue),                         sub: `${stats.today.txnCount} transactions`,       color: "var(--brand-orange)" },
                { label: "Items Sold Today",   value: stats.today.itemsSold.toLocaleString("id-ID") + " units", sub: "units sold today",                            color: "#7c3aed"             },
                { label: "Transactions Today", value: stats.today.txnCount.toLocaleString("id-ID"),              sub: stats.today.txnCount > 0 ? formatRupiah(stats.today.revenue / stats.today.txnCount) + " avg" : "no sales yet", color: "#0369a1" },
                { label: "Discounts Today",    value: formatRupiah(stats.today.discount),                        sub: "saved by customers today",                   color: "#16a34a"             },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="rounded-2xl border p-4" style={{ ...card, borderStyle: "dashed" }}>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--muted-foreground)" }}>{label}</p>
                  <p className="text-xl font-black" style={{ color }}>{value}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border p-5" style={card}>
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--foreground)" }}>Inventory</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Revenue vs Stock Value</span>
                    <span className="text-xs font-bold" style={{ color: "var(--brand-orange)" }}>{stats.stock.totalStockValue > 0 ? `${Math.round((stats.revenue / stats.stock.totalStockValue) * 100)}%` : "—"}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                    <div className="h-full rounded-full" style={{ width: stats.stock.totalStockValue > 0 ? `${Math.min(Math.round((stats.revenue / stats.stock.totalStockValue) * 100), 100)}%` : "0%", background: "var(--brand-orange)" }} />
                  </div>
                  <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                    <span>{formatRupiah(stats.revenue)} earned</span>
                    <span>{formatRupiah(stats.stock.totalStockValue)} total</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Units Sold vs Total</span>
                    <span className="text-xs font-bold" style={{ color: "#7c3aed" }}>{stats.stock.originalUnits > 0 ? `${Math.round((stats.itemsSold / stats.stock.originalUnits) * 100)}%` : "—"}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                    <div className="h-full rounded-full" style={{ width: stats.stock.originalUnits > 0 ? `${Math.min(Math.round((stats.itemsSold / stats.stock.originalUnits) * 100), 100)}%` : "0%", background: "#7c3aed" }} />
                  </div>
                  <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                    <span>{stats.itemsSold.toLocaleString("id-ID")} sold</span>
                    <span>{stats.stock.originalUnits.toLocaleString("id-ID")} total</span>
                  </div>
                </div>
                <div className="pt-1 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
                  {[
                    { label: "Remaining Units", value: stats.stock.totalUnits,               color: "var(--foreground)" },
                    { label: "Remaining Value", value: formatRupiah(stats.stock.remainingValue), color: "#0369a1"        },
                    { label: "Low Stock (≤5)",  value: `${stats.stock.lowStock} items`,        color: "#f59e0b"          },
                    { label: "Out of Stock",    value: `${stats.stock.outOfStock} items`,       color: "#ef4444"          },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</span>
                      <span className="text-xs font-bold" style={{ color }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setTab("stock")} className="mt-4 w-full rounded-xl py-2 text-xs font-semibold border transition-all" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Manage Stock →</button>
            </div>

            <div className="rounded-2xl border p-5" style={card}>
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--foreground)" }}>Recent Sales</h3>
              {txns.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: "var(--muted-foreground)" }}>No transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {txns.slice(0, 5).map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>#{String(txn.id).padStart(5, "0")}</p>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{txn.paymentMethod ?? "—"} · {formatDate(txn.createdAt)}</p>
                      </div>
                      <span className="font-bold" style={{ color: "var(--brand-orange)" }}>{formatRupiah(txn.finalAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setTab("transactions")} className="mt-4 w-full rounded-xl py-2 text-xs font-semibold border transition-all" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>View All Transactions →</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ITEMS TAB                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "items" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted-foreground)" }} />
              <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search items…" className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" style={ist} />
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
            <button onClick={() => fileRef.current?.click()} disabled={importing || isLocalView} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              <Upload size={13} /> {importing ? "Importing…" : "Import"}
            </button>
            <a href={`/api/events/${eventId}/products/export`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              <Download size={13} /> Export
            </a>
            <button disabled={isLocalView} onClick={() => { setItemForm(emptyItem()); setEditItemId(null); setShowItemForm(true); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold ml-auto" style={{ background: "var(--brand-orange)", color: "white" }}>
              <Plus size={14} /> Add Item
            </button>
          </div>

          {importMsg && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: importMsg.ok ? "rgba(22,163,74,0.1)" : "rgba(239,68,68,0.1)", color: importMsg.ok ? "#16a34a" : "#dc2626", border: `1px solid ${importMsg.ok ? "rgba(22,163,74,0.2)" : "rgba(239,68,68,0.2)"}` }}>
              {importMsg.ok ? <Check size={14} /> : <AlertCircle size={14} />} {importMsg.text}
            </div>
          )}

          <div className="rounded-2xl border overflow-hidden" style={card}>
            {filteredItems.length === 0 ? (
              <div className="py-16 text-center">
                <Package2 size={36} className="mx-auto opacity-20" style={{ color: "var(--muted-foreground)" }} />
                <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>{itemSearch ? "No items match your search." : "No items added yet."}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                      {["Ref / Item · Variant", "Name", "Retail", "Net Price", "Stock", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, i) => {
                      const isEditing = inlineEdit === item.id;
                      return (
                        <tr key={item.id} className="transition-colors hover:bg-black/[0.03]" style={{ borderBottom: i < filteredItems.length - 1 ? "1px solid var(--border)" : "none" }}>
                          {/* ── CHANGE: show itemId + baseItemNo · variantCode ── */}
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{item.itemId}</p>
                            {(item.baseItemNo || item.variantCode) && (
                              <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--muted-foreground)" }}>
                                {[item.baseItemNo, item.variantCode].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium" style={{ color: "var(--foreground)" }}>{item.name}</p>
                            {item.color && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{item.color}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? <input type="number" min="0" value={inlineVals.retailPrice} onChange={(e) => setInlineVals({ ...inlineVals, retailPrice: e.target.value })} className="w-24 rounded-lg border px-2 py-1 text-xs focus:outline-none" style={ist} /> : <span className="text-xs line-through" style={{ color: "var(--muted-foreground)" }}>{formatRupiah(item.retailPrice)}</span>}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? <input type="number" min="0" value={inlineVals.netPrice} onChange={(e) => setInlineVals({ ...inlineVals, netPrice: e.target.value })} className="w-24 rounded-lg border px-2 py-1 text-xs focus:outline-none" style={ist} /> : <span className="font-bold text-sm" style={{ color: "var(--brand-orange)" }}>{formatRupiah(item.netPrice)}</span>}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? <input type="number" min="0" value={inlineVals.stock} onChange={(e) => setInlineVals({ ...inlineVals, stock: e.target.value })} className="w-20 rounded-lg border px-2 py-1 text-xs focus:outline-none" style={ist} /> : <StockBadge stock={item.stock} />}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {isEditing ? (
                                <>
                                  <button onClick={() => saveInlineEdit(item.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(22,163,74,0.12)", color: "#16a34a" }}><Check size={12} /> Save</button>
                                  <button onClick={() => setInlineEdit(null)} className="p-1.5 rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}><X size={12} /></button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => startInlineEdit(item)} className="p-1.5 rounded-lg" style={{ background: "rgba(255,200,92,0.15)", color: "#b45309" }}><Pencil size={12} /></button>
                                  <button onClick={() => openEditItem(item)} className="p-1.5 rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}><Layers size={12} /></button>
                                  <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 rounded-lg" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}><Trash2 size={12} /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PROMOS TAB                                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "promos" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button disabled={isLocalView} onClick={() => { setPromoForm(emptyPromo()); setEditPromoId(null); setShowPromoForm(true); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--brand-orange)", color: "white" }}>
              <Plus size={14} /> New Promo
            </button>
          </div>
          {promos.length === 0 ? (
            <div className="rounded-2xl border py-16 text-center" style={card}>
              <Tag size={36} className="mx-auto opacity-20" style={{ color: "var(--muted-foreground)" }} />
              <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>No promos yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {promos.map((p) => {
                const meta = PROMO_TYPES.find((t) => t.value === p.type);
                return (
                  <div key={p.id} className="rounded-2xl border transition-all" style={{ ...card, opacity: p.isActive ? 1 : 0.55 }}>
                    <div className="flex items-start gap-4 p-5">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl" style={{ background: "var(--muted)" }}>{meta?.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold" style={{ color: "var(--foreground)" }}>{p.name}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{meta?.label}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: p.applyToAll ? "rgba(255,101,63,0.1)" : "var(--secondary)", color: p.applyToAll ? "var(--brand-orange)" : "var(--secondary-foreground)" }}>{p.applyToAll ? "All items" : `${p.items.length} item(s)`}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {p.discountPct && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>{p.discountPct}% off</span>}
                          {p.fixedPrice  && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(3,105,161,0.1)", color: "#0369a1" }}>Fixed {formatRupiah(p.fixedPrice)}</span>}
                          {p.tiers?.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(124,58,237,0.1)", color: "#7c3aed" }}>{p.tiers.length} tiers</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => togglePromoActive(p)} className="p-1.5 rounded-lg transition-all" style={{ background: p.isActive ? "rgba(22,163,74,0.1)" : "var(--muted)", color: p.isActive ? "#16a34a" : "var(--muted-foreground)" }}>{p.isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}</button>
                        <button onClick={() => openEditPromo(p)} className="p-1.5 rounded-lg" style={{ background: "rgba(255,200,92,0.15)", color: "#b45309" }}><Pencil size={13} /></button>
                        <button onClick={() => handleDeletePromo(p.id)} className="p-1.5 rounded-lg" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STOCK TAB — delegated to StockTab component                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "stock" && (
        <StockTab
          eventId={eventId}
          items={items}
          onStockUpdated={load}
          ist={ist}
          card={card}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TRANSACTIONS TAB                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "transactions" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{txns.length} transactions for this event</p>
            <a href={`/api/events/${eventId}/report`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border"
              style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              <FileSpreadsheet size={13} /> Full Report
            </a>
          </div>
          <div className="rounded-2xl border overflow-hidden" style={card}>
            {txns.length === 0 ? (
              <div className="py-16 text-center">
                <History size={36} className="mx-auto opacity-20" style={{ color: "var(--muted-foreground)" }} />
                <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>No transactions yet.</p>
              </div>
            ) : (
              <div>
                {txns.map((txn, i) => (
                  <div key={txn.id} style={{ borderBottom: i < txns.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <button className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-black/[0.03]" onClick={() => loadTxnItems(txn.id)}>
                      <span className="font-mono text-xs w-14 flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>#{String(txn.id).padStart(5, "0")}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                          {txn.paymentMethod ?? "—"}
                          {txn.paymentReference && <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}>· {txn.paymentReference}</span>}
                        </p>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(txn.createdAt)}</p>
                      </div>
                      {safeFloat(txn.discount) > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>−{formatRupiah(txn.discount)}</span>}
                      <span className="font-bold flex-shrink-0" style={{ color: "var(--brand-orange)" }}>{formatRupiah(txn.finalAmount)}</span>
                    </button>
                    {expandedTxn === txn.id && txnItems[txn.id] && (
                      <div className="px-5 pb-3 pt-1 space-y-1" style={{ background: "var(--muted)", borderTop: "1px solid var(--border)" }}>
                        {(txnItems[txn.id] as { productName: string; itemId: string; quantity: number; finalPrice: string; discountAmt: string; promoApplied: string | null }[]).map((li, j) => (
                          <div key={j} className="flex items-center justify-between text-xs">
                            <span style={{ color: "var(--foreground)" }}>
                              {li.productName} <span style={{ color: "var(--muted-foreground)" }}>×{li.quantity}</span>
                              {li.promoApplied && <span className="ml-1.5 font-medium" style={{ color: "#16a34a" }}>[{li.promoApplied}]</span>}
                            </span>
                            <span className="font-mono font-bold" style={{ color: "var(--foreground)" }}>{formatRupiah(parseFloat(li.finalPrice) * li.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* USERS TAB                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "users" && <EventUsersPanel eventId={eventId} />}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ADD / EDIT ITEM MODAL                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {showItemForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,10,40,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl border w-full max-w-lg shadow-2xl" style={card}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="font-bold text-base" style={{ color: "var(--foreground)" }}>{editItemId ? "Edit Item" : "Add New Item"}</h2>
              <button onClick={() => setShowItemForm(false)} className="p-1.5 rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}><X size={15} /></button>
            </div>
            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Reference No. *</label>
                  <input required value={itemForm.itemId} onChange={(e) => setItemForm({ ...itemForm, itemId: e.target.value })} placeholder="SPE1040100370" className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Variant Code</label>
                  <input value={itemForm.variantCode} onChange={(e) => setItemForm({ ...itemForm, variantCode: e.target.value })} placeholder="370, L, M, XL…" className={inp} style={ist} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Product Name *</label>
                <input required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="SKYRUNNER EVR" className={inp} style={ist} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Color / Description 2</label>
                  <input value={itemForm.color} onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })} placeholder="WHITE/BLACK" className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Unit</label>
                  <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className={inp} style={ist}>
                    {["PCS", "PRS", "SET", "BOX", "KG"].map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Retail Price</label>
                  <input type="number" min="0" value={itemForm.retailPrice} onChange={(e) => setItemForm({ ...itemForm, retailPrice: e.target.value })} placeholder="700000" className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Net Price *</label>
                  <input type="number" min="0" required value={itemForm.netPrice} onChange={(e) => setItemForm({ ...itemForm, netPrice: e.target.value })} placeholder="500000" className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Stock</label>
                  <input type="number" min="0" required value={itemForm.stock} onChange={(e) => setItemForm({ ...itemForm, stock: e.target.value })} placeholder="20" className={inp} style={ist} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={savingItem} className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40" style={{ background: "var(--brand-orange)", color: "white" }}>{savingItem ? "Saving…" : editItemId ? "Update Item" : "Add to Event"}</button>
                <button type="button" onClick={() => setShowItemForm(false)} className="px-5 rounded-xl text-sm border font-medium" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* PROMO FORM MODAL — extracted to PromoFormModal component            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {showPromoForm && (
        <PromoFormModal
          editPromoId={editPromoId}
          promoForm={promoForm}
          setPromoForm={setPromoForm}
          items={items}
          onSave={handleSavePromo}
          onClose={() => { setShowPromoForm(false); setPromoForm(emptyPromo()); setEditPromoId(null); }}
          saving={savingPromo}
          card={card}
          inp={inp}
          ist={ist}
        />
      )}
    </div>
  );
}