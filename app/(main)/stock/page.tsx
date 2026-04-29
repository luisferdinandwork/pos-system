// app/(main)/stock/page.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  Plus, Upload, Download, History, X, ChevronDown, ChevronUp,
  PackagePlus, TrendingDown, ClipboardList,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type ProductWithStock = {
  id: number;
  itemId: string;
  baseItemNo: string | null;
  name: string;
  color: string | null;
  variantCode: string | null;
  unit: string | null;
  stock: number;
};

type StockEntry = {
  id: number;
  productId: number;
  quantity: number;
  note: string | null;
  source: string;
  createdAt: string | null;
};

type AddForm = { productId: number; productName: string; quantity: string; note: string };

export default function StockPage() {
  const [products, setProducts]         = useState<ProductWithStock[]>([]);
  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [history, setHistory]           = useState<Record<number, StockEntry[]>>({});
  const [addForm, setAddForm]           = useState<AddForm | null>(null);
  const [search, setSearch]             = useState("");
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<{ processed: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/stock");
    setProducts(await res.json());
  }
  useEffect(() => { load(); }, []);

async function loadHistory(eventProductId: number) {
  if (history[eventProductId]) return;
  const res  = await fetch(`/api/stock?eventProductId=${eventProductId}`);
  const data = await res.json();
  setHistory((prev) => ({ ...prev, [eventProductId]: data }));
}

  // Update handleAddStock to send eventProductId:
  async function handleAddStock(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm) return;
    await fetch("/api/stock", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventProductId: addForm.productId,   // addForm.productId holds the ep.id
        quantity:       Number(addForm.quantity),
        note:           addForm.note,
      }),
    });
    setAddForm(null);
    setHistory((prev) => {
      const next = { ...prev };
      delete next[addForm.productId];
      return next;
    });
    load();
  }

  function toggleHistory(productId: number) {
    if (expandedId === productId) {
      setExpandedId(null);
    } else {
      setExpandedId(productId);
      loadHistory(productId);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/import/stock", { method: "POST", body: fd });
    setImportResult(await res.json());
    setImporting(false);
    setHistory({});
    load();
    e.target.value = "";
  }

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.itemId.toLowerCase().includes(search.toLowerCase())
  );

  const cardStyle  = { background: "var(--card)", borderColor: "var(--border)" };
  const inputCls   = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 transition-colors";
  const inputStyle = { borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" };

  const sourceIcon = (source: string) => {
    if (source === "sale")   return <TrendingDown size={12} className="text-red-400" />;
    if (source === "import") return <Upload size={12} style={{ color: "var(--brand-orange)" }} />;
    return <PackagePlus size={12} style={{ color: "var(--brand-mid)" }} />;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Stock Management</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {products.length} products · click a row to see history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all"
            style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}
          >
            <Upload size={14} />
            {importing ? "Importing…" : "Import Stock"}
          </button>
          <a
            href="/api/export/stock"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all"
            style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--foreground)" }}
          >
            <Download size={14} />
            Download Template
          </a>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div
          className="rounded-lg p-4 text-sm border flex items-start justify-between"
          style={{
            background: importResult.errors.length > 0 ? "rgba(224,58,58,0.08)" : "rgba(255,101,63,0.08)",
            borderColor: importResult.errors.length > 0 ? "rgba(224,58,58,0.3)" : "var(--brand-orange)",
            color: "var(--foreground)",
          }}
        >
          <span>
            ✅ Import done — <strong>{importResult.processed}</strong> updated,{" "}
            <strong>{importResult.skipped}</strong> skipped (zero qty).
            {importResult.errors.length > 0 && (
              <span className="ml-2 text-red-500">{importResult.errors.length} errors.</span>
            )}
          </span>
          <button onClick={() => setImportResult(null)}>
            <X size={14} style={{ color: "var(--muted-foreground)" }} />
          </button>
        </div>
      )}

      {/* Add stock modal */}
      {addForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(30,16,78,0.25)", backdropFilter: "blur(2px)" }}
        >
          <div className="rounded-xl border p-6 w-full max-w-sm shadow-xl" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>Add Stock</h2>
              <button onClick={() => setAddForm(null)}>
                <X size={16} style={{ color: "var(--muted-foreground)" }} />
              </button>
            </div>
            <p className="text-sm font-medium mb-4" style={{ color: "var(--foreground)" }}>
              {addForm.productName}
            </p>
            <form onSubmit={handleAddStock} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>
                  Quantity to Add
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={addForm.quantity}
                  onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                  className={inputCls}
                  style={inputStyle}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>
                  Note
                </label>
                <input
                  value={addForm.note}
                  onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="e.g. Restock batch June 2025"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 rounded-lg py-2 text-sm font-semibold"
                  style={{ background: "var(--brand-orange)", color: "white" }}
                >
                  Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setAddForm(null)}
                  className="px-4 rounded-lg text-sm border"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products..."
        className={inputCls}
        style={{ ...inputStyle, paddingLeft: "0.75rem" }}
      />

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={cardStyle}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              {["Reference No.", "Description", "Variant", "Unit", "Current Stock", "Actions"].map((h) => (
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                  No products found.
                </td>
              </tr>
            ) : (
              filtered.map((p, i) => (
                // ↓ React.Fragment with key replaces bare <> so both rows share one key
                <React.Fragment key={p.id}>
                  <tr
                    className="transition-colors cursor-pointer hover:bg-black/5"
                    style={{
                      borderBottom:
                        expandedId === p.id
                          ? "none"
                          : i < filtered.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                    onClick={() => toggleHistory(p.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {p.itemId}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--foreground)" }}>
                      {p.name}
                    </td>
                    <td className="px-4 py-3">
                      {p.variantCode ? (
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
                        >
                          {p.variantCode}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted-foreground)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {p.unit}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-bold text-base"
                        style={{
                          color:
                            p.stock <= 0 ? "#e03a3a" : p.stock <= 5 ? "#d97706" : "var(--brand-mid)",
                        }}
                      >
                        {p.stock}
                      </span>
                      {p.stock <= 0 && (
                        <span
                          className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(224,58,58,0.1)", color: "#e03a3a" }}
                        >
                          Out of stock
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() =>
                            setAddForm({
                              productId: p.id,
                              productName: `${p.name}${p.variantCode ? ` (${p.variantCode})` : ""}`,
                              quantity: "",
                              note: "Manual restock",
                            })
                          }
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{ background: "rgba(255,101,63,0.1)", color: "var(--brand-orange)" }}
                        >
                          <Plus size={12} /> Add
                        </button>
                        <button
                          onClick={() => toggleHistory(p.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
                        >
                          <History size={12} />
                          {expandedId === p.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* History drawer row */}
                  {expandedId === p.id && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                        }}
                      >
                        <div className="px-4 py-3" style={{ background: "var(--muted)" }}>
                          <div className="flex items-center gap-2 mb-3">
                            <ClipboardList size={13} style={{ color: "var(--muted-foreground)" }} />
                            <p
                              className="text-xs font-semibold uppercase tracking-wider"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              Stock History
                            </p>
                          </div>
                          {!history[p.id] ? (
                            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Loading…</p>
                          ) : history[p.id].length === 0 ? (
                            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>No entries yet.</p>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {history[p.id].map((entry) => (
                                <div
                                  key={entry.id}
                                  className="flex items-center justify-between rounded-lg px-3 py-2"
                                  style={{ background: "var(--card)" }}
                                >
                                  <div className="flex items-center gap-2">
                                    {sourceIcon(entry.source)}
                                    <span className="text-xs" style={{ color: "var(--foreground)" }}>
                                      {entry.note ?? entry.source}
                                    </span>
                                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                                      · {entry.createdAt ? formatDate(entry.createdAt) : "—"}
                                    </span>
                                  </div>
                                  <span
                                    className="text-sm font-bold"
                                    style={{ color: entry.quantity > 0 ? "var(--brand-mid)" : "#e03a3a" }}
                                  >
                                    {entry.quantity > 0 ? `+${entry.quantity}` : entry.quantity}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}