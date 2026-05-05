// components/events/StockTab.tsx
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import {
  Upload,
  Download,
  Check,
  AlertCircle,
  RefreshCw,
  ScanLine,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  Package2,
  Layers,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

type EventItem = {
  id: number;
  itemId: string;
  baseItemNo: string | null;
  name: string;
  color: string | null;
  variantCode: string | null;
  unit: string | null;
  stock: number;
  retailPrice?: string;
  netPrice?: string;
  eventId?: number;
};

type StockType = "transfer_in" | "transfer_out" | "adjustment";

const STOCK_TYPES: {
  key: StockType;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  desc: string;
}[] = [
  {
    key: "transfer_in",
    label: "Transfer In",
    icon: <ArrowDownToLine size={15} />,
    color: "#16a34a",
    bg: "rgba(22,163,74,0.09)",
    desc: "Receive stock into this event",
  },
  {
    key: "transfer_out",
    label: "Transfer Out",
    icon: <ArrowUpFromLine size={15} />,
    color: "#dc2626",
    bg: "rgba(220,38,38,0.09)",
    desc: "Remove stock from this event",
  },
  {
    key: "adjustment",
    label: "Adjustment",
    icon: <SlidersHorizontal size={15} />,
    color: "#7c3aed",
    bg: "rgba(124,58,237,0.09)",
    desc: "Correct stock levels (+ or −)",
  },
];

type Props = {
  eventId: number;
  items: EventItem[];
  onStockUpdated: () => void | Promise<void>;
  ist: React.CSSProperties;
  card: React.CSSProperties;
};

function StockBadge({ stock }: { stock: number }) {
  const s = Number(stock ?? 0);

  const color =
    s < 0
      ? "#dc2626"
      : s === 0
        ? "#b45309"
        : s <= 5
          ? "#f59e0b"
          : "#16a34a";

  const bg =
    s < 0
      ? "rgba(220,38,38,0.10)"
      : s === 0
        ? "rgba(245,158,11,0.12)"
        : s <= 5
          ? "rgba(245,158,11,0.12)"
          : "rgba(22,163,74,0.10)";

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums"
      style={{ color, background: bg }}
    >
      Total stock = {s.toLocaleString("id-ID")}
    </span>
  );
}

export function StockTab({
  eventId,
  items,
  onStockUpdated,
  ist,
  card,
}: Props) {
  const [activeType, setActiveType] = useState<StockType>("transfer_in");

  const type = STOCK_TYPES.find((t) => t.key === activeType)!;

  // Scan state
  const [scanQuery, setScanQuery] = useState("");
  const [scannedItem, setScannedItem] = useState<EventItem | null>(null);
  const [scanQty, setScanQty] = useState("1");
  const [scanNote, setScanNote] = useState("");
  const [scanSaving, setScanSaving] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Table state
  const [adjQty, setAdjQty] = useState<Record<number, string>>({});
  const [adjNote, setAdjNote] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  /**
   * Used only on adjustment tab.
   * Most recently changed rows move to the top.
   */
  const [recentTouchedAt, setRecentTouchedAt] = useState<
    Record<number, number>
  >({});

  // Import
  const [importingIn, setImportingIn] = useState(false);
  const [importingOut, setImportingOut] = useState(false);
  const [importMsg, setImportMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const fileInRef = useRef<HTMLInputElement>(null);
  const fileOutRef = useRef<HTMLInputElement>(null);

  // Reset on tab switch
  useEffect(() => {
    setAdjQty({});
    setAdjNote({});
    setSaving(null);
    setFeedback(null);
    setScanQuery("");
    setScannedItem(null);
    setScanQty("1");
    setScanNote("");
    setScanFeedback(null);
    setImportMsg(null);
  }, [activeType]);

  const totalUnits = items.reduce(
    (sum, item) => sum + Number(item.stock ?? 0),
    0
  );

  const negativeCount = items.filter(
    (item) => Number(item.stock ?? 0) < 0
  ).length;

  const zeroCount = items.filter(
    (item) => Number(item.stock ?? 0) === 0
  ).length;

  const lowCount = items.filter(
    (item) => Number(item.stock ?? 0) > 0 && Number(item.stock ?? 0) <= 5
  ).length;

  const visibleItems = useMemo(() => {
    const rows = [...items];

    if (activeType !== "adjustment") {
      return rows;
    }

    return rows.sort((a, b) => {
      const aTouched = recentTouchedAt[a.id] ?? 0;
      const bTouched = recentTouchedAt[b.id] ?? 0;

      if (aTouched !== bTouched) {
        return bTouched - aTouched;
      }

      return a.name.localeCompare(b.name);
    });
  }, [items, activeType, recentTouchedAt]);

  function resetScanner() {
    setScannedItem(null);
    setScanQty("1");
    setScanNote("");
    setScanFeedback(null);
    setTimeout(() => scanInputRef.current?.focus(), 50);
  }

  function normalizeScanQuantity(qty: number) {
    if (activeType === "transfer_out") return -Math.abs(qty);
    if (activeType === "transfer_in") return Math.abs(qty);

    // Adjustment supports positive or negative values.
    return qty;
  }

  function normalizeTableQuantity(raw: number) {
    if (activeType === "transfer_in") return Math.abs(raw);
    if (activeType === "transfer_out") return -Math.abs(raw);

    // Adjustment supports positive or negative values.
    return raw;
  }

  function defaultNote() {
    if (activeType === "transfer_in") return "Transfer In";
    if (activeType === "transfer_out") return "Transfer Out";
    return "Adjustment";
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault();

    const q = scanQuery.trim().toLowerCase();

    if (!q) return;

    const found =
      items.find(
        (item) =>
          item.itemId.toLowerCase() === q ||
          (item.baseItemNo ?? "").toLowerCase() === q ||
          (item.variantCode ?? "").toLowerCase() === q
      ) ??
      items.find(
        (item) =>
          item.itemId.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.baseItemNo ?? "").toLowerCase().includes(q) ||
          (item.variantCode ?? "").toLowerCase().includes(q) ||
          (item.color ?? "").toLowerCase().includes(q)
      ) ??
      null;

    if (found) {
      setScannedItem(found);
      setScanFeedback(null);
      setScanQuery("");
      setTimeout(() => document.getElementById("scan-qty-input")?.focus(), 50);
      return;
    }

    setScanFeedback({ ok: false, text: `"${scanQuery}" not found.` });
    setScanQuery("");
  }

  async function commitScan() {
    if (!scannedItem) return;

    const rawQty = Number(scanQty);

    if (!Number.isFinite(rawQty) || rawQty === 0) {
      setScanFeedback({
        ok: false,
        text:
          activeType === "adjustment"
            ? "Quantity must not be zero."
            : "Quantity must be at least 1.",
      });
      return;
    }

    if (activeType !== "adjustment" && rawQty < 0) {
      setScanFeedback({
        ok: false,
        text: "Use a positive number. The system will apply the correct direction.",
      });
      return;
    }

    const finalQty = normalizeScanQuantity(rawQty);

    setScanSaving(true);

    try {
      const res = await fetch(`/api/events/${eventId}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventItemId: scannedItem.id,
          quantity: finalQty,
          note:
            scanNote ||
            (activeType === "transfer_in"
              ? "Transfer In via scan"
              : activeType === "transfer_out"
                ? "Transfer Out via scan"
                : "Adjustment via scan"),
          source: activeType,
          typeCode: activeType,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error ?? "Failed");
      }

      setRecentTouchedAt((prev) => ({
        ...prev,
        [scannedItem.id]: Date.now(),
      }));

      setScanFeedback({
        ok: true,
        text:
          activeType === "transfer_in"
            ? `+${Math.abs(rawQty)} added to ${scannedItem.name}`
            : activeType === "transfer_out"
              ? `−${Math.abs(rawQty)} removed from ${scannedItem.name}`
              : `${rawQty > 0 ? "+" : ""}${rawQty} adjusted for ${scannedItem.name}`,
      });

      setScannedItem(null);
      setScanQty("1");
      setScanNote("");

      await onStockUpdated();

      setTimeout(() => {
        setScanFeedback(null);
        scanInputRef.current?.focus();
      }, 2500);
    } catch (err) {
      setScanFeedback({
        ok: false,
        text: err instanceof Error ? err.message : "Failed.",
      });
    } finally {
      setScanSaving(false);
    }
  }

  async function handleApply(item: EventItem) {
    const raw = Number(adjQty[item.id] ?? "0");

    if (!Number.isFinite(raw) || raw === 0) return;

    if (activeType !== "adjustment" && raw < 0) {
      setFeedback({
        ok: false,
        text: "Use a positive number. The system will apply the correct direction.",
      });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    const quantity = normalizeTableQuantity(raw);

    setSaving(item.id);

    try {
      const res = await fetch(`/api/events/${eventId}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventItemId: item.id,
          quantity,
          note: adjNote[item.id] || defaultNote(),
          source: "manual",
          typeCode: activeType,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error ?? "Failed");
      }

      setRecentTouchedAt((prev) => ({
        ...prev,
        [item.id]: Date.now(),
      }));

      setAdjQty((prev) => ({ ...prev, [item.id]: "" }));
      setAdjNote((prev) => ({ ...prev, [item.id]: "" }));
      setFeedback({ ok: true, text: `Stock updated for ${item.name}` });

      await onStockUpdated();

      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({
        ok: false,
        text: err instanceof Error ? err.message : "Failed.",
      });
    } finally {
      setSaving(null);
    }
  }

  async function handleImport(
    e: React.ChangeEvent<HTMLInputElement>,
    mode: "in" | "out"
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (mode === "in") setImportingIn(true);
    else setImportingOut(true);

    setImportMsg(null);

    const fd = new FormData();
    fd.append("file", file);

    const url =
      mode === "in"
        ? `/api/events/${eventId}/stock/import`
        : `/api/events/${eventId}/stock/transfer-out/import`;

    try {
      const res = await fetch(url, {
        method: "POST",
        body: fd,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Import failed");
      }

      const hasErrors = Array.isArray(result.errors) && result.errors.length > 0;

      setImportMsg({
        ok: !hasErrors,
        text: hasErrors
          ? `${result.processed ?? 0} applied, ${
              result.skipped ?? 0
            } skipped — ${result.errors.slice(0, 2).join("; ")}`
          : `✓ ${result.processed ?? 0} rows applied${
              result.skipped > 0 ? `, ${result.skipped} skipped` : ""
            }`,
      });

      setTimeout(() => setImportMsg(null), 6000);

      await onStockUpdated();
    } catch (err) {
      setImportMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Import failed.",
      });
    } finally {
      if (mode === "in") setImportingIn(false);
      else setImportingOut(false);

      e.target.value = "";
    }
  }

  const qtyPlaceholder =
    activeType === "transfer_out"
      ? "e.g. 5"
      : activeType === "adjustment"
        ? "e.g. 10 or -3"
        : "e.g. 10";

  const notePlaceholder =
    activeType === "transfer_in"
      ? "From warehouse..."
      : activeType === "transfer_out"
        ? "Returned to warehouse..."
        : "Correction...";

  const showScan =
    activeType === "transfer_in" ||
    activeType === "transfer_out" ||
    activeType === "adjustment";

  const scanTitle =
    activeType === "transfer_in"
      ? "Scan to receive"
      : activeType === "transfer_out"
        ? "Scan to transfer out"
        : "Scan to adjust";

  const scanQtyLabel =
    activeType === "transfer_in"
      ? "Qty to add *"
      : activeType === "transfer_out"
        ? "Qty to remove *"
        : "Qty change *";

  const scanConfirmLabel =
    activeType === "transfer_in"
      ? "Confirm Transfer In"
      : activeType === "transfer_out"
        ? "Confirm Transfer Out"
        : "Confirm Adjustment";

  return (
    <div className="space-y-4">
      {/* Summary */}
      {/* <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Total Units",
            value: totalUnits.toLocaleString("id-ID"),
            color: totalUnits < 0 ? "#dc2626" : "var(--foreground)",
            icon: <Layers size={14} />,
            iconBg: "rgba(255,101,63,0.10)",
            iconColor: "var(--brand-orange)",
          },
          {
            label: "Negative Stock",
            value: negativeCount.toLocaleString("id-ID"),
            color: "#dc2626",
            icon: <TrendingDown size={14} />,
            iconBg: "rgba(220,38,38,0.10)",
            iconColor: "#dc2626",
          },
          {
            label: "Zero Stock",
            value: zeroCount.toLocaleString("id-ID"),
            color: "#b45309",
            icon: <AlertTriangle size={14} />,
            iconBg: "rgba(245,158,11,0.10)",
            iconColor: "#b45309",
          },
          {
            label: "Low Stock ≤5",
            value: lowCount.toLocaleString("id-ID"),
            color: "#f59e0b",
            icon: <TrendingUp size={14} />,
            iconBg: "rgba(245,158,11,0.10)",
            iconColor: "#f59e0b",
          },
        ].map((row) => (
          <div key={row.label} className="rounded-2xl border p-4" style={card}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: row.iconBg, color: row.iconColor }}
              >
                {row.icon}
              </div>

              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                {row.label}
              </p>
            </div>

            <p
              className="text-2xl font-black tabular-nums"
              style={{ color: row.color }}
            >
              {row.value}
            </p>
          </div>
        ))}
      </div> */}

      {/* Action mode */}
      <div className="rounded-2xl border p-4 space-y-4" style={card}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {STOCK_TYPES.map((stockType) => {
            const active = activeType === stockType.key;

            return (
              <button
                key={stockType.key}
                onClick={() => setActiveType(stockType.key)}
                className="rounded-2xl border p-4 text-left transition-all"
                style={{
                  borderColor: active ? stockType.color : "var(--border)",
                  background: active ? stockType.bg : "transparent",
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{
                      background: stockType.bg,
                      color: stockType.color,
                    }}
                  >
                    {stockType.icon}
                  </div>

                  <div>
                    <p
                      className="text-sm font-bold"
                      style={{
                        color: active ? stockType.color : "var(--foreground)",
                      }}
                    >
                      {stockType.label}
                    </p>

                    <p
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {stockType.desc}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {showScan && (
          <div className="rounded-2xl border p-4 space-y-3" style={card}>
            <div className="flex items-center gap-2">
              <ScanLine size={15} style={{ color: type.color }} />
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                {scanTitle}
              </p>
            </div>

            <form onSubmit={handleScan}>
              <div className="relative flex items-center">
                <ScanLine
                  size={14}
                  className="absolute left-3 pointer-events-none"
                  style={{ color: type.color }}
                />

                <input
                  ref={scanInputRef}
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  placeholder="Scan or type reference no..."
                  className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1"
                  style={{
                    background: "var(--input, var(--card))",
                    border: "1.5px solid var(--border)",
                    color: "var(--foreground)",
                  }}
                  autoFocus
                />
              </div>
            </form>

            {scanFeedback && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                style={{
                  background: scanFeedback.ok
                    ? "rgba(22,163,74,0.1)"
                    : "rgba(239,68,68,0.1)",
                  color: scanFeedback.ok ? "#16a34a" : "#dc2626",
                }}
              >
                {scanFeedback.ok ? (
                  <Check size={12} />
                ) : (
                  <AlertCircle size={12} />
                )}
                {scanFeedback.text}
              </div>
            )}

            {scannedItem && (
              <div
                className="rounded-xl p-3 space-y-3"
                style={{
                  background: `${type.bg}`,
                  border: `1.5px solid ${type.color}40`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="font-bold text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      {scannedItem.name}
                    </p>

                    <p
                      className="text-xs font-mono mt-0.5"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {scannedItem.baseItemNo
                        ? `${scannedItem.baseItemNo} · `
                        : ""}
                      {scannedItem.variantCode ?? scannedItem.itemId}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Current:
                    </span>
                    <StockBadge stock={scannedItem.stock} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      className="block text-xs font-semibold mb-1"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {scanQtyLabel}
                    </label>

                    <input
                      id="scan-qty-input"
                      type="number"
                      min={activeType === "adjustment" ? undefined : 1}
                      value={scanQty}
                      onChange={(e) => setScanQty(e.target.value)}
                      className="w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                        background: "var(--card)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block text-xs font-semibold mb-1"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Note
                    </label>

                    <input
                      type="text"
                      value={scanNote}
                      onChange={(e) => setScanNote(e.target.value)}
                      placeholder={notePlaceholder}
                      className="w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                        background: "var(--card)",
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={commitScan}
                    disabled={scanSaving}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition-all disabled:opacity-40"
                    style={{ background: type.color, color: "white" }}
                  >
                    {scanSaving ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    {scanConfirmLabel}
                  </button>

                  <button
                    onClick={resetScanner}
                    className="px-3 rounded-lg border text-sm"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import / export toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <p
            className="text-sm flex-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            Use the table below, scan an item, or import from Excel.
          </p>

          <input
            ref={fileInRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => handleImport(e, "in")}
          />

          <input
            ref={fileOutRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => handleImport(e, "out")}
          />

          <button
            onClick={() => fileInRef.current?.click()}
            disabled={importingIn}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all disabled:opacity-50"
            style={{
              borderColor: "var(--border)",
              background: "var(--secondary)",
              color: "#16a34a",
            }}
          >
            {importingIn ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Upload size={13} />
            )}
            Import In
          </button>

          <a
            href={`/api/events/${eventId}/stock/export`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all"
            style={{
              borderColor: "var(--border)",
              background: "var(--secondary)",
              color: "#16a34a",
            }}
          >
            <Download size={13} />
            In Template
          </a>

          <button
            onClick={() => fileOutRef.current?.click()}
            disabled={importingOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all disabled:opacity-50"
            style={{
              borderColor: "var(--border)",
              background: "var(--secondary)",
              color: "#dc2626",
            }}
          >
            {importingOut ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Upload size={13} />
            )}
            Import Out
          </button>

          <a
            href={`/api/events/${eventId}/stock/transfer-out/export`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all"
            style={{
              borderColor: "var(--border)",
              background: "var(--secondary)",
              color: "#dc2626",
            }}
          >
            <Download size={13} />
            Out Template
          </a>
        </div>

        {importMsg && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{
              background: importMsg.ok
                ? "rgba(22,163,74,0.1)"
                : "rgba(239,68,68,0.1)",
              color: importMsg.ok ? "#16a34a" : "#dc2626",
              border: `1px solid ${
                importMsg.ok
                  ? "rgba(22,163,74,0.2)"
                  : "rgba(239,68,68,0.2)"
              }`,
            }}
          >
            {importMsg.ok ? <Check size={14} /> : <AlertCircle size={14} />}
            {importMsg.text}
          </div>
        )}

        {feedback && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{
              background: feedback.ok
                ? "rgba(22,163,74,0.1)"
                : "rgba(239,68,68,0.1)",
              color: feedback.ok ? "#16a34a" : "#dc2626",
              border: `1px solid ${
                feedback.ok
                  ? "rgba(22,163,74,0.2)"
                  : "rgba(239,68,68,0.2)"
              }`,
            }}
          >
            {feedback.ok ? <Check size={14} /> : <AlertCircle size={14} />}
            {feedback.text}
          </div>
        )}
      </div>

      {/* Stock table */}
      <div className="rounded-2xl border overflow-hidden" style={card}>
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <p
              className="text-sm font-bold"
              style={{ color: "var(--foreground)" }}
            >
              Event Stock
            </p>

            <p
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {activeType === "adjustment"
                ? "Recently adjusted items appear first."
                : "This table scrolls, so you can still access the menu above."}
            </p>
          </div>

          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{
              background: "var(--muted)",
              color: "var(--muted-foreground)",
            }}
          >
            {visibleItems.length} items
          </span>
        </div>

        {visibleItems.length === 0 ? (
          <div className="py-12 text-center">
            <Package2
              size={32}
              className="mx-auto mb-3 opacity-30"
              style={{ color: "var(--muted-foreground)" }}
            />

            <p
              className="text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              No items in this event yet.
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[520px]">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="sticky top-0 z-10">
                <tr
                  style={{
                    background: "var(--muted)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {[
                    "Item",
                    "Current Stock",
                    activeType === "transfer_in"
                      ? "Qty to Add"
                      : activeType === "transfer_out"
                        ? "Qty to Remove"
                        : "Qty (+/−)",
                    "Note",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibleItems.map((item, i) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-black/[0.03]"
                    style={{
                      borderBottom:
                        i < visibleItems.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                  >
                    <td className="px-4 py-3">
                      <p
                        className="font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        {item.name}
                      </p>

                      <p
                        className="text-xs font-mono mt-0.5"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {item.baseItemNo ? `${item.baseItemNo} · ` : ""}
                        {item.variantCode ?? item.itemId}
                      </p>

                      {item.color && (
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {item.color}
                        </p>
                      )}

                      {recentTouchedAt[item.id] && activeType === "adjustment" && (
                        <span
                          className="inline-flex mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{
                            background: "rgba(255,101,63,0.10)",
                            color: "var(--brand-orange)",
                          }}
                        >
                          Recently changed
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <StockBadge stock={item.stock} />
                    </td>

                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={activeType === "adjustment" ? undefined : 1}
                        placeholder={qtyPlaceholder}
                        value={adjQty[item.id] ?? ""}
                        onChange={(e) =>
                          setAdjQty((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        className="w-28 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                        style={ist}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <input
                        type="text"
                        placeholder={notePlaceholder}
                        value={adjNote[item.id] ?? ""}
                        onChange={(e) =>
                          setAdjNote((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        className="w-48 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                        style={ist}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleApply(item)}
                        disabled={saving === item.id || !adjQty[item.id]}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                        style={{ background: type.color, color: "white" }}
                      >
                        {saving === item.id ? (
                          <RefreshCw size={11} className="animate-spin" />
                        ) : (
                          type.icon
                        )}
                        Apply
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}