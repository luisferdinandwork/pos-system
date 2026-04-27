// app/products/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Upload, Download, Pencil, Trash2, Search } from "lucide-react";
import { formatRupiah } from "@/lib/utils";

type Product = {
  id: number;
  itemId: string;
  baseItemNo: string | null;
  name: string;
  color: string | null;
  variantCode: string | null;
  unit: string | null;
  price: string | number;
  originalPrice: string | number | null;
  stock: number;
};

type FormState = Omit<Product, "id"> & { id?: number };

const emptyForm = (): FormState => ({
  itemId: "", baseItemNo: "", name: "", color: "", variantCode: "",
  unit: "PCS", price: "", originalPrice: "", stock: 0,
});

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.itemId.toLowerCase().includes(search.toLowerCase()) ||
      (p.baseItemNo ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function load() {
    const res = await fetch("/api/products");
    setProducts(await res.json());
  }
  useEffect(() => { load(); }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const method = form.id ? "PUT" : "POST";
    await fetch("/api/products", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm(emptyForm());
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/products?id=${id}`, { method: "DELETE" });
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/import/products", { method: "POST", body: fd });
    const result = await res.json();
    setImportResult(result);
    setImporting(false);
    load();
    e.target.value = "";
  }

  const inputCls = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-1 transition-colors";
  const inputStyle = { borderColor: "var(--border)", color: "var(--foreground)" };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {products.length} items in catalog
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all"
            style={{ borderColor: "var(--brand-mid)", color: "var(--foreground)", background: "var(--secondary)" }}
          >
            <Upload size={14} />
            {importing ? "Importing…" : "Import Excel"}
          </button>
          <a
            href="/api/export/products"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all"
            style={{ borderColor: "var(--brand-mid)", color: "var(--foreground)", background: "var(--secondary)" }}
          >
            <Download size={14} />
            Export Excel
          </a>
          <button
            onClick={() => { setForm(emptyForm()); setShowForm(true); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "var(--brand-orange)", color: "white" }}
          >
            <Plus size={14} />
            Add Product
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div
          className="rounded-lg p-4 text-sm border"
          style={{
            background: importResult.errors.length > 0 ? "rgba(224,58,58,0.1)" : "rgba(255,101,63,0.1)",
            borderColor: importResult.errors.length > 0 ? "rgba(224,58,58,0.3)" : "var(--brand-orange)",
            color: "var(--foreground)",
          }}
        >
          ✅ Import complete — <strong>{importResult.inserted}</strong> inserted, <strong>{importResult.updated}</strong> updated.
          {importResult.errors.length > 0 && (
            <span className="ml-2 text-red-400">{importResult.errors.length} errors.</span>
          )}
          <button onClick={() => setImportResult(null)} className="ml-3 underline text-xs opacity-60">Dismiss</button>
        </div>
      )}

      {/* Product form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(10,5,30,0.8)" }}
        >
          <div
            className="rounded-xl border p-6 w-full max-w-lg shadow-2xl"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2 className="font-semibold text-white mb-5 text-lg">
              {form.id ? "Edit Product" : "New Product"}
            </h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>Reference No. (Item ID) *</label>
                  <input name="itemId" value={form.itemId} onChange={handleChange} required className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>Base Item No.</label>
                  <input name="baseItemNo" value={form.baseItemNo ?? ""} onChange={handleChange} className={inputCls} style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>Description (Name) *</label>
                <input name="name" value={form.name} onChange={handleChange} required className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>Description 2 (Color)</label>
                <input name="color" value={form.color ?? ""} onChange={handleChange} className={inputCls} style={inputStyle} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>Variant / Size</label>
                  <input name="variantCode" value={form.variantCode ?? ""} onChange={handleChange} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>Unit</label>
                  <select name="unit" value={form.unit ?? "PCS"} onChange={handleChange} className={inputCls} style={{ ...inputStyle, background: "var(--card)" }}>
                    <option value="PCS">PCS</option>
                    <option value="PRS">PRS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>Stock</label>
                  <input name="stock" type="number" min="0" value={form.stock} onChange={handleChange} required className={inputCls} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>Bazar Price (Rp) *</label>
                  <input name="price" type="number" min="0" value={form.price} onChange={handleChange} required className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>Original Price (Rp)</label>
                  <input name="originalPrice" type="number" min="0" value={form.originalPrice ?? ""} onChange={handleChange} className={inputCls} style={inputStyle} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 rounded-lg py-2 text-sm font-semibold transition-all" style={{ background: "var(--brand-orange)", color: "white" }}>
                  Save Product
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-4 rounded-lg text-sm border transition-all" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, item ID, or base item no..."
          className="w-full rounded-lg border pl-9 pr-4 py-2.5 text-sm bg-transparent focus:outline-none focus:ring-1 transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                {["Reference No.", "Base Item", "Description", "Color", "Size", "Unit", "Bazar Price", "Original", "Stock", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                    No products found.
                  </td>
                </tr>
              ) : filtered.map((p, i) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}
                  className="transition-colors hover:bg-white/5"
                >
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{p.itemId}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.baseItemNo ?? "-"}</td>
                  <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.color ?? "-"}</td>
                  <td className="px-4 py-3">
                    {p.variantCode ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
                        {p.variantCode}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.unit}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: "var(--brand-orange)" }}>{formatRupiah(p.price)}</td>
                  <td className="px-4 py-3 text-xs line-through" style={{ color: "var(--muted-foreground)" }}>
                    {p.originalPrice ? formatRupiah(p.originalPrice) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold text-sm ${Number(p.stock) <= 5 ? "text-red-400" : "text-white"}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setForm({ ...p, originalPrice: p.originalPrice ?? "" }); setShowForm(true); }}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: "var(--brand-yellow)", background: "rgba(255,200,92,0.1)" }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: "#e0534a", background: "rgba(224,83,74,0.1)" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}