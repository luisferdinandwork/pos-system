// app/events/[id]/page.tsx
"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Trash2, X, Upload, Download, Pencil,
  Tag, ChevronLeft, Search, Package2, Check,
  AlertCircle, Layers, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Zap,
} from "lucide-react";
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";

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
  minQty: number;
  discountPct?: string;
  discountFix?: string;
  fixedPrice?: string;
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

const PROMO_TYPES = [
  { value: "discount_pct",   label: "Discount %",    desc: "Percentage off the net price",                   icon: "%" },
  { value: "discount_fix",   label: "Fixed Amount",  desc: "Fixed Rp amount off",                            icon: "−" },
  { value: "fixed_price",    label: "Fixed Price",   desc: "Sell at a set price regardless of net",          icon: "=" },
  { value: "qty_tiered",     label: "Tiered",        desc: "Buy more, get higher discount",                  icon: "↑" },
  { value: "buy_x_get_y",    label: "Buy X Get Y",   desc: "Buy X qty, get Y qty free",                      icon: "🎁" },
  { value: "spend_get_free", label: "Spend & Free",  desc: "Spend min amount → receive free item",           icon: "🛍" },
  { value: "bundle",         label: "Bundle",        desc: "Selected items together at a bundle price",      icon: "📦" },
  { value: "flash",          label: "Flash Sale",    desc: "Time-limited discount",                          icon: "⚡" },
] as const;

const emptyItem = () => ({
  itemId: "", baseItemNo: "", name: "", color: "",
  variantCode: "", unit: "PCS",
  netPrice: "", retailPrice: "", stock: "",
});

const emptyPromo = () => ({
  name: "", type: "discount_pct" as string, isActive: true, applyToAll: false,
  discountPct: "", discountFix: "", fixedPrice: "",
  buyQty: 1, getFreeQty: 1, spendMinAmount: "", bundlePrice: "",
  flashStartTime: "", flashEndTime: "",
  minPurchaseQty: 1, maxUsageCount: "",
  tiers: [] as Tier[], itemIds: [] as number[],
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { dot: string; label: string }> = {
  active: { dot: "#16a34a", label: "Active" },
  draft:  { dot: "#6b7280", label: "Draft"  },
  closed: { dot: "#dc2626", label: "Closed" },
};

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
  const [tab,    setTab]    = useState<"items" | "promos">("items");

  // Item form state
  const [showItemForm,  setShowItemForm]  = useState(false);
  const [itemForm,      setItemForm]      = useState(emptyItem());
  const [editItemId,    setEditItemId]    = useState<number | null>(null);
  const [savingItem,    setSavingItem]    = useState(false);
  const [itemSearch,    setItemSearch]    = useState("");

  // Inline edit state
  const [inlineEdit,    setInlineEdit]    = useState<number | null>(null);
  const [inlineVals,    setInlineVals]    = useState({ retailPrice: "", netPrice: "", stock: "" });

  // Promo form state
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoForm,     setPromoForm]     = useState(emptyPromo());
  const [editPromoId,   setEditPromoId]   = useState<number | null>(null);
  const [savingPromo,   setSavingPromo]   = useState(false);

  // Import
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [evRes, itemsRes, promosRes] = await Promise.all([
      fetch(`/api/events`).then((r) => r.json()),
      fetch(`/api/events/${eventId}/products`).then((r) => r.json()),
      fetch(`/api/events/${eventId}/promos`).then((r) => r.json()),
    ]);
    const ev = (evRes as EventRow[]).find((e) => e.id === eventId) ?? null;
    setEvent(ev);
    setItems(itemsRes);
    setPromos(promosRes);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // ── Item CRUD ───────────────────────────────────────────────────────────────
  const filteredItems = items.filter((it) => {
    const q = itemSearch.toLowerCase();
    return !q
      || it.name.toLowerCase().includes(q)
      || it.itemId.toLowerCase().includes(q)
      || (it.variantCode ?? "").toLowerCase().includes(q);
  });

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    setSavingItem(true);
    if (editItemId) {
      await fetch(`/api/events/${eventId}/products`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: editItemId, ...itemForm }),
      });
    } else {
      await fetch(`/api/events/${eventId}/products`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(itemForm),
      });
    }
    setSavingItem(false);
    setShowItemForm(false);
    setItemForm(emptyItem());
    setEditItemId(null);
    load();
  }

  async function handleDeleteItem(itemId: number) {
    if (!confirm("Remove this item from the event?")) return;
    await fetch(`/api/events/${eventId}/products?id=${itemId}`, { method: "DELETE" });
    load();
  }

  function openEditItem(item: EventItem) {
    setItemForm({
      itemId:      item.itemId,
      baseItemNo:  item.baseItemNo  ?? "",
      name:        item.name,
      color:       item.color       ?? "",
      variantCode: item.variantCode ?? "",
      unit:        item.unit        ?? "PCS",
      netPrice:    item.netPrice,
      retailPrice: item.retailPrice,
      stock:       String(item.stock),
    });
    setEditItemId(item.id);
    setShowItemForm(true);
  }

  function startInlineEdit(item: EventItem) {
    setInlineEdit(item.id);
    setInlineVals({
      retailPrice: item.retailPrice,
      netPrice:    item.netPrice,
      stock:       String(item.stock),
    });
  }

  async function saveInlineEdit(itemId: number) {
    await fetch(`/api/events/${eventId}/products`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: itemId, ...inlineVals }),
    });
    setInlineEdit(null);
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg(null);

    const fd = new FormData();
    fd.append("file", file);

    const res    = await fetch(`/api/events/${eventId}/products/import`, { method: "POST", body: fd });
    const result = await res.json();

    setImporting(false);
    e.target.value = "";

    const hasErrors = result.errors?.length > 0;
    setImportMsg({
      ok:   !hasErrors,
      text: hasErrors
        ? `${result.inserted} inserted, ${result.updated} updated — ${result.errors.length} error(s): ${result.errors.slice(0, 2).join("; ")}`
        : `✓ ${result.inserted} inserted, ${result.updated} updated`,
    });
    setTimeout(() => setImportMsg(null), 6000);
    load();
  }

  // ── Promo CRUD ──────────────────────────────────────────────────────────────
  async function handleSavePromo(e: React.FormEvent) {
    e.preventDefault();
    setSavingPromo(true);
    const payload = {
      ...promoForm,
      discountPct:    promoForm.discountPct    || null,
      discountFix:    promoForm.discountFix    || null,
      fixedPrice:     promoForm.fixedPrice     || null,
      spendMinAmount: promoForm.spendMinAmount || null,
      bundlePrice:    promoForm.bundlePrice    || null,
      flashStartTime: promoForm.flashStartTime || null,
      flashEndTime:   promoForm.flashEndTime   || null,
      maxUsageCount:  promoForm.maxUsageCount  || null,
      ...(editPromoId ? { id: editPromoId } : {}),
    };
    await fetch(`/api/events/${eventId}/promos`, {
      method:  editPromoId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    setSavingPromo(false);
    setShowPromoForm(false);
    setPromoForm(emptyPromo());
    setEditPromoId(null);
    load();
  }

  async function handleDeletePromo(promoId: number) {
    if (!confirm("Delete this promo?")) return;
    await fetch(`/api/events/${eventId}/promos?id=${promoId}`, { method: "DELETE" });
    load();
  }

  async function togglePromoActive(p: Promo) {
    await fetch(`/api/events/${eventId}/promos`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...p, id: p.id, tiers: p.tiers, itemIds: p.items.map((i) => i.eventItemId) }),
    });
    load();
  }

  function openEditPromo(p: Promo) {
    setPromoForm({
      name:           p.name,
      type:           p.type,
      isActive:       p.isActive,
      applyToAll:     p.applyToAll,
      discountPct:    p.discountPct    ?? "",
      discountFix:    p.discountFix    ?? "",
      fixedPrice:     p.fixedPrice     ?? "",
      buyQty:         p.buyQty         ?? 1,
      getFreeQty:     p.getFreeQty     ?? 1,
      spendMinAmount: p.spendMinAmount ?? "",
      bundlePrice:    p.bundlePrice    ?? "",
      flashStartTime: p.flashStartTime ?? "",
      flashEndTime:   p.flashEndTime   ?? "",
      minPurchaseQty: p.minPurchaseQty ?? 1,
      maxUsageCount:  String(p.maxUsageCount ?? ""),
      tiers:          p.tiers,
      // itemIds now references event_items.id
      itemIds:        p.items.map((i) => i.eventItemId),
    });
    setEditPromoId(p.id);
    setShowPromoForm(true);
  }

  // ── Style helpers ───────────────────────────────────────────────────────────
  const card = { background: "var(--card)", borderColor: "var(--border)" };
  const inp  = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 transition-colors";
  const ist  = { borderColor: "var(--border)", color: "var(--foreground)", background: "var(--input, var(--card))" };

  const statusMeta = STATUS_COLORS[event?.status ?? "draft"] ?? STATUS_COLORS.draft;
  const activePromos   = promos.filter((p) => p.isActive).length;
  const lowStockItems  = items.filter((it) => it.stock <= 5).length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Link href="/events"
          className="mt-1 p-2 rounded-xl border transition-all hover:bg-black/5"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          <ChevronLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate" style={{ color: "var(--foreground)" }}>
              {event?.name ?? "Loading…"}
            </h1>
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{
                background: `${statusMeta.dot}18`,
                color:      statusMeta.dot,
              }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: statusMeta.dot }} />
              {statusMeta.label}
            </span>
          </div>
          {event?.location && (
            <p className="text-sm mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>
              {event.location}
            </p>
          )}
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Items",         value: items.length,  color: "var(--brand-orange)" },
          { label: "Active Promos", value: activePromos,  color: "#7c3aed"             },
          { label: "Low Stock",     value: lowStockItems, color: lowStockItems > 0 ? "#f59e0b" : "#16a34a" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border p-4 text-center" style={card}>
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--muted)" }}>
        {(["items", "promos"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: tab === t ? "var(--card)" : "transparent",
              color:      tab === t ? "var(--brand-orange)" : "var(--muted-foreground)",
              boxShadow:  tab === t ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
            }}>
            {t === "items" ? <Package2 size={14} /> : <Tag size={14} />}
            {t === "items" ? `Items (${items.length})` : `Promos (${promos.length})`}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── ITEMS TAB ────────────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "items" && (
        <div className="space-y-4">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--muted-foreground)" }} />
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search items…"
                className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={ist}
              />
            </div>

            {/* Import / Export */}
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all"
              style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              <Upload size={13} /> {importing ? "Importing…" : "Import"}
            </button>
            <a href={`/api/events/${eventId}/products/export`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all"
              style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}>
              <Download size={13} /> Export
            </a>
            <button
              onClick={() => { setItemForm(emptyItem()); setEditItemId(null); setShowItemForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold ml-auto"
              style={{ background: "var(--brand-orange)", color: "white" }}>
              <Plus size={14} /> Add Item
            </button>
          </div>

          {/* Import feedback */}
          {importMsg && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{
                background: importMsg.ok ? "rgba(22,163,74,0.1)"  : "rgba(239,68,68,0.1)",
                color:      importMsg.ok ? "#16a34a"               : "#dc2626",
                border:     `1px solid ${importMsg.ok ? "rgba(22,163,74,0.2)" : "rgba(239,68,68,0.2)"}`,
              }}>
              {importMsg.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              {importMsg.text}
            </div>
          )}

          {/* Item table */}
          <div className="rounded-2xl border overflow-hidden" style={card}>
            {filteredItems.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <Package2 size={36} className="mx-auto opacity-20" style={{ color: "var(--muted-foreground)" }} />
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {itemSearch ? "No items match your search." : "No items added yet. Add one or import from Excel."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                      {["Ref / Variant", "Name", "Retail", "Net Price", "Stock", ""].map((h) => (
                        <th key={h}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                          style={{ color: "var(--muted-foreground)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, i) => {
                      const isEditing = inlineEdit === item.id;
                      return (
                        <tr key={item.id}
                          className="transition-colors hover:bg-black/[0.03]"
                          style={{ borderBottom: i < filteredItems.length - 1 ? "1px solid var(--border)" : "none" }}>

                          {/* Ref / Variant */}
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                              {item.itemId}
                            </p>
                            {item.variantCode && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium"
                                style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
                                {item.variantCode}
                              </span>
                            )}
                          </td>

                          {/* Name */}
                          <td className="px-4 py-3">
                            <p className="font-medium" style={{ color: "var(--foreground)" }}>{item.name}</p>
                            {item.color && (
                              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{item.color}</p>
                            )}
                          </td>

                          {/* Retail — inline edit */}
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="number" min="0"
                                value={inlineVals.retailPrice}
                                onChange={(e) => setInlineVals({ ...inlineVals, retailPrice: e.target.value })}
                                className="w-24 rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                                style={ist}
                              />
                            ) : (
                              <span className="text-xs line-through" style={{ color: "var(--muted-foreground)" }}>
                                {formatRupiah(item.retailPrice)}
                              </span>
                            )}
                          </td>

                          {/* Net Price — inline edit */}
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="number" min="0"
                                value={inlineVals.netPrice}
                                onChange={(e) => setInlineVals({ ...inlineVals, netPrice: e.target.value })}
                                className="w-24 rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                                style={ist}
                              />
                            ) : (
                              <span className="font-bold text-sm" style={{ color: "var(--brand-orange)" }}>
                                {formatRupiah(item.netPrice)}
                              </span>
                            )}
                          </td>

                          {/* Stock — inline edit */}
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="number" min="0"
                                value={inlineVals.stock}
                                onChange={(e) => setInlineVals({ ...inlineVals, stock: e.target.value })}
                                className="w-20 rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                                style={ist}
                              />
                            ) : (
                              <StockBadge stock={item.stock} />
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => saveInlineEdit(item.id)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                                    style={{ background: "rgba(22,163,74,0.12)", color: "#16a34a" }}>
                                    <Check size={12} /> Save
                                  </button>
                                  <button
                                    onClick={() => setInlineEdit(null)}
                                    className="p-1.5 rounded-lg"
                                    style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                                    <X size={12} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startInlineEdit(item)}
                                    title="Quick-edit price & stock"
                                    className="p-1.5 rounded-lg transition-all"
                                    style={{ background: "rgba(255,200,92,0.15)", color: "#b45309" }}>
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    onClick={() => openEditItem(item)}
                                    title="Edit full details"
                                    className="p-1.5 rounded-lg transition-all"
                                    style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                                    <Layers size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="p-1.5 rounded-lg transition-all"
                                    style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
                                    <Trash2 size={12} />
                                  </button>
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

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PROMOS TAB ───────────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "promos" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setPromoForm(emptyPromo()); setEditPromoId(null); setShowPromoForm(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "var(--brand-orange)", color: "white" }}>
              <Plus size={14} /> New Promo
            </button>
          </div>

          {promos.length === 0 ? (
            <div className="rounded-2xl border py-16 text-center space-y-2" style={card}>
              <Tag size={36} className="mx-auto opacity-20" style={{ color: "var(--muted-foreground)" }} />
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No promos yet for this event.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {promos.map((p) => {
                const meta = PROMO_TYPES.find((t) => t.value === p.type);
                return (
                  <div key={p.id}
                    className="rounded-2xl border transition-all"
                    style={{ ...card, opacity: p.isActive ? 1 : 0.55 }}>
                    <div className="flex items-start gap-4 p-5">
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                        style={{ background: "var(--muted)" }}>
                        {meta?.icon}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold" style={{ color: "var(--foreground)" }}>{p.name}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                            {meta?.label}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: p.applyToAll ? "rgba(255,101,63,0.1)" : "var(--secondary)",
                              color:      p.applyToAll ? "var(--brand-orange)"   : "var(--secondary-foreground)",
                            }}>
                            {p.applyToAll ? "All items" : `${p.items.length} item(s)`}
                          </span>
                        </div>

                        {/* Discount summary */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {p.discountPct && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
                              {p.discountPct}% off
                            </span>
                          )}
                          {p.discountFix && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
                              Rp {Number(p.discountFix).toLocaleString("id-ID")} off
                            </span>
                          )}
                          {p.fixedPrice && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "rgba(3,105,161,0.1)", color: "#0369a1" }}>
                              Fixed {formatRupiah(p.fixedPrice)}
                            </span>
                          )}
                          {p.tiers?.length > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "rgba(124,58,237,0.1)", color: "#7c3aed" }}>
                              {p.tiers.length} tiers
                            </span>
                          )}
                          {p.buyQty && p.getFreeQty && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
                              Buy {p.buyQty} get {p.getFreeQty} free
                            </span>
                          )}
                          {(p.flashStartTime || p.flashEndTime) && (
                            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                              style={{ background: "rgba(245,158,11,0.12)", color: "#d97706" }}>
                              <Zap size={10} />
                              {p.flashStartTime ? new Date(p.flashStartTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "?"}
                              {" — "}
                              {p.flashEndTime   ? new Date(p.flashEndTime).toLocaleTimeString("id-ID",   { hour: "2-digit", minute: "2-digit" }) : "?"}
                            </span>
                          )}
                        </div>

                        {/* Applied items list */}
                        {!p.applyToAll && p.items.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {p.items.slice(0, 4).map((pi) => (
                              <span key={pi.id} className="text-xs px-2 py-0.5 rounded-lg font-mono"
                                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                                {pi.itemId}{pi.variantCode ? ` · ${pi.variantCode}` : ""}
                              </span>
                            ))}
                            {p.items.length > 4 && (
                              <span className="text-xs px-2 py-0.5 rounded-lg"
                                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                                +{p.items.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => togglePromoActive({ ...p, isActive: !p.isActive })}
                          title={p.isActive ? "Deactivate" : "Activate"}
                          className="p-1.5 rounded-lg transition-all"
                          style={{
                            background: p.isActive ? "rgba(22,163,74,0.1)" : "var(--muted)",
                            color:      p.isActive ? "#16a34a"              : "var(--muted-foreground)",
                          }}>
                          {p.isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                        </button>
                        <button onClick={() => openEditPromo(p)}
                          className="p-1.5 rounded-lg"
                          style={{ background: "rgba(255,200,92,0.15)", color: "#b45309" }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeletePromo(p.id)}
                          className="p-1.5 rounded-lg"
                          style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── ADD / EDIT ITEM MODAL ────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {showItemForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,10,40,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl border w-full max-w-lg shadow-2xl" style={card}>
            <div className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}>
              <h2 className="font-bold text-base" style={{ color: "var(--foreground)" }}>
                {editItemId ? "Edit Item" : "Add New Item"}
              </h2>
              <button onClick={() => setShowItemForm(false)}
                className="p-1.5 rounded-lg"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              {/* Row 1: Reference + Variant */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Reference No. *</label>
                  <input required value={itemForm.itemId}
                    onChange={(e) => setItemForm({ ...itemForm, itemId: e.target.value })}
                    placeholder="SPE1040100370" className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Variant Code</label>
                  <input value={itemForm.variantCode}
                    onChange={(e) => setItemForm({ ...itemForm, variantCode: e.target.value })}
                    placeholder="370, L, M, XL…" className={inp} style={ist} />
                </div>
              </div>

              {/* Row 2: Name */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}>Product Name *</label>
                <input required value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="SKYRUNNER EVR" className={inp} style={ist} />
              </div>

              {/* Row 3: Color + Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Color / Description 2</label>
                  <input value={itemForm.color}
                    onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })}
                    placeholder="WHITE/BLACK" className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Unit</label>
                  <select value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    className={inp} style={ist}>
                    {["PCS", "PRS", "SET", "BOX", "KG"].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Prices + Stock */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Retail Price</label>
                  <input type="number" min="0" value={itemForm.retailPrice}
                    onChange={(e) => setItemForm({ ...itemForm, retailPrice: e.target.value })}
                    placeholder="700000" className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Net Price *</label>
                  <input type="number" min="0" required value={itemForm.netPrice}
                    onChange={(e) => setItemForm({ ...itemForm, netPrice: e.target.value })}
                    placeholder="500000" className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Stock *</label>
                  <input type="number" min="0" required value={itemForm.stock}
                    onChange={(e) => setItemForm({ ...itemForm, stock: e.target.value })}
                    placeholder="20" className={inp} style={ist} />
                </div>
              </div>

              {/* Base item no (optional, advanced) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}>Item No. (Base SKU)</label>
                <input value={itemForm.baseItemNo}
                  onChange={(e) => setItemForm({ ...itemForm, baseItemNo: e.target.value })}
                  placeholder="SPE1040100 (optional)" className={inp} style={ist} />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={savingItem}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40"
                  style={{ background: "var(--brand-orange)", color: "white" }}>
                  {savingItem ? "Saving…" : editItemId ? "Update Item" : "Add to Event"}
                </button>
                <button type="button" onClick={() => setShowItemForm(false)}
                  className="px-5 rounded-xl text-sm border font-medium"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PROMO FORM MODAL ─────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {showPromoForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(15,10,40,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl border w-full max-w-2xl shadow-2xl my-6" style={card}>
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10 rounded-t-2xl"
              style={{ ...card, borderColor: "var(--border)" }}>
              <h2 className="font-bold text-base" style={{ color: "var(--foreground)" }}>
                {editPromoId ? "Edit Promo" : "New Promo"}
              </h2>
              <button onClick={() => setShowPromoForm(false)}
                className="p-1.5 rounded-lg"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSavePromo} className="p-6 space-y-5">

              {/* Promo type grid */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--muted-foreground)" }}>Promo Type *</label>
                <div className="grid grid-cols-4 gap-2">
                  {PROMO_TYPES.map((t) => (
                    <button key={t.value} type="button"
                      onClick={() => setPromoForm({ ...promoForm, type: t.value })}
                      className="rounded-xl border px-2 py-3 text-xs font-semibold transition-all text-center"
                      style={{
                        borderColor: promoForm.type === t.value ? "var(--brand-orange)" : "var(--border)",
                        background:  promoForm.type === t.value ? "rgba(255,101,63,0.08)" : "transparent",
                        color:       promoForm.type === t.value ? "var(--brand-orange)"   : "var(--muted-foreground)",
                      }}>
                      <span className="text-lg block mb-1">{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-2 italic" style={{ color: "var(--muted-foreground)" }}>
                  {PROMO_TYPES.find((t) => t.value === promoForm.type)?.desc}
                </p>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}>Promo Name *</label>
                <input required value={promoForm.name}
                  onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })}
                  placeholder="e.g. Diskon 20% Sepatu" className={inp} style={ist} />
              </div>

              {/* Type-specific config */}
              {(promoForm.type === "discount_pct" || promoForm.type === "flash") && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Discount %</label>
                  <input type="number" min="0" max="100" value={promoForm.discountPct}
                    onChange={(e) => setPromoForm({ ...promoForm, discountPct: e.target.value })}
                    placeholder="20" className={inp} style={ist} />
                </div>
              )}
              {promoForm.type === "discount_fix" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Discount Amount (Rp)</label>
                  <input type="number" min="0" value={promoForm.discountFix}
                    onChange={(e) => setPromoForm({ ...promoForm, discountFix: e.target.value })}
                    placeholder="50000" className={inp} style={ist} />
                </div>
              )}
              {promoForm.type === "fixed_price" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Fixed Price (Rp)</label>
                  <input type="number" min="0" value={promoForm.fixedPrice}
                    onChange={(e) => setPromoForm({ ...promoForm, fixedPrice: e.target.value })}
                    placeholder="299000" className={inp} style={ist} />
                </div>
              )}
              {promoForm.type === "buy_x_get_y" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                      style={{ color: "var(--muted-foreground)" }}>Buy Qty</label>
                    <input type="number" min="1" value={promoForm.buyQty}
                      onChange={(e) => setPromoForm({ ...promoForm, buyQty: Number(e.target.value) })}
                      className={inp} style={ist} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                      style={{ color: "var(--muted-foreground)" }}>Get Free Qty</label>
                    <input type="number" min="1" value={promoForm.getFreeQty}
                      onChange={(e) => setPromoForm({ ...promoForm, getFreeQty: Number(e.target.value) })}
                      className={inp} style={ist} />
                  </div>
                </div>
              )}
              {promoForm.type === "spend_get_free" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Min Spend (Rp)</label>
                  <input type="number" min="0" value={promoForm.spendMinAmount}
                    onChange={(e) => setPromoForm({ ...promoForm, spendMinAmount: e.target.value })}
                    placeholder="500000" className={inp} style={ist} />
                </div>
              )}
              {promoForm.type === "bundle" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Bundle Price (Rp)</label>
                  <input type="number" min="0" value={promoForm.bundlePrice}
                    onChange={(e) => setPromoForm({ ...promoForm, bundlePrice: e.target.value })}
                    placeholder="199000" className={inp} style={ist} />
                </div>
              )}
              {promoForm.type === "flash" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                      style={{ color: "var(--muted-foreground)" }}>Flash Start</label>
                    <input type="datetime-local" value={promoForm.flashStartTime}
                      onChange={(e) => setPromoForm({ ...promoForm, flashStartTime: e.target.value })}
                      className={inp} style={ist} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                      style={{ color: "var(--muted-foreground)" }}>Flash End</label>
                    <input type="datetime-local" value={promoForm.flashEndTime}
                      onChange={(e) => setPromoForm({ ...promoForm, flashEndTime: e.target.value })}
                      className={inp} style={ist} />
                  </div>
                </div>
              )}

              {/* Tiered discount builder */}
              {promoForm.type === "qty_tiered" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--muted-foreground)" }}>Discount Tiers</label>
                    <button type="button"
                      onClick={() => setPromoForm({
                        ...promoForm,
                        tiers: [...promoForm.tiers, { minQty: 1, discountPct: "" }],
                      })}
                      className="text-xs px-3 py-1 rounded-lg font-semibold"
                      style={{ background: "rgba(255,101,63,0.1)", color: "var(--brand-orange)" }}>
                      + Add Tier
                    </button>
                  </div>
                  <div className="space-y-2">
                    {promoForm.tiers.map((tier, idx) => (
                      <div key={idx} className="flex items-end gap-2 p-3 rounded-xl"
                        style={{ background: "var(--muted)" }}>
                        <div className="flex-1">
                          <label className="block text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>Min Qty</label>
                          <input type="number" min="1" value={tier.minQty}
                            onChange={(e) => {
                              const t = [...promoForm.tiers];
                              t[idx] = { ...t[idx], minQty: Number(e.target.value) };
                              setPromoForm({ ...promoForm, tiers: t });
                            }}
                            className={inp} style={ist} />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>Discount %</label>
                          <input type="number" min="0" max="100" value={tier.discountPct ?? ""}
                            onChange={(e) => {
                              const t = [...promoForm.tiers];
                              t[idx] = { ...t[idx], discountPct: e.target.value, discountFix: "", fixedPrice: "" };
                              setPromoForm({ ...promoForm, tiers: t });
                            }}
                            placeholder="10" className={inp} style={ist} />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>Fixed Price</label>
                          <input type="number" min="0" value={tier.fixedPrice ?? ""}
                            onChange={(e) => {
                              const t = [...promoForm.tiers];
                              t[idx] = { ...t[idx], fixedPrice: e.target.value, discountPct: "", discountFix: "" };
                              setPromoForm({ ...promoForm, tiers: t });
                            }}
                            placeholder="199000" className={inp} style={ist} />
                        </div>
                        <button type="button"
                          onClick={() => setPromoForm({ ...promoForm, tiers: promoForm.tiers.filter((_, i) => i !== idx) })}
                          className="p-2 rounded-lg flex-shrink-0"
                          style={{ color: "#dc2626", background: "rgba(220,38,38,0.1)" }}>
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    {promoForm.tiers.length === 0 && (
                      <p className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>
                        No tiers yet — click "+ Add Tier" above
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Apply to */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--muted-foreground)" }}>Apply To</label>
                <div className="flex gap-2 mb-3">
                  <button type="button"
                    onClick={() => setPromoForm({ ...promoForm, applyToAll: true, itemIds: [] })}
                    className="flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all"
                    style={{
                      borderColor: promoForm.applyToAll ? "var(--brand-orange)" : "var(--border)",
                      background:  promoForm.applyToAll ? "rgba(255,101,63,0.08)" : "transparent",
                      color:       promoForm.applyToAll ? "var(--brand-orange)"   : "var(--muted-foreground)",
                    }}>
                    All Items
                  </button>
                  <button type="button"
                    onClick={() => setPromoForm({ ...promoForm, applyToAll: false })}
                    className="flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all"
                    style={{
                      borderColor: !promoForm.applyToAll ? "var(--brand-orange)" : "var(--border)",
                      background:  !promoForm.applyToAll ? "rgba(255,101,63,0.08)" : "transparent",
                      color:       !promoForm.applyToAll ? "var(--brand-orange)"   : "var(--muted-foreground)",
                    }}>
                    Select Items
                  </button>
                </div>

                {!promoForm.applyToAll && (
                  <div className="rounded-xl border overflow-hidden max-h-52 overflow-y-auto" style={card}>
                    {items.length === 0 ? (
                      <p className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>
                        No items in this event yet
                      </p>
                    ) : items.map((item) => {
                      const checked = promoForm.itemIds.includes(item.id);
                      return (
                        <label key={item.id}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-black/5 transition-colors border-b last:border-b-0"
                          style={{ borderColor: "var(--border)" }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => setPromoForm({
                              ...promoForm,
                              itemIds: checked
                                ? promoForm.itemIds.filter((x) => x !== item.id)
                                : [...promoForm.itemIds, item.id],
                            })} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                              {item.name}
                              {item.variantCode && (
                                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded"
                                  style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
                                  {item.variantCode}
                                </span>
                              )}
                            </p>
                            <p className="text-xs font-mono truncate" style={{ color: "var(--muted-foreground)" }}>
                              {item.itemId}
                            </p>
                          </div>
                          <span className="text-xs font-bold flex-shrink-0" style={{ color: "var(--brand-orange)" }}>
                            {formatRupiah(item.netPrice)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Guards */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Min Purchase Qty</label>
                  <input type="number" min="1" value={promoForm.minPurchaseQty}
                    onChange={(e) => setPromoForm({ ...promoForm, minPurchaseQty: Number(e.target.value) })}
                    className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Max Usage (blank = ∞)</label>
                  <input type="number" min="0" value={promoForm.maxUsageCount}
                    onChange={(e) => setPromoForm({ ...promoForm, maxUsageCount: e.target.value })}
                    placeholder="Unlimited" className={inp} style={ist} />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={savingPromo}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                  style={{ background: "var(--brand-orange)", color: "white" }}>
                  {savingPromo ? "Saving…" : editPromoId ? "Update Promo" : "Create Promo"}
                </button>
                <button type="button" onClick={() => setShowPromoForm(false)}
                  className="px-5 rounded-xl text-sm border font-medium"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}