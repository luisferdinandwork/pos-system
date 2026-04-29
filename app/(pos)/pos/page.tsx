// app/(pos)/pos/page.tsx
"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ScanLine, Plus, Minus, Trash2,
  ArrowLeft, CheckCircle2, Banknote, CreditCard,
  QrCode, Wallet, Tag, X, ChevronRight,
  Zap, LogOut, Package,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type EventRow   = { id: number; name: string; status: string; location: string | null };
type EventItem  = { id: number; stock: number; retailPrice: string; netPrice: string; itemId: string; name: string; color: string | null; variantCode: string | null; unit: string | null };
type CartItem   = { eventItemId: number; itemId: string; productName: string; variantCode: string | null; color: string | null; quantity: number; unitPrice: number; discountAmt: number; finalPrice: number; promoApplied: string | null; freeQty: number };
type PayMethod  = { id: number; name: string; type: string; provider: string | null };
type PromoRes   = { finalUnitPrice: number; discountAmt: number; promoName: string | null; freeQty: number };
type Screen     = "event-select" | "sell" | "payment" | "success";

// ── Payment icon map ──────────────────────────────────────────────────────────
const PAY_ICON: Record<string, React.ReactNode> = {
  cash:    <Banknote size={16} />,
  qris:    <QrCode size={16} />,
  debit:   <CreditCard size={16} />,
  credit:  <CreditCard size={16} />,
  ewallet: <Wallet size={16} />,
};
const PAY_COLOR: Record<string, string> = {
  cash: "#16a34a", qris: "#7c3aed", debit: "#0369a1", credit: "#b45309", ewallet: "#be185d",
};

function mono(n: number | string) { return formatRupiah(n); }

// ── Inner component (uses useSearchParams, must be wrapped in Suspense) ───────
function POSInner() {
  const searchParams = useSearchParams();
  const preselectedEventId = searchParams.get("event") ? Number(searchParams.get("event")) : null;

  const [events,      setEvents]      = useState<EventRow[]>([]);
  const [event,       setEvent]       = useState<EventRow | null>(null);
  const [items,       setItems]       = useState<EventItem[]>([]);
  const [promoCount,  setPromoCount]  = useState(0);
  const [cart,        setCart]        = useState<CartItem[]>([]);
  const [screen,      setScreen]      = useState<Screen>("event-select");
  const [query,       setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState<EventItem[]>([]);
  const [showSug,     setShowSug]     = useState(false);
  const [payMethods,  setPayMethods]  = useState<PayMethod[]>([]);
  const [payMethod,   setPayMethod]   = useState<PayMethod | null>(null);
  const [reference,   setReference]   = useState("");
  const [lastTxn,     setLastTxn]     = useState<number | null>(null);
  const [processing,  setProcessing]  = useState(false);
  const [toast,       setToast]       = useState<string | null>(null);
  const [toastErr,    setToastErr]    = useState(false);

  const scanRef  = useRef<HTMLInputElement>(null);
  const sugRef   = useRef<HTMLDivElement>(null);

  // ── Load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/events").then(r => r.json()).then((evs: EventRow[]) => {
      setEvents(evs);
      // If a preselected event is given via ?event=, auto-enter it
      if (preselectedEventId) {
        const target = evs.find((e) => e.id === preselectedEventId);
        if (target) selectEvent(target);
      }
    });
    fetch("/api/payment-methods?active=true").then(r => r.json()).then(setPayMethods);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectEvent(ev: EventRow) {
    setEvent(ev);
    const [itemData, promoData] = await Promise.all([
      fetch(`/api/events/${ev.id}/products`).then(r => r.json()),
      fetch(`/api/events/${ev.id}/promos`).then(r => r.json()),
    ]);
    setItems(itemData);
    setPromoCount((promoData as { isActive: boolean }[]).filter(p => p.isActive).length);
    setScreen("sell");
    setTimeout(() => scanRef.current?.focus(), 80);
  }

  // ── Search ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); setShowSug(false); return; }
    const q = query.toLowerCase();
    const m = items.filter(p =>
      p.itemId.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) ||
      (p.variantCode ?? "").toLowerCase().includes(q) || (p.color ?? "").toLowerCase().includes(q)
    ).slice(0, 10);
    setSuggestions(m); setShowSug(m.length > 0);
  }, [query, items]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (sugRef.current && !sugRef.current.contains(e.target as Node)) setShowSug(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // ── Toast ──────────────────────────────────────────────────────────────
  function flash(msg: string, err = false) {
    setToast(msg); setToastErr(err);
    setTimeout(() => setToast(null), 2200);
  }

  // ── Promo ──────────────────────────────────────────────────────────────
  async function getPromo(item: EventItem, qty: number, total: number): Promise<PromoRes> {
    try {
      const r = await fetch("/api/promos/calculate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event!.id, eventItemId: item.id, quantity: qty, netPrice: parseFloat(item.netPrice), eventTotal: total }),
      });
      if (!r.ok) throw new Error();
      return r.json();
    } catch {
      return { finalUnitPrice: parseFloat(item.netPrice), discountAmt: 0, promoName: null, freeQty: 0 };
    }
  }

  // ── Cart ───────────────────────────────────────────────────────────────
  async function addItem(item: EventItem) {
    const curTotal = cart.reduce((s, i) => s + i.finalPrice * i.quantity, 0);
    const curQty   = cart.find(c => c.eventItemId === item.id)?.quantity ?? 0;
    const newQty   = curQty + 1;
    const promo    = await getPromo(item, newQty, curTotal);
    setCart(prev => {
      const row: CartItem = {
        eventItemId: item.id, itemId: item.itemId, productName: item.name,
        variantCode: item.variantCode, color: item.color,
        quantity: newQty, unitPrice: parseFloat(item.netPrice),
        discountAmt: promo.discountAmt, finalPrice: promo.finalUnitPrice,
        promoApplied: promo.promoName, freeQty: promo.freeQty,
      };
      const exists = prev.find(c => c.eventItemId === item.id);
      if (exists) return prev.map(c => c.eventItemId === item.id ? row : c);
      return [...prev, row];
    });
    setQuery(""); setShowSug(false);
    scanRef.current?.focus();
  }

  async function changeQty(eventItemId: number, qty: number) {
    if (qty < 1) { setCart(p => p.filter(i => i.eventItemId !== eventItemId)); return; }
    const item = items.find(p => p.id === eventItemId);
    if (!item) return;
    const curTotal = cart.filter(i => i.eventItemId !== eventItemId).reduce((s, i) => s + i.finalPrice * i.quantity, 0);
    const promo    = await getPromo(item, qty, curTotal);
    setCart(prev => prev.map(i => i.eventItemId === eventItemId
      ? { ...i, quantity: qty, discountAmt: promo.discountAmt, finalPrice: promo.finalUnitPrice, promoApplied: promo.promoName, freeQty: promo.freeQty }
      : i
    ));
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim(); if (!q) return;
    const exact = items.find(p => p.itemId.toLowerCase() === q.toLowerCase());
    if (exact) { addItem(exact); return; }
    flash("Not found in this event", true); setQuery("");
  }

  // ── Totals ─────────────────────────────────────────────────────────────
  const subtotal  = cart.reduce((s, i) => s + i.unitPrice   * i.quantity, 0);
  const discount  = cart.reduce((s, i) => s + i.discountAmt * i.quantity, 0);
  const total     = cart.reduce((s, i) => s + i.finalPrice  * i.quantity, 0);
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Checkout — posts to per-event transaction route ────────────────────
  async function confirmPayment() {
    if (!payMethod || !event) return;
    setProcessing(true);
    const label = `${payMethod.name}${payMethod.provider ? ` (${payMethod.provider})` : ""}`;
    const res = await fetch(`/api/events/${event.id}/transactions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalAmount: subtotal, discount, finalAmount: total,
        paymentMethod: label, paymentReference: reference || null,
        items: cart.map(i => ({
          eventItemId: i.eventItemId, itemId: i.itemId, productName: i.productName,
          quantity: i.quantity, unitPrice: i.unitPrice, discountAmt: i.discountAmt,
          finalPrice: i.finalPrice, subtotal: i.finalPrice * i.quantity,
          promoApplied: i.promoApplied, freeQty: i.freeQty,
        })),
      }),
    });
    const txn = await res.json();
    setLastTxn(txn.id); setProcessing(false); setScreen("success");
  }

  function nextTransaction() {
    setCart([]); setPayMethod(null); setReference(""); setScreen("sell");
    setTimeout(() => scanRef.current?.focus(), 80);
  }

  function exitPOS() {
    setCart([]); setEvent(null); setScreen("event-select");
    // If we came from an event page, go back there
    if (preselectedEventId) {
      window.location.href = `/events/${preselectedEventId}`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Event select
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === "event-select") {
    const active = events.filter(e => e.status === "active");
    const draft  = events.filter(e => e.status === "draft");
    return (
      <div className="h-screen w-screen flex items-center justify-center"
        style={{ background: "#f8f8f6" }}>
        <div className="w-full max-w-md px-4">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{ background: "var(--brand-orange)" }}>
              <Zap size={28} color="white" strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: "#111" }}>Point of Sale</h1>
            <p className="text-sm mt-1" style={{ color: "#9ca3af" }}>Select an event to start</p>
          </div>

          {active.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-[11px] font-bold uppercase tracking-widest px-1" style={{ color: "#9ca3af" }}>Live</p>
              {active.map(ev => (
                <button key={ev.id} onClick={() => selectEvent(ev)}
                  className="w-full rounded-2xl p-5 text-left transition-all hover:shadow-md"
                  style={{ background: "white", border: "1.5px solid #e5e7eb" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#16a34a" }} />
                        <p className="font-bold text-sm" style={{ color: "#111" }}>{ev.name}</p>
                      </div>
                      {ev.location && <p className="text-xs pl-4" style={{ color: "#9ca3af" }}>{ev.location}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                      style={{ background: "var(--brand-orange)", color: "white" }}>
                      Open <ChevronRight size={12} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {draft.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest px-1" style={{ color: "#9ca3af" }}>Draft</p>
              {draft.map(ev => (
                <button key={ev.id} onClick={() => selectEvent(ev)}
                  className="w-full rounded-2xl p-4 text-left transition-all opacity-60 hover:opacity-80"
                  style={{ background: "white", border: "1.5px solid #e5e7eb" }}>
                  <p className="font-semibold text-sm" style={{ color: "#111" }}>{ev.name}</p>
                  {ev.location && <p className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{ev.location}</p>}
                </button>
              ))}
            </div>
          )}

          {events.length === 0 && (
            <p className="text-center text-sm" style={{ color: "#9ca3af" }}>
              No events found. <a href="/events" className="underline" style={{ color: "var(--brand-orange)" }}>Create one →</a>
            </p>
          )}

          <div className="mt-8 text-center">
            <a href="/" className="text-xs" style={{ color: "#d1d5db" }}>← Back to dashboard</a>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Success / receipt
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === "success") {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "#f8f8f6" }}>
        <div className="w-full max-w-sm">
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fafaf8" }}>
            <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: "2px dashed #d1d5db" }}>
              <CheckCircle2 size={36} className="mx-auto mb-2" style={{ color: "#16a34a" }} />
              <p className="font-black text-lg" style={{ color: "#111" }}>PAYMENT CONFIRMED</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: "#6b7280" }}>
                TXN #{String(lastTxn).padStart(6, "0")}
              </p>
            </div>

            <div className="px-6 py-4 space-y-2" style={{ borderBottom: "2px dashed #d1d5db" }}>
              {cart.map(item => (
                <div key={item.eventItemId} className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-xs font-bold leading-tight" style={{ color: "#111" }}>
                      {item.productName}
                      {item.variantCode && <span className="ml-1 font-normal" style={{ color: "#6b7280" }}>({item.variantCode})</span>}
                    </p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: "#9ca3af" }}>
                      {mono(item.finalPrice)} × {item.quantity}
                      {item.promoApplied && <span className="ml-1.5 text-green-600">[{item.promoApplied}]</span>}
                    </p>
                  </div>
                  <p className="text-xs font-bold font-mono flex-shrink-0" style={{ color: "#111" }}>
                    {mono(item.finalPrice * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 space-y-1.5" style={{ borderBottom: "2px dashed #d1d5db" }}>
              {discount > 0 && (
                <>
                  <div className="flex justify-between text-xs font-mono">
                    <span style={{ color: "#6b7280" }}>SUBTOTAL</span>
                    <span style={{ color: "#6b7280" }}>{mono(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span style={{ color: "#16a34a" }}>DISCOUNT</span>
                    <span style={{ color: "#16a34a" }}>- {mono(discount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold font-mono" style={{ color: "#111" }}>TOTAL</span>
                <span className="text-2xl font-black font-mono" style={{ color: "#111" }}>{mono(total)}</span>
              </div>
              <p className="text-xs font-mono" style={{ color: "#9ca3af" }}>
                via {payMethod?.name}{payMethod?.provider ? ` · ${payMethod.provider}` : ""}
              </p>
            </div>

            <div className="px-6 py-4 text-center">
              <p className="text-[10px] font-mono" style={{ color: "#d1d5db" }}>
                {event?.name} · {new Date().toLocaleString("id-ID")}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={nextTransaction}
              className="flex-1 rounded-xl py-3.5 text-sm font-black"
              style={{ background: "var(--brand-orange)", color: "white" }}>
              Next Sale
            </button>
            <button onClick={exitPOS}
              className="px-4 rounded-xl text-sm font-semibold border"
              style={{ borderColor: "#e5e7eb", color: "#6b7280", background: "white" }}>
              Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Payment
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === "payment") {
    const grouped = Object.entries(
      payMethods.reduce<Record<string, PayMethod[]>>((acc, pm) => {
        acc[pm.type] = [...(acc[pm.type] ?? []), pm]; return acc;
      }, {})
    );
    const needsRef = payMethod && payMethod.type !== "cash";
    return (
      <div className="h-screen w-screen flex" style={{ background: "#f8f8f6" }}>
        <div className="flex-1 flex flex-col items-center justify-center px-10"
          style={{ borderRight: "1px solid #e5e7eb" }}>
          <button onClick={() => { setScreen("sell"); setPayMethod(null); setReference(""); }}
            className="flex items-center gap-1.5 text-xs mb-12 self-start"
            style={{ color: "#9ca3af" }}>
            <ArrowLeft size={13} /> Back
          </button>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#9ca3af" }}>Total Due</p>
          <p className="text-6xl font-black tracking-tight" style={{ color: "#111" }}>{mono(total)}</p>
          {discount > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="line-through text-sm" style={{ color: "#d1d5db" }}>{mono(subtotal)}</span>
              <span className="text-sm font-bold" style={{ color: "#16a34a" }}>− {mono(discount)} saved</span>
            </div>
          )}
          <div className="mt-8 w-full max-w-xs rounded-xl p-4 space-y-1.5"
            style={{ background: "white", border: "1px solid #e5e7eb" }}>
            {cart.map(item => (
              <div key={item.eventItemId} className="flex justify-between text-xs font-mono">
                <span style={{ color: "#6b7280" }}>
                  {item.productName.slice(0, 20)}{item.variantCode ? ` (${item.variantCode})` : ""} ×{item.quantity}
                </span>
                <span style={{ color: "#111" }}>{mono(item.finalPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-96 flex flex-col px-6 py-6 overflow-y-auto"
          style={{ background: "white", borderLeft: "1px solid #e5e7eb" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "#9ca3af" }}>Payment Method</p>
          <div className="space-y-4 flex-1">
            {grouped.map(([type, methods]) => (
              <div key={type}>
                <p className="text-[11px] uppercase tracking-widest mb-2 font-semibold" style={{ color: "#d1d5db" }}>
                  {type === "ewallet" ? "E-Wallet" : type}
                </p>
                <div className="space-y-1.5">
                  {methods.map(pm => {
                    const sel   = payMethod?.id === pm.id;
                    const color = PAY_COLOR[pm.type] ?? "#374151";
                    return (
                      <button key={pm.id}
                        onClick={() => { setPayMethod(pm); setReference(""); }}
                        className="w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all"
                        style={{
                          background: sel ? `${color}10` : "#f9fafb",
                          border:     sel ? `1.5px solid ${color}50` : "1.5px solid #e5e7eb",
                        }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: sel ? `${color}15` : "#f3f4f6", color: sel ? color : "#9ca3af" }}>
                          {PAY_ICON[pm.type] ?? <CreditCard size={16} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: sel ? color : "#111" }}>{pm.name}</p>
                          {pm.provider && <p className="text-xs" style={{ color: "#9ca3af" }}>{pm.provider}</p>}
                        </div>
                        {sel && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {needsRef && (
            <div className="mt-4">
              <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#9ca3af" }}>
                Reference / Code
              </label>
              <input value={reference} onChange={e => setReference(e.target.value)}
                placeholder="EDC approval / QR ref…" autoFocus
                className="w-full rounded-xl px-4 py-3 text-sm font-mono focus:outline-none"
                style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", color: "#111" }} />
            </div>
          )}

          <button onClick={confirmPayment}
            disabled={!payMethod || processing}
            className="mt-4 w-full rounded-xl py-4 text-base font-black transition-all disabled:opacity-30"
            style={{ background: payMethod ? "var(--brand-orange)" : "#f3f4f6", color: payMethod ? "white" : "#9ca3af" }}>
            {processing ? "Processing…" : payMethod ? `Confirm ${mono(total)}` : "Choose a method"}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Main sell
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: "#f8f8f6" }}>
      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl pointer-events-none"
          style={{ background: toastErr ? "#ef4444" : "#16a34a", color: "white" }}>
          {toast}
        </div>
      )}

      {/* Topbar */}
      <div className="flex items-center h-12 px-5 gap-3 flex-shrink-0"
        style={{ background: "white", borderBottom: "1px solid #e5e7eb" }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#16a34a" }} />
        <p className="text-sm font-bold truncate" style={{ color: "#111" }}>{event?.name}</p>
        {event?.location && (
          <p className="text-xs hidden md:block truncate" style={{ color: "#9ca3af" }}>· {event.location}</p>
        )}
        {promoCount > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
            style={{ background: "rgba(255,101,63,0.1)", color: "var(--brand-orange)" }}>
            <Tag size={9} className="inline mr-0.5" />{promoCount} promo
          </span>
        )}
        <div className="flex-1" />
        {itemCount > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-full font-bold flex-shrink-0"
            style={{ background: "#f3f4f6", color: "#374151" }}>
            {itemCount} item{itemCount > 1 ? "s" : ""} · {mono(total)}
          </span>
        )}
        <button onClick={exitPOS}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all"
          style={{ color: "#9ca3af", background: "white", borderColor: "#e5e7eb" }}>
          <LogOut size={12} /> Exit
        </button>
      </div>

      {/* Two-pane body */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT — Scanner */}
        <div className="flex flex-col flex-1 overflow-hidden" style={{ borderRight: "1px solid #e5e7eb" }}>
          <div className="px-5 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid #e5e7eb", background: "white" }}>
            <div className="relative" ref={sugRef}>
              <form onSubmit={handleScan}>
                <div className="relative flex items-center">
                  <ScanLine size={16} className="absolute left-4 pointer-events-none"
                    style={{ color: "var(--brand-orange)" }} />
                  <input
                    ref={scanRef} value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => { if (suggestions.length) setShowSug(true); }}
                    placeholder="Scan barcode or type to search…"
                    className="w-full rounded-xl pl-11 pr-10 py-3 text-sm focus:outline-none transition-all"
                    style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", color: "#111" }}
                    autoFocus
                  />
                  {query && (
                    <button type="button"
                      onClick={() => { setQuery(""); setShowSug(false); scanRef.current?.focus(); }}
                      className="absolute right-3.5 p-0.5 rounded" style={{ color: "#9ca3af" }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!query ? (
              <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "#d1d5db" }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#f3f4f6" }}>
                  <ScanLine size={28} style={{ color: "#d1d5db" }} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold" style={{ color: "#9ca3af" }}>Ready to scan</p>
                  <p className="text-xs mt-1" style={{ color: "#d1d5db" }}>Scan a barcode or type a product name</p>
                </div>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "#d1d5db" }}>
                <Package size={32} style={{ color: "#d1d5db" }} />
                <p className="text-sm" style={{ color: "#9ca3af" }}>No products found for &ldquo;{query}&rdquo;</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <p className="text-xs font-semibold px-1 mb-3" style={{ color: "#9ca3af" }}>
                  {suggestions.length} result{suggestions.length > 1 ? "s" : ""}
                </p>
                {suggestions.map(item => {
                  const inCart = cart.find(c => c.eventItemId === item.id);
                  return (
                    <button key={item.id} onClick={() => addItem(item)}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all"
                      style={{
                        background: inCart ? "rgba(255,101,63,0.06)" : "white",
                        border:     inCart ? "1.5px solid rgba(255,101,63,0.25)" : "1.5px solid #e5e7eb",
                      }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
                        style={{ background: inCart ? "rgba(255,101,63,0.12)" : "#f3f4f6", color: inCart ? "var(--brand-orange)" : "#9ca3af" }}>
                        {item.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: "#111" }}>
                          {item.name}
                          {item.variantCode && (
                            <span className="ml-1.5 text-xs font-medium px-1.5 py-0.5 rounded"
                              style={{ background: "#f3f4f6", color: "#6b7280" }}>
                              {item.variantCode}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs font-mono" style={{ color: "#9ca3af" }}>{item.itemId}</span>
                          {item.color && <span className="text-xs" style={{ color: "#9ca3af" }}>{item.color}</span>}
                          <span className="text-xs font-semibold"
                            style={{ color: item.stock <= 0 ? "#f59e0b" : item.stock <= 5 ? "#f59e0b" : "#16a34a" }}>
                            {item.stock <= 0 ? `Stock: ${item.stock}` : `${item.stock} left`}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-base font-black" style={{ color: "var(--brand-orange)" }}>
                          {mono(item.netPrice)}
                        </p>
                        {inCart && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "var(--brand-orange)", color: "white" }}>
                            ×{inCart.quantity} in cart
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Cart/Receipt */}
        <div className="w-72 xl:w-80 flex flex-col flex-shrink-0" style={{ background: "white" }}>
          <div className="flex items-center justify-between px-4 py-3.5 flex-shrink-0"
            style={{ borderBottom: "1px solid #f3f4f6" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#9ca3af" }}>
              Receipt{itemCount > 0 && <span style={{ color: "var(--brand-orange)" }}> · {itemCount}</span>}
            </p>
            {cart.length > 0 && (
              <button onClick={() => setCart([])}
                className="text-[11px] px-2 py-1 rounded-lg"
                style={{ background: "#fef2f2", color: "#ef4444" }}>
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2" style={{ opacity: 0.35 }}>
                <Package size={28} style={{ color: "#9ca3af" }} />
                <p className="text-xs" style={{ color: "#9ca3af" }}>Cart is empty</p>
              </div>
            ) : (
              <div>
                {cart.map((item, idx) => (
                  <div key={item.eventItemId} className="flex items-start gap-2.5 px-4 py-3.5"
                    style={{ borderBottom: "1px solid #f9fafb" }}>
                    <span className="text-[10px] font-mono mt-0.5 flex-shrink-0 w-4 text-right" style={{ color: "#d1d5db" }}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold leading-snug" style={{ color: "#111" }}>
                        {item.productName}
                        {item.variantCode && <span className="ml-1 font-normal" style={{ color: "#6b7280" }}>({item.variantCode})</span>}
                      </p>
                      {item.promoApplied && (
                        <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#16a34a" }}>{item.promoApplied}</p>
                      )}
                      {item.discountAmt > 0 ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] line-through" style={{ color: "#d1d5db" }}>{mono(item.unitPrice)}</span>
                          <span className="text-[10px] font-bold" style={{ color: "#16a34a" }}>{mono(item.finalPrice)}</span>
                        </div>
                      ) : (
                        <p className="text-[10px] mt-0.5" style={{ color: "#9ca3af" }}>{mono(item.unitPrice)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => changeQty(item.eventItemId, item.quantity - 1)}
                        className="w-5 h-5 rounded-md flex items-center justify-center"
                        style={{ background: "#f3f4f6", color: "#9ca3af" }}>
                        {item.quantity === 1 ? <Trash2 size={9} /> : <Minus size={9} />}
                      </button>
                      <span className="w-6 text-center text-xs font-bold" style={{ color: "#111" }}>{item.quantity}</span>
                      <button onClick={() => changeQty(item.eventItemId, item.quantity + 1)}
                        className="w-5 h-5 rounded-md flex items-center justify-center"
                        style={{ background: "#f3f4f6", color: "#9ca3af" }}>
                        <Plus size={9} />
                      </button>
                    </div>
                    <p className="text-xs font-bold flex-shrink-0 w-20 text-right" style={{ color: "#374151" }}>
                      {mono(item.finalPrice * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 px-4 py-4" style={{ borderTop: "1px solid #f3f4f6", background: "white" }}>
            {cart.length > 0 ? (
              <>
                <div className="space-y-1.5 mb-4">
                  {discount > 0 && (
                    <>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: "#9ca3af" }}>Subtotal</span>
                        <span style={{ color: "#374151" }}>{mono(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: "#16a34a" }}>Discount</span>
                        <span style={{ color: "#16a34a" }}>−{mono(discount)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between items-baseline pt-2" style={{ borderTop: "1px solid #f3f4f6" }}>
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#9ca3af" }}>Total</span>
                    <span className="text-2xl font-black" style={{ color: "#111" }}>{mono(total)}</span>
                  </div>
                </div>
                <button onClick={() => setScreen("payment")}
                  className="w-full rounded-xl py-4 text-sm font-black transition-all"
                  style={{ background: "var(--brand-orange)", color: "white" }}>
                  Charge {mono(total)}
                </button>
              </>
            ) : (
              <p className="text-center text-xs py-1" style={{ color: "#d1d5db" }}>Scan or search to add items</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page export — wraps inner in Suspense for useSearchParams ─────────────────
export default function POSPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "#f8f8f6" }}>
        <div className="text-sm" style={{ color: "#9ca3af" }}>Loading POS…</div>
      </div>
    }>
      <POSInner />
    </Suspense>
  );
}