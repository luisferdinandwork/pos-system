// app/pos/page.tsx
"use client";
import { useEffect, useState, useRef } from "react";
import {
  ShoppingCart, X, Plus, Minus, Search, CreditCard,
  Banknote, QrCode, Wallet, ArrowLeft, Trash2,
  ScanLine, CheckCircle2, Package, Calendar, Tag,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type EventRow = {
  id: number; name: string; status: string; location: string | null;
};

// EventItem — matches the event_items table (no productId FK anymore)
type EventItem = {
  id:          number;
  stock:       number;
  retailPrice: string;
  netPrice:    string;
  itemId:      string;
  name:        string;
  color:       string | null;
  variantCode: string | null;
  unit:        string | null;
};

// CartItem — uses eventItemId, carries itemId snapshot for the transaction record
type CartItem = {
  eventItemId:  number;
  itemId:       string;        // snapshot at time of sale
  productName:  string;
  variantCode:  string | null;
  color:        string | null;
  quantity:     number;
  unitPrice:    number;
  discountAmt:  number;
  finalPrice:   number;
  promoApplied: string | null;
  freeQty:      number;
};

type PaymentMethod = {
  id: number; name: string; type: string; provider: string | null;
};

type PromoResult = {
  finalUnitPrice: number;
  discountAmt:    number;
  promoName:      string | null;
  freeQty:        number;
};

// ── Payment method style map ──────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  cash:    { icon: <Banknote size={20} />,   color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  qris:    { icon: <QrCode size={20} />,     color: "#7c3aed", bg: "#faf5ff", border: "#e9d5ff" },
  debit:   { icon: <CreditCard size={20} />, color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd" },
  credit:  { icon: <CreditCard size={20} />, color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  ewallet: { icon: <Wallet size={20} />,     color: "#be185d", bg: "#fdf2f8", border: "#fbcfe8" },
};

type Screen = "select-event" | "pos" | "payment" | "success";

// ── Component ─────────────────────────────────────────────────────────────────

export default function POSPage() {
  const [events,           setEvents]           = useState<EventRow[]>([]);
  const [activeEvent,      setActiveEvent]      = useState<EventRow | null>(null);
  const [eventItems,       setEventItems]       = useState<EventItem[]>([]);
  const [activePromoCount, setActivePromoCount] = useState(0);
  const [cart,             setCart]             = useState<CartItem[]>([]);
  const [screen,           setScreen]           = useState<Screen>("select-event");
  const [query,            setQuery]            = useState("");
  const [suggestions,      setSuggestions]      = useState<EventItem[]>([]);
  const [showSuggestions,  setShowSuggestions]  = useState(false);
  const [paymentOptions,   setPaymentOptions]   = useState<PaymentMethod[]>([]);
  const [selectedMethod,   setSelectedMethod]   = useState<PaymentMethod | null>(null);
  const [reference,        setReference]        = useState("");
  const [lastTxnId,        setLastTxnId]        = useState<number | null>(null);
  const [isProcessing,     setIsProcessing]     = useState(false);
  const [toast,            setToast]            = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const inputRef   = useRef<HTMLInputElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/events").then((r) => r.json()).then(setEvents);
    fetch("/api/payment-methods?active=true").then((r) => r.json()).then(setPaymentOptions);
  }, []);

  async function selectEvent(ev: EventRow) {
    setActiveEvent(ev);
    const [itemData, promoData] = await Promise.all([
      fetch(`/api/events/${ev.id}/products`).then((r) => r.json()),
      fetch(`/api/events/${ev.id}/promos`).then((r) => r.json()),
    ]);
    setEventItems(itemData);
    setActivePromoCount(
      (promoData as { isActive: boolean }[]).filter((p) => p.isActive).length
    );
    setScreen("pos");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Search / suggestions ──────────────────────────────────────────────────

  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = query.toLowerCase();
    const matches = eventItems.filter((p) =>
      p.itemId.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q)   ||
      (p.variantCode ?? "").toLowerCase().includes(q) ||
      (p.color       ?? "").toLowerCase().includes(q)
    ).slice(0, 6);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [query, eventItems]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  // ── Promo calculation — calls API so server-only lib stays server-side ─────

  async function fetchPromoResult(
    item:       EventItem,
    quantity:   number,
    eventTotal: number
  ): Promise<PromoResult> {
    const res = await fetch("/api/promos/calculate", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId:     activeEvent!.id,
        eventItemId: item.id,           // ← renamed from eventProductId
        quantity,
        netPrice:    parseFloat(String(item.netPrice)),
        eventTotal,
      }),
    });
    if (!res.ok) {
      return {
        finalUnitPrice: parseFloat(String(item.netPrice)),
        discountAmt:    0,
        promoName:      null,
        freeQty:        0,
      };
    }
    return res.json();
  }

  // ── Cart operations ───────────────────────────────────────────────────────

  async function addToCart(item: EventItem) {
    const currentTotal = cart.reduce((s, i) => s + i.finalPrice * i.quantity, 0);
    const existingQty  = cart.find((c) => c.eventItemId === item.id)?.quantity ?? 0;
    const newQty       = existingQty + 1;

    const promoResult  = await fetchPromoResult(item, newQty, currentTotal);

    setCart((prev) => {
      const updated: CartItem = {
        eventItemId:  item.id,
        itemId:       item.itemId,       // snapshot for transaction record
        productName:  item.name,
        variantCode:  item.variantCode,
        color:        item.color,
        quantity:     newQty,
        unitPrice:    parseFloat(String(item.netPrice)),
        discountAmt:  promoResult.discountAmt,
        finalPrice:   promoResult.finalUnitPrice,
        promoApplied: promoResult.promoName,
        freeQty:      promoResult.freeQty,
      };
      const exists = prev.find((c) => c.eventItemId === item.id);
      if (exists) return prev.map((c) => c.eventItemId === item.id ? updated : c);
      return [...prev, updated];
    });

    setQuery(""); setSuggestions([]); setShowSuggestions(false);
    inputRef.current?.focus();
  }

  async function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const exact = eventItems.find((p) => p.itemId.toLowerCase() === q.toLowerCase());
    if (exact) { addToCart(exact); return; }
    showToast("Product not found in this event", "err");
    setQuery("");
  }

  async function updateQty(eventItemId: number, qty: number) {
    if (qty < 1) {
      setCart((p) => p.filter((i) => i.eventItemId !== eventItemId));
      return;
    }
    const item = eventItems.find((p) => p.id === eventItemId);
    if (!item) return;

    const currentTotal = cart
      .filter((i) => i.eventItemId !== eventItemId)
      .reduce((s, i) => s + i.finalPrice * i.quantity, 0);

    const promoResult = await fetchPromoResult(item, qty, currentTotal);

    setCart((prev) => prev.map((i) =>
      i.eventItemId === eventItemId
        ? {
            ...i,
            quantity:     qty,
            discountAmt:  promoResult.discountAmt,
            finalPrice:   promoResult.finalUnitPrice,
            promoApplied: promoResult.promoName,
            freeQty:      promoResult.freeQty,
          }
        : i
    ));
  }

  // ── Totals ────────────────────────────────────────────────────────────────

  const subtotal   = cart.reduce((s, i) => s + i.unitPrice   * i.quantity, 0);
  const totalDisc  = cart.reduce((s, i) => s + i.discountAmt * i.quantity, 0);
  const finalTotal = cart.reduce((s, i) => s + i.finalPrice  * i.quantity, 0);
  const cartCount  = cart.reduce((s, i) => s + i.quantity, 0);
  const needsRef   = selectedMethod && selectedMethod.type !== "cash";

  // ── Checkout ──────────────────────────────────────────────────────────────

  async function handleConfirmPayment() {
    if (!selectedMethod || !activeEvent) return;
    setIsProcessing(true);

    const methodLabel = `${selectedMethod.name}${selectedMethod.provider ? ` (${selectedMethod.provider})` : ""}`;

    const res = await fetch("/api/transactions", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId:          activeEvent.id,
        totalAmount:      subtotal,
        discount:         totalDisc,
        finalAmount:      finalTotal,
        paymentMethod:    methodLabel,
        paymentReference: reference || null,
        items: cart.map((i) => ({
          eventItemId:  i.eventItemId,   // ← was eventProductId
          itemId:       i.itemId,         // snapshot
          productName:  i.productName,
          quantity:     i.quantity,
          unitPrice:    i.unitPrice,
          discountAmt:  i.discountAmt,
          finalPrice:   i.finalPrice,
          subtotal:     i.finalPrice * i.quantity,
          promoApplied: i.promoApplied,
          freeQty:      i.freeQty,
        })),
      }),
    });

    const txn = await res.json();
    setLastTxnId(txn.id);
    setIsProcessing(false);
    setScreen("success");
  }

  function resetPOS() {
    setCart([]);
    setScreen("select-event");
    setActiveEvent(null);
    setSelectedMethod(null);
    setReference("");
    setLastTxnId(null);
  }

  const cs = { background: "var(--card)", borderColor: "var(--border)" };

  // ── SCREEN: Event selection ───────────────────────────────────────────────

  if (screen === "select-event") {
    const activeEvents = events.filter((e) => e.status === "active");
    const draftEvents  = events.filter((e) => e.status === "draft");
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            Point of Sale
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
            Select an event to start selling
          </p>
        </div>

        {activeEvents.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--muted-foreground)" }}>Active Events</p>
            <div className="space-y-2">
              {activeEvents.map((ev) => (
                <button key={ev.id} onClick={() => selectEvent(ev)}
                  className="w-full rounded-2xl border p-5 text-left transition-all hover:shadow-md"
                  style={{ ...cs, borderColor: "#16a34a" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold" style={{ color: "var(--foreground)" }}>{ev.name}</p>
                      {ev.location && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          {ev.location}
                        </p>
                      )}
                    </div>
                    <span className="text-xs px-3 py-1.5 rounded-full font-semibold"
                      style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
                      Active →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {draftEvents.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--muted-foreground)" }}>Draft Events</p>
            <div className="space-y-2">
              {draftEvents.map((ev) => (
                <button key={ev.id} onClick={() => selectEvent(ev)}
                  className="w-full rounded-2xl border p-5 text-left transition-all hover:shadow-md opacity-70"
                  style={cs}>
                  <p className="font-bold" style={{ color: "var(--foreground)" }}>{ev.name}</p>
                  {ev.location && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {ev.location}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {events.length === 0 && (
          <div className="rounded-2xl border py-16 text-center" style={cs}>
            <Calendar size={40} className="mx-auto mb-3"
              style={{ color: "var(--muted-foreground)", opacity: 0.3 }} />
            <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>
              No events found.
            </p>
            <a href="/events" className="text-sm font-semibold" style={{ color: "var(--brand-orange)" }}>
              Create an event →
            </a>
          </div>
        )}
      </div>
    );
  }

  // ── SCREEN: Success ───────────────────────────────────────────────────────

  if (screen === "success") {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="rounded-3xl border p-10 w-full max-w-md text-center shadow-xl space-y-5" style={cs}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
            style={{ background: "rgba(22,163,74,0.1)" }}>
            <CheckCircle2 size={44} style={{ color: "#16a34a" }} />
          </div>
          <div>
            <h2 className="text-2xl font-black" style={{ color: "var(--foreground)" }}>
              Payment Complete!
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              Transaction #{lastTxnId}
            </p>
          </div>
          <div className="rounded-2xl p-5 space-y-2" style={{ background: "var(--muted)" }}>
            {totalDisc > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--muted-foreground)" }}>Subtotal</span>
                  <span style={{ color: "var(--foreground)" }}>{formatRupiah(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "#16a34a" }}>Discount</span>
                  <span style={{ color: "#16a34a" }}>− {formatRupiah(totalDisc)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center border-t pt-2"
              style={{ borderColor: "var(--border)" }}>
              <span className="text-xs uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted-foreground)" }}>Total Paid</span>
              <span className="text-3xl font-black" style={{ color: "#16a34a" }}>
                {formatRupiah(finalTotal)}
              </span>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
              via {selectedMethod?.name}
              {selectedMethod?.provider ? ` · ${selectedMethod.provider}` : ""}
            </p>
          </div>

          <div className="rounded-xl border divide-y text-left" style={cs}>
            {cart.map((item) => (
              <div key={item.eventItemId}
                className="flex justify-between items-center px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                    {item.productName}
                    {item.variantCode && (
                      <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
                        {item.variantCode}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {formatRupiah(item.finalPrice)} × {item.quantity}
                    </p>
                    {item.promoApplied && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
                        <Tag size={9} className="inline mr-0.5" />
                        {item.promoApplied}
                      </span>
                    )}
                    {item.freeQty > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(124,58,237,0.1)", color: "#7c3aed" }}>
                        +{item.freeQty} free
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                  {formatRupiah(item.finalPrice * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          <button onClick={resetPOS}
            className="w-full rounded-xl py-3.5 font-bold text-sm"
            style={{ background: "var(--brand-orange)", color: "white" }}>
            New Transaction
          </button>
        </div>
      </div>
    );
  }

  // ── SCREEN: Payment ───────────────────────────────────────────────────────

  if (screen === "payment") {
    const grouped = Object.entries(
      paymentOptions.reduce<Record<string, PaymentMethod[]>>((acc, pm) => {
        acc[pm.type] = [...(acc[pm.type] ?? []), pm];
        return acc;
      }, {})
    );
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button
          onClick={() => { setScreen("pos"); setSelectedMethod(null); setReference(""); }}
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: "var(--muted-foreground)" }}>
          <ArrowLeft size={16} /> Back to cart
        </button>

        <div className="rounded-3xl p-8 text-center" style={{ background: "var(--brand-deep)" }}>
          {totalDisc > 0 && (
            <p className="text-sm mb-1" style={{ color: "rgba(255,200,92,0.8)" }}>
              You saved {formatRupiah(totalDisc)} 🎉
            </p>
          )}
          <p className="text-xs uppercase tracking-widest font-semibold mb-2"
            style={{ color: "rgba(255,200,92,0.8)" }}>Total to Pay</p>
          <p className="text-5xl font-black text-white">{formatRupiah(finalTotal)}</p>
          {totalDisc > 0 && (
            <p className="text-sm mt-2 line-through" style={{ color: "rgba(255,255,255,0.4)" }}>
              {formatRupiah(subtotal)}
            </p>
          )}
        </div>

        <div className="rounded-2xl border overflow-hidden" style={cs}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-bold" style={{ color: "var(--foreground)" }}>
              Select Payment Method
            </h2>
          </div>
          <div className="p-4 space-y-4">
            {grouped.length === 0 ? (
              <p className="text-center text-sm py-4" style={{ color: "var(--muted-foreground)" }}>
                No payment methods configured.{" "}
                <a href="/payment-methods" style={{ color: "var(--brand-orange)" }}>Set them up →</a>
              </p>
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
                        <button key={pm.id} type="button"
                          onClick={() => { setSelectedMethod(pm); setReference(""); }}
                          className="flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all"
                          style={{
                            borderColor: isSelected ? meta.color : "var(--border)",
                            background:  isSelected ? meta.bg    : "var(--card)",
                            boxShadow:   isSelected ? `0 0 0 2px ${meta.color}33` : "none",
                          }}>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                              background: isSelected ? meta.bg    : "var(--muted)",
                              color:      isSelected ? meta.color : "var(--muted-foreground)",
                              border:     isSelected ? `1.5px solid ${meta.border}` : "1.5px solid transparent",
                            }}>
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
                            <CheckCircle2 size={16} className="ml-auto flex-shrink-0"
                              style={{ color: meta.color }} />
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

        {needsRef && (
          <div className="rounded-2xl border p-5 space-y-2"
            style={{
              ...cs,
              borderColor: TYPE_META[selectedMethod!.type]?.border ?? "var(--border)",
              background:  TYPE_META[selectedMethod!.type]?.bg     ?? "var(--card)",
            }}>
            <label className="block text-sm font-semibold"
              style={{ color: TYPE_META[selectedMethod!.type]?.color ?? "var(--foreground)" }}>
              Reference / Approval Code
            </label>
            <input value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Scan QR or enter EDC code…" autoFocus
              className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none font-mono"
              style={{
                borderColor: TYPE_META[selectedMethod!.type]?.border ?? "var(--border)",
                background: "white", color: "var(--foreground)",
              }} />
          </div>
        )}

        <button onClick={handleConfirmPayment}
          disabled={!selectedMethod || isProcessing}
          className="w-full rounded-2xl py-4 text-base font-black transition-all disabled:opacity-40"
          style={{ background: "var(--brand-orange)", color: "white" }}>
          {isProcessing
            ? "Processing…"
            : selectedMethod
              ? `Confirm · ${formatRupiah(finalTotal)}`
              : "Select a payment method"
          }
        </button>
      </div>
    );
  }

  // ── SCREEN: Main POS ──────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {toast && (
        <div className="fixed top-5 right-5 z-[100] px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{
            background: toast.type === "ok" ? "var(--brand-deep)" : "#dc2626",
            color:      "white",
          }}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            Point of Sale
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
              📍 {activeEvent?.name}
            </span>
            {activePromoCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ background: "rgba(255,101,63,0.1)", color: "var(--brand-orange)" }}>
                <Tag size={10} className="inline mr-1" />
                {activePromoCount} promo(s) active
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setScreen("select-event")}
          className="text-xs px-3 py-1.5 rounded-lg font-medium border"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          Change Event
        </button>
      </div>

      {/* Scanner / search bar */}
      <div className="relative" ref={suggestRef}>
        <form onSubmit={handleScanSubmit}>
          <div className="relative">
            <ScanLine size={18} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--brand-orange)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Scan barcode or search by name, variant, color…"
              className="w-full rounded-2xl border-2 pl-12 pr-4 py-4 text-sm font-medium focus:outline-none transition-all"
              style={{
                borderColor: "var(--brand-orange)",
                background:  "var(--card)",
                color:       "var(--foreground)",
                boxShadow:   "0 0 0 4px rgba(255,101,63,0.08)",
              }}
              autoFocus
            />
          </div>
        </form>

        {showSuggestions && (
          <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl border shadow-xl z-50 overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            {suggestions.map((p, i) => (
              <button key={p.id} type="button" onClick={() => addToCart(p)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/5"
                style={{ borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
                  style={{ background: "var(--muted)", color: "var(--brand-deep)" }}>
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
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Stock: {p.stock}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-bold flex-shrink-0" style={{ color: "var(--brand-orange)" }}>
                  {formatRupiah(p.netPrice)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="rounded-2xl border overflow-hidden" style={cs}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} style={{ color: "var(--brand-orange)" }} />
            <span className="font-bold text-sm" style={{ color: "var(--foreground)" }}>Cart</span>
            {cartCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: "var(--brand-orange)", color: "white" }}>
                {cartCount}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={() => setCart([])}
              className="text-xs px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
              Clear all
            </button>
          )}
        </div>

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
              <div key={item.eventItemId} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
                  style={{ background: "var(--muted)", color: "var(--brand-deep)" }}>
                  {item.productName.slice(0, 2).toUpperCase()}
                </div>
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
                    {item.promoApplied && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
                        <Tag size={9} className="inline mr-0.5" />
                        {item.promoApplied}
                      </span>
                    )}
                    {item.freeQty > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: "rgba(124,58,237,0.1)", color: "#7c3aed" }}>
                        +{item.freeQty} free
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.discountAmt > 0 ? (
                      <>
                        <span className="text-xs line-through" style={{ color: "var(--muted-foreground)" }}>
                          {formatRupiah(item.unitPrice)}
                        </span>
                        <span className="text-xs font-bold" style={{ color: "#16a34a" }}>
                          {formatRupiah(item.finalPrice)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {formatRupiah(item.unitPrice)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => updateQty(item.eventItemId, item.quantity - 1)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "var(--muted)" }}>
                    {item.quantity === 1
                      ? <Trash2 size={12} style={{ color: "#dc2626" }} />
                      : <Minus  size={12} style={{ color: "var(--muted-foreground)" }} />
                    }
                  </button>
                  <span className="w-8 text-center text-sm font-bold" style={{ color: "var(--foreground)" }}>
                    {item.quantity}
                  </span>
                  <button onClick={() => updateQty(item.eventItemId, item.quantity + 1)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "var(--muted)" }}>
                    <Plus size={12} style={{ color: "var(--muted-foreground)" }} />
                  </button>
                </div>

                <p className="w-24 text-right text-sm font-bold flex-shrink-0"
                  style={{ color: "var(--brand-orange)" }}>
                  {formatRupiah(item.finalPrice * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <div className="px-5 py-4 border-t space-y-2"
            style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--muted-foreground)" }}>Subtotal</span>
              <span style={{ color: "var(--foreground)" }}>{formatRupiah(subtotal)}</span>
            </div>
            {totalDisc > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: "#16a34a" }}>Discount</span>
                <span style={{ color: "#16a34a" }}>− {formatRupiah(totalDisc)}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t pt-2"
              style={{ borderColor: "var(--border)" }}>
              <span className="font-bold" style={{ color: "var(--foreground)" }}>Total</span>
              <span className="text-2xl font-black" style={{ color: "var(--brand-orange)" }}>
                {formatRupiah(finalTotal)}
              </span>
            </div>
            <button onClick={() => setScreen("payment")}
              className="w-full rounded-xl py-3.5 font-bold text-sm"
              style={{ background: "var(--brand-orange)", color: "white" }}>
              Checkout → Select Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}