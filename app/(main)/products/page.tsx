// app/(main)/products/page.tsx
"use client";
import { useEffect, useState } from "react";
import {
  Search, ChevronDown, ChevronUp, Package2,
  CalendarDays, TrendingUp, AlertTriangle, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";

// ── Types matching the new GET /api/products response ────────────────────────
type EventAppearance = {
  eventItemId:   number;
  eventId:       number;
  eventName:     string;
  eventStatus:   string;
  eventLocation: string | null;
  netPrice:      string;
  retailPrice:   string;
  stock:         number;
  createdAt:     string | null;
};

type ProductGroup = {
  itemId:      string;
  baseItemNo:  string | null;
  name:        string;
  color:       string | null;
  variantCode: string | null;
  unit:        string | null;
  events:      EventAppearance[];
};

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { color: string; bg: string; dot: string }> = {
  active: { color: "#16a34a", bg: "rgba(22,163,74,0.1)",   dot: "#16a34a" },
  draft:  { color: "#6b7280", bg: "rgba(107,114,128,0.1)", dot: "#9ca3af" },
  closed: { color: "#dc2626", bg: "rgba(220,38,38,0.1)",   dot: "#dc2626" },
};

function StatusDot({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Expandable product row ────────────────────────────────────────────────────
function ProductRow({ group }: { group: ProductGroup }) {
  const [open, setOpen] = useState(false);

  const totalStock    = group.events.reduce((s, e) => s + e.stock, 0);
  const activeEvents  = group.events.filter((e) => e.eventStatus === "active");
  const hasLowStock   = group.events.some((e) => e.stock <= 5 && e.eventStatus === "active");

  // Price range across events
  const prices = group.events.map((e) => parseFloat(e.netPrice));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceLabel = minPrice === maxPrice
    ? formatRupiah(minPrice)
    : `${formatRupiah(minPrice)} – ${formatRupiah(maxPrice)}`;

  const cs = { background: "var(--card)", borderColor: "var(--border)" };

  return (
    <div className="rounded-2xl border overflow-hidden transition-all" style={cs}>
      {/* ── Main row ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-black/[0.03] transition-colors"
      >
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
          style={{ background: "var(--muted)", color: "var(--brand-orange)" }}
        >
          {group.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm truncate" style={{ color: "var(--foreground)" }}>
              {group.name}
            </p>
            {group.variantCode && (
              <span
                className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0"
                style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
              >
                {group.variantCode}
              </span>
            )}
            {group.color && (
              <span className="text-xs flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>
                {group.color}
              </span>
            )}
          </div>
          <p className="font-mono text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {group.itemId}
            {group.baseItemNo && group.baseItemNo !== group.itemId && (
              <span className="ml-2 opacity-60">· {group.baseItemNo}</span>
            )}
          </p>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
          {/* Price range */}
          <div className="text-right">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Net Price</p>
            <p className="text-sm font-bold" style={{ color: "var(--brand-orange)" }}>
              {priceLabel}
            </p>
          </div>

          {/* Total stock */}
          <div className="text-right">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Total Stock</p>
            <div className="flex items-center justify-end gap-1">
              {hasLowStock && <AlertTriangle size={12} style={{ color: "#f59e0b" }} />}
              <p
                className="text-sm font-bold"
                style={{ color: hasLowStock ? "#f59e0b" : "var(--foreground)" }}
              >
                {totalStock}
              </p>
            </div>
          </div>

          {/* Events */}
          <div className="text-right">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Events</p>
            <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
              {group.events.length}
              {activeEvents.length > 0 && (
                <span className="ml-1 text-xs font-medium" style={{ color: "#16a34a" }}>
                  ({activeEvents.length} active)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Expand chevron */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* ── Expanded: event appearances ── */}
      {open && (
        <div
          className="border-t"
          style={{ borderColor: "var(--border)", background: "var(--muted)" }}
        >
          <div className="px-5 py-3">
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--muted-foreground)" }}
            >
              Appears in {group.events.length} event{group.events.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-2">
              {group.events.map((ev) => (
                <div
                  key={ev.eventItemId}
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                >
                  <CalendarDays size={14} className="flex-shrink-0"
                    style={{ color: "var(--muted-foreground)" }} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate"
                      style={{ color: "var(--foreground)" }}>
                      {ev.eventName}
                    </p>
                    {ev.eventLocation && (
                      <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                        {ev.eventLocation}
                      </p>
                    )}
                  </div>

                  <StatusDot status={ev.eventStatus} />

                  <div className="text-right flex-shrink-0">
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Net</p>
                    <p className="text-sm font-bold" style={{ color: "var(--brand-orange)" }}>
                      {formatRupiah(ev.netPrice)}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Stock</p>
                    <p
                      className="text-sm font-bold"
                      style={{
                        color: ev.stock <= 0 ? "#ef4444" : ev.stock <= 5 ? "#f59e0b" : "var(--foreground)",
                      }}
                    >
                      {ev.stock}
                    </p>
                  </div>

                  <Link
                    href={`/events/${ev.eventId}`}
                    className="flex-shrink-0 p-1.5 rounded-lg transition-all"
                    style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                    title="Go to event"
                  >
                    <ExternalLink size={13} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const [groups,  setGroups]  = useState<ProductGroup[]>([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<"all" | "active" | "low-stock">("all");

  async function load(q = "") {
    setLoading(true);
    const url = q ? `/api/products?q=${encodeURIComponent(q)}` : "/api/products";
    const res = await fetch(url);
    setGroups(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => load(search), 280);
    return () => clearTimeout(t);
  }, [search]);

  // Client-side filter on top of server search
  const filtered = groups.filter((g) => {
    if (filter === "active")
      return g.events.some((e) => e.eventStatus === "active");
    if (filter === "low-stock")
      return g.events.some((e) => e.stock <= 5 && e.eventStatus === "active");
    return true;
  });

  // Summary stats
  const totalItems      = groups.length;
  const inActiveEvents  = groups.filter((g) => g.events.some((e) => e.eventStatus === "active")).length;
  const lowStockItems   = groups.filter((g) => g.events.some((e) => e.stock <= 5 && e.eventStatus === "active")).length;
  const totalEventSlots = groups.reduce((s, g) => s + g.events.length, 0);

  const cs = { background: "var(--card)", borderColor: "var(--border)" };

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            Products
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Items are managed per-event. This view shows where each product code appears.
          </p>
        </div>
        <Link
          href="/events"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: "var(--brand-orange)", color: "white" }}
        >
          <CalendarDays size={14} /> Manage via Events
        </Link>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Unique SKUs",     value: totalItems,      color: "var(--foreground)" },
          { label: "In Active Events",value: inActiveEvents,  color: "#16a34a"           },
          { label: "Low Stock (≤5)",  value: lowStockItems,   color: lowStockItems > 0 ? "#f59e0b" : "#16a34a" },
          { label: "Event Slots",     value: totalEventSlots, color: "var(--brand-orange)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border p-4" style={cs}>
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── Search + filter bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--muted-foreground)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, item ID, or base item no…"
            className="w-full rounded-xl border pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}
          />
        </div>
        {(["all", "active", "low-stock"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
            style={{
              borderColor: filter === f ? "var(--brand-orange)"      : "var(--border)",
              background:  filter === f ? "rgba(255,101,63,0.08)"    : "transparent",
              color:       filter === f ? "var(--brand-orange)"      : "var(--muted-foreground)",
            }}
          >
            {f === "all" ? "All" : f === "active" ? "In Active Events" : "⚠ Low Stock"}
          </button>
        ))}
      </div>

      {/* ── Info callout — no add/import here ─────────────────────────────── */}
      <div
        className="flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
        style={{
          borderColor: "rgba(255,101,63,0.2)",
          background:  "rgba(255,101,63,0.04)",
          color:       "var(--muted-foreground)",
        }}
      >
        <Package2 size={16} className="flex-shrink-0 mt-0.5" style={{ color: "var(--brand-orange)" }} />
        <span>
          Products are created when you add items to an event. To add, edit, import, or adjust stock
          — go to{" "}
          <Link href="/events" className="font-semibold underline"
            style={{ color: "var(--brand-orange)" }}>
            Events
          </Link>{" "}
          and open the event you want to manage.
        </span>
      </div>

      {/* ── Product list ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="rounded-2xl border py-16 text-center" style={cs}>
          <p className="text-sm animate-pulse" style={{ color: "var(--muted-foreground)" }}>
            Loading products…
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border py-16 text-center space-y-2" style={cs}>
          <Package2 size={36} className="mx-auto opacity-20"
            style={{ color: "var(--muted-foreground)" }} />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {search ? "No products match your search." : "No products found. Add items to an event to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {filtered.length} product{filtered.length !== 1 ? "s" : ""} — click any row to see event details
          </p>
          {filtered.map((group) => (
            <ProductRow key={group.itemId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}