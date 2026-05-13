// components/events/PromoFormModal.tsx
"use client";
import { useRef, useState, useEffect } from "react";
import {
  X, ScanLine, Search, Check, AlertCircle, Tag,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromoFormData = {
  name: string; type: string; isActive: boolean; applyToAll: boolean;
  discountPct: string; discountFix: string; fixedPrice: string;
  buyQty: number; getFreeQty: number; spendMinAmount: string; bundlePrice: string;
  flashStartTime: string; flashEndTime: string;
  minPurchaseQty: number; maxUsageCount: string;
  tiers: { minQty: number; discountPct?: string; discountFix?: string; fixedPrice?: string }[];
  itemIds: number[];
};

type EventItem = {
  id: number; itemId: string; baseItemNo: string | null;
  name: string; variantCode: string | null; color: string | null;
  netPrice: string;
};

type Props = {
  editPromoId:   number | null;
  promoForm:     PromoFormData;
  setPromoForm:  (form: PromoFormData) => void;
  items:         EventItem[];
  onSave:        (e: React.FormEvent) => Promise<void>;
  onClose:       () => void;
  saving:        boolean;
  card:          React.CSSProperties;
  inp:           string;
  ist:           React.CSSProperties;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PROMO_TYPES = [
  { value: "discount_pct",   label: "Discount %",   icon: "%" },
  { value: "discount_fix",   label: "Fixed Amount", icon: "−" },
  { value: "fixed_price",    label: "Fixed Price",  icon: "=" },
  { value: "qty_tiered",     label: "Tiered",       icon: "↑" },
  { value: "buy_x_get_y",    label: "Buy X Get Y",  icon: "🎁" },
  { value: "spend_get_free", label: "Spend & Free", icon: "🛍" },
  { value: "bundle",         label: "Bundle",       icon: "📦" },
  { value: "flash",          label: "Flash Sale",   icon: "⚡" },
] as const;

function formatRp(v: string | number) {
  return Number(v).toLocaleString("id-ID");
}

// ── Item Picker sub-component ─────────────────────────────────────────────────

function ItemPicker({
  items,
  selectedIds,
  onChange,
  ist,
}: {
  items:       EventItem[];
  selectedIds: number[];
  onChange:    (ids: number[]) => void;
  ist:         React.CSSProperties;
}) {
  const [search,       setSearch]       = useState("");
  const [scanQuery,    setScanQuery]    = useState("");
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [activeTab,    setActiveTab]    = useState<"search" | "scan">("search");
  const scanRef = useRef<HTMLInputElement>(null);

  // Filter items by search query
  const filtered = search.trim()
    ? items.filter(it => {
        const q = search.toLowerCase();
        return (
          it.itemId.toLowerCase().includes(q) ||
          it.name.toLowerCase().includes(q) ||
          (it.baseItemNo ?? "").toLowerCase().includes(q) ||
          (it.variantCode ?? "").toLowerCase().includes(q)
        );
      })
    : items;

  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const q = scanQuery.trim().toLowerCase();
    if (!q) return;

    const found =
      items.find(it => it.itemId.toLowerCase() === q || (it.variantCode ?? "").toLowerCase() === q) ??
      items.find(it => it.itemId.toLowerCase().includes(q) || it.name.toLowerCase().includes(q) || (it.baseItemNo ?? "").toLowerCase().includes(q));

    if (found) {
      if (selectedIds.includes(found.id)) {
        setScanFeedback({ ok: false, text: `${found.name} already added` });
      } else {
        onChange([...selectedIds, found.id]);
        setScanFeedback({ ok: true, text: `Added: ${found.name}${found.variantCode ? ` (${found.variantCode})` : ""}` });
      }
      setScanQuery("");
      setTimeout(() => { setScanFeedback(null); scanRef.current?.focus(); }, 2000);
    } else {
      setScanFeedback({ ok: false, text: `"${scanQuery}" not found` });
      setScanQuery("");
    }
  }

  const selectedItems = items.filter(it => selectedIds.includes(it.id));

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>

      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
        {(["search", "scan"] as const).map(tab => (
          <button key={tab} type="button"
            onClick={() => { setActiveTab(tab); if (tab === "scan") setTimeout(() => scanRef.current?.focus(), 50); }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold transition-all"
            style={{
              background: activeTab === tab ? "var(--card)" : "transparent",
              color:      activeTab === tab ? "var(--brand-orange)" : "var(--muted-foreground)",
              borderBottom: activeTab === tab ? "2px solid var(--brand-orange)" : "2px solid transparent",
            }}>
            {tab === "search" ? <Search size={12} /> : <ScanLine size={12} />}
            {tab === "search" ? "Search" : "Scan"}
          </button>
        ))}
      </div>

      {/* Search tab */}
      {activeTab === "search" && (
        <div>
          <div className="p-2 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted-foreground)" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, item no, reference, variant…"
                className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={ist}
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded" style={{ color: "var(--muted-foreground)" }}>
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: "var(--muted-foreground)" }}>
                {search ? `No items match "${search}"` : "No items in this event"}
              </p>
            ) : (
              filtered.map(item => {
                const checked = selectedIds.includes(item.id);
                return (
                  <label key={item.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-black/5 border-b last:border-b-0 transition-colors"
                    style={{ borderColor: "var(--border)", background: checked ? "rgba(255,101,63,0.04)" : undefined }}>
                    <div className="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                      style={{
                        borderColor: checked ? "var(--brand-orange)" : "var(--border)",
                        background:  checked ? "var(--brand-orange)" : undefined,
                      }}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(item.id)} className="sr-only" />
                      {checked && <Check size={10} strokeWidth={3} color="white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--foreground)" }}>{item.name}</p>
                      <p className="text-[10px] font-mono truncate" style={{ color: "var(--muted-foreground)" }}>
                        {[item.baseItemNo, item.variantCode, item.itemId].filter(Boolean).join(" · ")}
                      </p>
                      {item.color && <p className="text-[10px] truncate" style={{ color: "var(--muted-foreground)" }}>{item.color}</p>}
                    </div>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: "var(--brand-orange)" }}>
                      Rp {formatRp(item.netPrice)}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Scan tab */}
      {activeTab === "scan" && (
        <div className="p-3 space-y-3">
          <form onSubmit={handleScan}>
            <div className="relative">
              <ScanLine size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--brand-orange)" }} />
              <input
                ref={scanRef}
                value={scanQuery}
                onChange={e => setScanQuery(e.target.value)}
                placeholder="Scan or type reference / item no…"
                className="w-full rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={ist}
                autoFocus
              />
            </div>
          </form>

          {scanFeedback && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
              style={{
                background: scanFeedback.ok ? "rgba(22,163,74,0.1)" : "rgba(239,68,68,0.1)",
                color:      scanFeedback.ok ? "#16a34a" : "#dc2626",
              }}>
              {scanFeedback.ok ? <Check size={11} /> : <AlertCircle size={11} />}
              {scanFeedback.text}
            </div>
          )}

          <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
            Scan or type an item reference number, base item no., or variant code to add it to the promo.
          </p>
        </div>
      )}

      {/* Selected items summary */}
      {selectedItems.length > 0 && (
        <div className="border-t px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--muted-foreground)" }}>
            {selectedItems.length} item{selectedItems.length > 1 ? "s" : ""} selected
          </p>
          <div className="flex flex-wrap gap-1">
            {selectedItems.map(it => (
              <span key={it.id}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(255,101,63,0.1)", color: "var(--brand-orange)" }}>
                {it.variantCode ?? it.itemId}
                <button type="button" onClick={() => toggle(it.id)} className="ml-0.5 hover:opacity-70">
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function PromoFormModal({
  editPromoId, promoForm, setPromoForm, items, onSave, onClose, saving, card, inp, ist,
}: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function updateTier(idx: number, patch: Partial<typeof promoForm.tiers[0]>) {
    const t = [...promoForm.tiers];
    t[idx] = { ...t[idx], ...patch };
    setPromoForm({ ...promoForm, tiers: t });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(15,10,40,0.4)", backdropFilter: "blur(4px)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rounded-2xl border w-full max-w-2xl shadow-2xl my-6" style={card}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10 rounded-t-2xl"
          style={{ ...card, borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,101,63,0.1)", color: "var(--brand-orange)" }}>
              <Tag size={15} />
            </div>
            <h2 className="font-bold text-base" style={{ color: "var(--foreground)" }}>
              {editPromoId ? "Edit Promo" : "New Promo"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={onSave} className="p-6 space-y-5">

          {/* Promo type grid */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>Promo Type *</label>
            <div className="grid grid-cols-4 gap-2">
              {PROMO_TYPES.map(t => (
                <button key={t.value} type="button"
                  onClick={() => setPromoForm({ ...promoForm, type: t.value })}
                  className="rounded-xl border px-2 py-3 text-xs font-semibold transition-all text-center"
                  style={{
                    borderColor: promoForm.type === t.value ? "var(--brand-orange)" : "var(--border)",
                    background:  promoForm.type === t.value ? "rgba(255,101,63,0.08)" : "transparent",
                    color:       promoForm.type === t.value ? "var(--brand-orange)" : "var(--muted-foreground)",
                  }}>
                  <span className="text-lg block mb-1">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Promo Name *</label>
            <input required value={promoForm.name} onChange={e => setPromoForm({ ...promoForm, name: e.target.value })}
              placeholder="e.g. Diskon 20% Sepatu" className={inp} style={ist} />
          </div>

          {/* Type-specific fields */}
          {(promoForm.type === "discount_pct" || promoForm.type === "flash") && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Discount %</label>
              <input type="number" min="0" max="100" value={promoForm.discountPct}
                onChange={e => setPromoForm({ ...promoForm, discountPct: e.target.value })}
                placeholder="20" className={inp} style={ist} />
            </div>
          )}
          {promoForm.type === "discount_fix" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Discount Amount (Rp)</label>
              <input type="number" min="0" value={promoForm.discountFix}
                onChange={e => setPromoForm({ ...promoForm, discountFix: e.target.value })}
                placeholder="50000" className={inp} style={ist} />
            </div>
          )}
          {promoForm.type === "fixed_price" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Fixed Price (Rp)</label>
              <input type="number" min="0" value={promoForm.fixedPrice}
                onChange={e => setPromoForm({ ...promoForm, fixedPrice: e.target.value })}
                placeholder="299000" className={inp} style={ist} />
            </div>
          )}
          {promoForm.type === "buy_x_get_y" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Buy Qty</label>
                <input type="number" min="1" value={promoForm.buyQty}
                  onChange={e => setPromoForm({ ...promoForm, buyQty: Number(e.target.value) })}
                  className={inp} style={ist} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Get Free Qty</label>
                <input type="number" min="1" value={promoForm.getFreeQty}
                  onChange={e => setPromoForm({ ...promoForm, getFreeQty: Number(e.target.value) })}
                  className={inp} style={ist} />
              </div>
            </div>
          )}
          {promoForm.type === "spend_get_free" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Min Spend (Rp)</label>
              <input type="number" min="0" value={promoForm.spendMinAmount}
                onChange={e => setPromoForm({ ...promoForm, spendMinAmount: e.target.value })}
                placeholder="500000" className={inp} style={ist} />
            </div>
          )}
          {promoForm.type === "bundle" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Bundle Price (Rp)</label>
              <input type="number" min="0" value={promoForm.bundlePrice}
                onChange={e => setPromoForm({ ...promoForm, bundlePrice: e.target.value })}
                placeholder="199000" className={inp} style={ist} />
            </div>
          )}
          {promoForm.type === "flash" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Flash Start</label>
                <input type="datetime-local" value={promoForm.flashStartTime}
                  onChange={e => setPromoForm({ ...promoForm, flashStartTime: e.target.value })}
                  className={inp} style={ist} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Flash End</label>
                <input type="datetime-local" value={promoForm.flashEndTime}
                  onChange={e => setPromoForm({ ...promoForm, flashEndTime: e.target.value })}
                  className={inp} style={ist} />
              </div>
            </div>
          )}
          {promoForm.type === "qty_tiered" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Discount Tiers</label>
                <button type="button"
                  onClick={() => setPromoForm({ ...promoForm, tiers: [...promoForm.tiers, { minQty: 1, discountPct: "" }] })}
                  className="text-xs px-3 py-1 rounded-lg font-semibold"
                  style={{ background: "rgba(255,101,63,0.1)", color: "var(--brand-orange)" }}>
                  + Add Tier
                </button>
              </div>
              <div className="space-y-2">
                {promoForm.tiers.map((tier, idx) => (
                  <div key={idx} className="flex items-end gap-2 p-3 rounded-xl" style={{ background: "var(--muted)" }}>
                    <div className="flex-1">
                      <label className="block text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>Min Qty</label>
                      <input type="number" min="1" value={tier.minQty}
                        onChange={e => updateTier(idx, { minQty: Number(e.target.value) })}
                        className={inp} style={ist} />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>Discount %</label>
                      <input type="number" min="0" max="100" value={tier.discountPct ?? ""}
                        onChange={e => updateTier(idx, { discountPct: e.target.value, discountFix: "", fixedPrice: "" })}
                        placeholder="10" className={inp} style={ist} />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>Fixed Price</label>
                      <input type="number" min="0" value={tier.fixedPrice ?? ""}
                        onChange={e => updateTier(idx, { fixedPrice: e.target.value, discountPct: "", discountFix: "" })}
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
              </div>
            </div>
          )}

          {/* Apply To */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>Apply To</label>
            <div className="flex gap-2 mb-3">
              {[{ label: "All Items", val: true }, { label: "Select Items", val: false }].map(({ label, val }) => (
                <button key={label} type="button"
                  onClick={() => setPromoForm({ ...promoForm, applyToAll: val, itemIds: val ? [] : promoForm.itemIds })}
                  className="flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all"
                  style={{
                    borderColor: promoForm.applyToAll === val ? "var(--brand-orange)" : "var(--border)",
                    background:  promoForm.applyToAll === val ? "rgba(255,101,63,0.08)" : "transparent",
                    color:       promoForm.applyToAll === val ? "var(--brand-orange)" : "var(--muted-foreground)",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {!promoForm.applyToAll && (
              <ItemPicker
                items={items}
                selectedIds={promoForm.itemIds}
                onChange={ids => setPromoForm({ ...promoForm, itemIds: ids })}
                ist={ist}
              />
            )}
          </div>

          {/* Min qty + max usage */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Min Purchase Qty</label>
              <input type="number" min="1" value={promoForm.minPurchaseQty}
                onChange={e => setPromoForm({ ...promoForm, minPurchaseQty: Number(e.target.value) })}
                className={inp} style={ist} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Max Usage (blank = ∞)</label>
              <input type="number" min="0" value={promoForm.maxUsageCount}
                onChange={e => setPromoForm({ ...promoForm, maxUsageCount: e.target.value })}
                placeholder="Unlimited" className={inp} style={ist} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40"
              style={{ background: "var(--brand-orange)", color: "white" }}>
              {saving ? "Saving…" : editPromoId ? "Update Promo" : "Create Promo"}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 rounded-xl text-sm border font-medium"
              style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}