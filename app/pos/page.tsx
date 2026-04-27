// app/pos/page.tsx
"use client";
import { useEffect, useState, useRef } from "react";
import {
  ShoppingCart, X, Plus, Minus, Search, CreditCard,
  Banknote, QrCode, Wallet, ArrowLeft, Trash2,
  ScanLine, CheckCircle2, Package,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";

type Product = {
  id: number;
  itemId: string;
  name: string;
  color: string | null;
  variantCode: string | null;
  unit: string | null;
  price: string | number;
  originalPrice: string | number | null;
};

type CartItem = {
  productId: number;
  productName: string;
  variantCode: string | null;
  color: string | null;
  quantity: number;
  unitPrice: number;
};

type PaymentMethod = {
  id: number;
  name: string;
  type: string;
  provider: string | null;
  accountInfo: string | null;
};

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  cash:    { icon: <Banknote size={20} />,   color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  qris:    { icon: <QrCode size={20} />,     color: "#7c3aed", bg: "#faf5ff", border: "#e9d5ff" },
  debit:   { icon: <CreditCard size={20} />, color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd" },
  credit:  { icon: <CreditCard size={20} />, color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  ewallet: { icon: <Wallet size={20} />,     color: "#be185d", bg: "#fdf2f8", border: "#fbcfe8" },
};

type Screen = "pos" | "payment" | "success";

export default function POSPage() {
  const [products, setProducts]           = useState<Product[]>([]);
  const [cart, setCart]                   = useState<CartItem[]>([]);
  const [screen, setScreen]               = useState<Screen>("pos");
  const [query, setQuery]                 = useState("");
  const [suggestions, setSuggestions]     = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [paymentOptions, setPaymentOptions]   = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod]   = useState<PaymentMethod | null>(null);
  const [reference, setReference]         = useState("");
  const [lastTxnId, setLastTxnId]         = useState<number | null>(null);
  const [toast, setToast]                 = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [isProcessing, setIsProcessing]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then(setProducts);
    fetch("/api/payment-methods?active=true").then((r) => r.json()).then(setPaymentOptions);
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Live search suggestions
  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = query.toLowerCase();
    const matches = products.filter(
      (p) =>
        p.itemId.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.variantCode ?? "").toLowerCase().includes(q) ||
        (p.color ?? "").toLowerCase().includes(q)
    ).slice(0, 6);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [query, products]);

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  function addToCart(product: Product) {
    setCart((prev) => {
      const ex = prev.find((i) => i.productId === product.id);
      if (ex) return prev.map((i) =>
        i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
      );
      return [...prev, {
        productId:   product.id,
        productName: product.name,
        variantCode: product.variantCode,
        color:       product.color,
        quantity:    1,
        unitPrice:   parseFloat(String(product.price)),
      }];
    });
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  async function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    // Exact match first (for barcode scans)
    const exact = products.find((p) => p.itemId.toLowerCase() === q.toLowerCase());
    if (exact) { addToCart(exact); return; }

    // Fallback to API
    const res = await fetch(`/api/products/${encodeURIComponent(q)}`);
    if (res.ok) { addToCart(await res.json()); }
    else { showToast("Product not found", "err"); setQuery(""); }
  }

  function updateQty(id: number, qty: number) {
    if (qty < 1) setCart((p) => p.filter((i) => i.productId !== id));
    else setCart((p) => p.map((i) => i.productId === id ? { ...i, quantity: qty } : i));
  }

  const total     = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const needsRef  = selectedMethod && selectedMethod.type !== "cash";

  async function handleConfirmPayment() {
    if (!selectedMethod) return;
    setIsProcessing(true);
    const methodLabel = `${selectedMethod.name}${selectedMethod.provider ? ` (${selectedMethod.provider})` : ""}`;
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart, totalAmount: total,
        paymentMethod: methodLabel,
        paymentReference: reference || null,
      }),
    });
    const txn = await res.json();
    setLastTxnId(txn.id);
    setIsProcessing(false);
    setScreen("success");
  }

  function resetPOS() {
    setCart([]); setScreen("pos"); setSelectedMethod(null);
    setReference(""); setLastTxnId(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Shared styles ────────────────────────────────────────────────────────
  const card = {
    background: "var(--card)",
    borderColor: "var(--border)",
  };

  // ════════════════════════════════════════════════════════════════════════
  // SUCCESS SCREEN
  // ════════════════════════════════════════════════════════════════════════
  if (screen === "success") {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div
          className="rounded-3xl border p-10 w-full max-w-md text-center shadow-xl space-y-5"
          style={card}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
            style={{ background: "rgba(22,163,74,0.1)" }}
          >
            <CheckCircle2 size={44} style={{ color: "#16a34a" }} />
          </div>

          <div>
            <h2 className="text-2xl font-black" style={{ color: "var(--foreground)" }}>
              Payment Complete!
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              Transaction #{lastTxnId} recorded successfully
            </p>
          </div>

          <div
            className="rounded-2xl p-5 space-y-1"
            style={{ background: "var(--muted)" }}
          >
            <p className="text-xs uppercase tracking-wider font-semibold"
              style={{ color: "var(--muted-foreground)" }}>
              Amount Paid
            </p>
            <p className="text-4xl font-black" style={{ color: "#16a34a" }}>
              {formatRupiah(total)}
            </p>
            <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
              via {selectedMethod?.name}
              {selectedMethod?.provider ? ` · ${selectedMethod.provider}` : ""}
            </p>
          </div>

          {/* Items summary */}
          <div className="rounded-xl border divide-y text-left" style={card}>
            {cart.map((item) => (
              <div key={item.productId} className="flex justify-between items-center px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                    {item.productName}
                    {item.variantCode &&
                      <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
                        {item.variantCode}
                      </span>
                    }
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {formatRupiah(item.unitPrice)} × {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                  {formatRupiah(item.unitPrice * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={resetPOS}
            className="w-full rounded-xl py-3.5 font-bold text-sm transition-all"
            style={{ background: "var(--brand-orange)", color: "white" }}
          >
            New Transaction
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // PAYMENT SCREEN
  // ════════════════════════════════════════════════════════════════════════
  if (screen === "payment") {
    const grouped = Object.entries(
      paymentOptions.reduce<Record<string, PaymentMethod[]>>((acc, pm) => {
        acc[pm.type] = [...(acc[pm.type] ?? []), pm];
        return acc;
      }, {})
    );

    return (
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Back */}
        <button
          onClick={() => { setScreen("pos"); setSelectedMethod(null); setReference(""); }}
          className="flex items-center gap-2 text-sm font-medium transition-all"
          style={{ color: "var(--muted-foreground)" }}
        >
          <ArrowLeft size={16} /> Back to cart
        </button>

        {/* Amount hero */}
        <div
          className="rounded-3xl p-8 text-center"
          style={{ background: "var(--brand-deep)" }}
        >
          <p className="text-xs uppercase tracking-widest font-semibold mb-2"
            style={{ color: "rgba(255,200,92,0.8)" }}>
            Total to Pay
          </p>
          <p className="text-5xl font-black text-white">
            {formatRupiah(total)}
          </p>
          <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>
            {cartCount} item{cartCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Payment method selector */}
        <div className="rounded-2xl border overflow-hidden" style={card}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-bold" style={{ color: "var(--foreground)" }}>
              Select Payment Method
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              Choose how the customer will pay
            </p>
          </div>

          <div className="p-4 space-y-3">
            {grouped.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  No payment methods configured.{" "}
                  <a href="/payment-methods" style={{ color: "var(--brand-orange)" }}>
                    Set them up →
                  </a>
                </p>
              </div>
            ) : grouped.map(([type, methods]) => {
              const meta = TYPE_META[type] ?? TYPE_META.cash;
              return (
                <div key={type}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
                    style={{ color: "var(--muted-foreground)" }}>
                    {type === "ewallet" ? "E-Wallet" : type.charAt(0).toUpperCase() + type.slice(1)}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {methods.map((pm) => {
                      const isSelected = selectedMethod?.id === pm.id;
                      return (
                        <button
                          key={pm.id}
                          type="button"
                          onClick={() => { setSelectedMethod(pm); setReference(""); }}
                          className="flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all"
                          style={{
                            borderColor: isSelected ? meta.color  : "var(--border)",
                            background:  isSelected ? meta.bg     : "var(--card)",
                            boxShadow:   isSelected
                              ? `0 0 0 2px ${meta.color}33`
                              : "none",
                          }}
                        >
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                              background: isSelected ? meta.bg     : "var(--muted)",
                              color:      isSelected ? meta.color  : "var(--muted-foreground)",
                              border:     isSelected ? `1.5px solid ${meta.border}` : "1.5px solid transparent",
                            }}
                          >
                            {meta.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate"
                              style={{ color: isSelected ? meta.color : "var(--foreground)" }}>
                              {pm.name}
                            </p>
                            {pm.provider && (
                              <p className="text-xs truncate"
                                style={{ color: isSelected ? meta.color : "var(--muted-foreground)", opacity: 0.8 }}>
                                {pm.provider}
                              </p>
                            )}
                          </div>
                          {isSelected && (
                            <CheckCircle2
                              size={16}
                              className="ml-auto flex-shrink-0"
                              style={{ color: meta.color }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reference code input — shown for non-cash */}
        {needsRef && (
          <div
            className="rounded-2xl border p-5 space-y-2"
            style={{
              ...card,
              borderColor: TYPE_META[selectedMethod!.type]?.border ?? "var(--border)",
              background:  TYPE_META[selectedMethod!.type]?.bg    ?? "var(--card)",
            }}
          >
            <label className="block text-sm font-semibold"
              style={{ color: TYPE_META[selectedMethod!.type]?.color ?? "var(--foreground)" }}>
              Reference / Approval Code
            </label>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Scan the QR or enter the EDC approval code
            </p>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Enter code here…"
              autoFocus
              className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all font-mono"
              style={{
                borderColor: TYPE_META[selectedMethod!.type]?.border ?? "var(--border)",
                background: "white",
                color: "var(--foreground)",
              }}
            />
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirmPayment}
          disabled={!selectedMethod || isProcessing}
          className="w-full rounded-2xl py-4 text-base font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "var(--brand-orange)", color: "white" }}
        >
          {isProcessing
            ? "Processing…"
            : selectedMethod
              ? `Confirm · ${formatRupiah(total)}`
              : "Select a payment method"
          }
        </button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // MAIN POS SCREEN
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-5 right-5 z-[100] px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{
            background: toast.type === "ok" ? "var(--brand-deep)" : "#dc2626",
            color: "white",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
          Point of Sale
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          Scan a barcode or search to add items
        </p>
      </div>

      {/* Scanner / Search bar */}
      <div className="relative" ref={suggestRef}>
        <form onSubmit={handleScanSubmit}>
          <div className="relative">
            <ScanLine
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--brand-orange)" }}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Scan barcode or search by name, variant, color…"
              className="w-full rounded-2xl border-2 pl-12 pr-4 py-4 text-sm font-medium focus:outline-none transition-all"
              style={{
                borderColor: "var(--brand-orange)",
                background: "var(--card)",
                color: "var(--foreground)",
                boxShadow: "0 0 0 4px rgba(255,101,63,0.08)",
              }}
              autoFocus
            />
          </div>
        </form>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-2 rounded-2xl border shadow-xl z-50 overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            {suggestions.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/5"
                style={{
                  borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
                  style={{ background: "var(--muted)", color: "var(--brand-deep)" }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                    {p.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                      {p.itemId}
                    </span>
                    {p.variantCode && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
                        {p.variantCode}
                      </span>
                    )}
                    {p.color && (
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {p.color}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-bold flex-shrink-0" style={{ color: "var(--brand-orange)" }}>
                  {formatRupiah(p.price)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="rounded-2xl border overflow-hidden" style={card}>
        {/* Cart header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: "var(--border)", background: "var(--muted)" }}
        >
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} style={{ color: "var(--brand-orange)" }} />
            <span className="font-bold text-sm" style={{ color: "var(--foreground)" }}>
              Cart
            </span>
            {cartCount > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: "var(--brand-orange)", color: "white" }}
              >
                {cartCount}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-xs px-2.5 py-1 rounded-lg transition-all"
              style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Cart items */}
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Package size={40} style={{ color: "var(--muted-foreground)", opacity: 0.2 }} />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Cart is empty — scan or search above
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {cart.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 px-5 py-3.5">
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
                  style={{ background: "var(--muted)", color: "var(--brand-deep)" }}
                >
                  {item.productName.slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                    {item.productName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {item.variantCode && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
                        {item.variantCode}
                      </span>
                    )}
                    {item.color && (
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {item.color}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {formatRupiah(item.unitPrice)}
                    </span>
                  </div>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => updateQty(item.productId, item.quantity - 1)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: "var(--muted)" }}
                  >
                    {item.quantity === 1
                      ? <Trash2 size={12} style={{ color: "#dc2626" }} />
                      : <Minus size={12} style={{ color: "var(--muted-foreground)" }} />
                    }
                  </button>
                  <span className="w-8 text-center text-sm font-bold" style={{ color: "var(--foreground)" }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQty(item.productId, item.quantity + 1)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: "var(--muted)" }}
                  >
                    <Plus size={12} style={{ color: "var(--muted-foreground)" }} />
                  </button>
                </div>

                {/* Line total */}
                <p className="w-24 text-right text-sm font-bold flex-shrink-0"
                  style={{ color: "var(--brand-orange)" }}>
                  {formatRupiah(item.unitPrice * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Cart footer / totals */}
        {cart.length > 0 && (
          <div
            className="px-5 py-4 border-t space-y-3"
            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
          >
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Subtotal ({cartCount} items)
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                {formatRupiah(total)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t"
              style={{ borderColor: "var(--border)" }}>
              <span className="font-bold" style={{ color: "var(--foreground)" }}>Total</span>
              <span className="text-2xl font-black" style={{ color: "var(--brand-orange)" }}>
                {formatRupiah(total)}
              </span>
            </div>
            <button
              onClick={() => setScreen("payment")}
              className="w-full rounded-xl py-3.5 font-bold text-sm transition-all"
              style={{ background: "var(--brand-orange)", color: "white" }}
            >
              Checkout → Select Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}