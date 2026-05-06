// app/(pos)/pos/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart2,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  CreditCard,
  Database,
  DollarSign,
  LogOut,
  MapPin,
  Minus,
  Package,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  TrendingUp,
  Wallet,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";

type EventRow = {
  id: number;
  name: string;
  status: string;
  location: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type EventItem = {
  id: number;
  eventId: number;
  stock: number;
  originalStock?: number;
  retailPrice: string;
  netPrice: string;
  itemId: string;
  name: string;
  color: string | null;
  variantCode: string | null;
  unit: string | null;
};

type CartItem = {
  eventItemId: number;
  itemId: string;
  productName: string;
  variantCode: string | null;
  color: string | null;
  quantity: number;
  unitPrice: number;
  discountAmt: number;
  finalPrice: number;
  promoApplied: string | null;
  freeQty: number;
};

type PayMethod = {
  id: number;
  name: string;
  type: string;
  provider: string | null;
};

type PromoRes = {
  finalUnitPrice: number;
  discountAmt: number;
  promoName: string | null;
  freeQty: number;
};

type LocalBundle = {
  event: EventRow;
  items: EventItem[];
  promos: unknown[];
  paymentMethods: PayMethod[];
};

type Screen = "event-select" | "sell" | "success";

type POSActionDialog =
  | null
  | "turn-off-local"
  | "force-turn-off-local"
  | "delete-event"
  | "force-delete-event";

type DailyStats = {
  txnCount: number;
  revenue: number;
  discount: number;
  itemsSold: number;
  todayTxnCount: number;
  todayRevenue: number;
  todayDiscount: number;
  todayItemsSold: number;
  totalUnits: number;
  totalItems: number;
};

const PAY_ICON: Record<string, React.ReactNode> = {
  cash: <Banknote size={16} />,
  qris: <QrCode size={16} />,
  debit: <CreditCard size={16} />,
  credit: <CreditCard size={16} />,
  ewallet: <Wallet size={16} />,
};

const PAY_COLOR: Record<string, string> = {
  cash: "#16a34a",
  qris: "#7c3aed",
  debit: "#0369a1",
  credit: "#b45309",
  ewallet: "#be185d",
};

const STATUS_STYLE: Record<
  string,
  { dot: string; label: string; border: string; bg: string }
> = {
  active: {
    dot: "#16a34a",
    label: "Live",
    border: "rgba(22,163,74,0.30)",
    bg: "rgba(22,163,74,0.06)",
  },
  draft: {
    dot: "#f59e0b",
    label: "Draft",
    border: "rgba(245,158,11,0.25)",
    bg: "rgba(245,158,11,0.05)",
  },
  closed: {
    dot: "#dc2626",
    label: "Closed",
    border: "rgba(220,38,38,0.20)",
    bg: "rgba(220,38,38,0.04)",
  },
};

const KEYFRAMES = `
@keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
@keyframes pulseDot { 0%,100% { opacity:1 } 50% { opacity:.4 } }
.anim-fade-up { animation: fadeUp .35s ease both }
`;

function money(value: number | string) {
  return formatRupiah(value);
}

function makeClientTxnId(eventId: number) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `LOCAL-EV${eventId}-${random}`;
}

function stockTone(stock: number) {
  if (stock < 0) return "#ef4444";
  if (stock <= 5) return "#f59e0b";
  return "#16a34a";
}

function POSInner() {
  const searchParams = useSearchParams();
  const queryEventId = searchParams.get("event")
    ? Number(searchParams.get("event"))
    : null;
  const forceSelect = searchParams.get("select") === "1";

  const [events, setEvents] = useState<EventRow[]>([]);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<EventItem[]>([]);
  const [promos, setPromos] = useState<unknown[]>([]);
  const [promoCount, setPromoCount] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [screen, setScreen] = useState<Screen>("event-select");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<EventItem[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);

  const [payMethods, setPayMethods] = useState<PayMethod[]>([]);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [reference, setReference] = useState("");

  const [lastTxn, setLastTxn] = useState<string | number | null>(null);
  const [processing, setProcessing] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [toastErr, setToastErr] = useState(false);

  const [online, setOnline] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [localReady, setLocalReady] = useState(false);

  const [preparedEvents, setPreparedEvents] = useState<
    {
      id: number;
      name: string;
      status: string;
      location: string | null;
      preparedAt: string;
      pendingSyncCount: number;
    }[]
  >([]);

  const [actionDialog, setActionDialog] = useState<POSActionDialog>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const [showReport, setShowReport] = useState(false);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart]
  );

  const discount = useMemo(
    () => cart.reduce((sum, item) => sum + item.discountAmt, 0),
    [cart]
  );

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0),
    [cart]
  );

  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const groupedPaymentMethods = useMemo(() => {
    return Object.entries(
      payMethods.reduce<Record<string, PayMethod[]>>((acc, method) => {
        acc[method.type] = [...(acc[method.type] ?? []), method];
        return acc;
      }, {})
    );
  }, [payMethods]);

  function flash(message: string, isError = false) {
    setToast(message);
    setToastErr(isError);

    setTimeout(() => {
      setToast(null);
      setToastErr(false);
    }, 2800);
  }

  async function loadPreparedEvents() {
    try {
      const data = await fetch("/api/local/prepared-events", {
        cache: "no-store",
      }).then((res) => res.json());

      setPreparedEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setPreparedEvents([]);
    }
  }

  useEffect(() => {
    setOnline(navigator.onLine);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!online || !event?.id || pendingSyncCount === 0 || syncing) return;

    const timer = setTimeout(() => syncLocalTransactions(event.id), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, event?.id, pendingSyncCount]);

  useEffect(() => {
    async function boot() {
      await loadPreparedEvents();

      if (forceSelect) {
        setScreen("event-select");
        try {
          const evs = await fetch("/api/events", { cache: "no-store" }).then(
            (res) => res.json()
          );
          setEvents(evs);
        } catch {
          // Local prepared events can still show while offline.
        }
        return;
      }

      if (queryEventId) {
        const local = await loadLocalBundle(queryEventId);
        if (local) {
          localStorage.setItem("pos:last-event-id", String(queryEventId));
          setScreen("sell");
          return;
        }

        if (navigator.onLine) {
          try {
            const evs = await fetch("/api/events", { cache: "no-store" }).then(
              (res) => res.json()
            );
            setEvents(evs);
            const target = evs.find((ev: EventRow) => ev.id === queryEventId);
            if (target) {
              await openLocalEvent(target);
              return;
            }
          } catch {
            flash("Could not prepare selected event.", true);
          }
        }

        flash("Selected event is not prepared locally.", true);
        setScreen("event-select");
        return;
      }

      const saved = localStorage.getItem("pos:last-event-id");
      if (saved && Number.isFinite(Number(saved))) {
        const local = await loadLocalBundle(Number(saved));
        if (local) {
          setScreen("sell");
          return;
        }
      }

      try {
        const state = await fetch("/api/local/pos-state", {
          cache: "no-store",
        }).then((res) => res.json());

        if (state?.event?.id) {
          const local = await loadLocalBundle(Number(state.event.id));
          if (local) {
            localStorage.setItem("pos:last-event-id", String(state.event.id));
            setScreen("sell");
            return;
          }
        }
      } catch {
        // Fall through to event selector.
      }

      try {
        const evs = await fetch("/api/events", { cache: "no-store" }).then(
          (res) => res.json()
        );
        setEvents(evs);
      } catch {
        flash("Offline. No prepared POS event found.", true);
      }

      setScreen("event-select");
    }

    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    const q = query.toLowerCase();
    const matched = items
      .filter((item) => {
        return (
          item.itemId.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.variantCode ?? "").toLowerCase().includes(q) ||
          (item.color ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 24);

    setSuggestions(matched);
  }, [query, items]);

  async function prepareEventOffline(eventId: number) {
    setPreparing(true);

    try {
      const res = await fetch(`/api/local/events/${eventId}/prepare`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to prepare event.");
      }

      localStorage.setItem("pos:last-event-id", String(eventId));
      applyBundle(data.bundle as LocalBundle);
      setLocalReady(true);
      flash("Event prepared for offline POS");
      return data.bundle as LocalBundle;
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to prepare.", true);
      return null;
    } finally {
      setPreparing(false);
    }
  }

  async function loadLocalBundle(eventId: number) {
    try {
      const res = await fetch(`/api/local/events/${eventId}/bundle`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Not prepared locally.");
      }

      applyBundle(data as LocalBundle);
      setLocalReady(true);
      await refreshPendingCount(eventId);
      setScreen("sell");
      return data as LocalBundle;
    } catch {
      setLocalReady(false);
      return null;
    }
  }

  function applyBundle(bundle: LocalBundle) {
    setEvent(bundle.event);
    setItems(bundle.items);
    setPromos(bundle.promos);
    setPayMethods(bundle.paymentMethods);
    setPromoCount(bundle.promos.length);
  }

  async function openLocalEvent(ev: EventRow) {
    localStorage.setItem("pos:last-event-id", String(ev.id));

    const local = await loadLocalBundle(ev.id);
    if (local) {
      setScreen("sell");
      return;
    }

    if (!navigator.onLine) {
      flash("Offline. Prepare this event locally first.", true);
      return;
    }

    const prepared = await prepareEventOffline(ev.id);
    if (prepared) {
      setScreen("sell");
      await refreshPendingCount(ev.id);
    }
  }

  async function refreshPendingCount(eventId: number) {
    try {
      const txns = await fetch(`/api/local/events/${eventId}/transactions`, {
        cache: "no-store",
      }).then((res) => res.json());

      setPendingSyncCount(
        Array.isArray(txns)
          ? txns.filter(
              (txn: any) =>
                txn.syncStatus === "pending" || txn.syncStatus === "failed"
            ).length
          : 0
      );
    } catch {
      setPendingSyncCount(0);
    }
  }

  async function syncLocalTransactions(eventId: number) {
    if (!navigator.onLine) {
      flash("Cannot sync while offline.", true);
      return;
    }

    setSyncing(true);

    try {
      const res = await fetch(`/api/local/events/${eventId}/sync`, {
        method: "POST",
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Sync failed.");
      }

      await refreshPendingCount(eventId);

      if (result.failed > 0) {
        const firstError = result.results?.find((row: any) => !row.ok)?.error;
        flash(
          firstError
            ? `${result.synced} synced, ${result.failed} failed: ${firstError}`
            : `${result.synced} synced, ${result.failed} failed`,
          true
        );
        return;
      }

      flash(`${result.synced} transactions synced`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Sync failed.", true);
    } finally {
      setSyncing(false);
    }
  }

  async function loadDailyStats(eventId: number) {
    setLoadingStats(true);

    try {
      const data = await fetch(`/api/local/events/${eventId}/stats`, {
        cache: "no-store",
      }).then((res) => res.json());
      setDailyStats(data);
    } catch {
      setDailyStats(null);
    } finally {
      setLoadingStats(false);
    }
  }

  async function getPromo(_item: EventItem): Promise<PromoRes> {
    return {
      finalUnitPrice: Number(_item.netPrice),
      discountAmt: 0,
      promoName: null,
      freeQty: 0,
    };
  }

  async function addItem(item: EventItem) {
    const existingQty =
      cart.find((row) => row.eventItemId === item.id)?.quantity ?? 0;
    const promo = await getPromo(item);

    const row: CartItem = {
      eventItemId: item.id,
      itemId: item.itemId,
      productName: item.name,
      variantCode: item.variantCode,
      color: item.color,
      quantity: existingQty + 1,
      unitPrice: Number(item.netPrice),
      discountAmt: promo.discountAmt,
      finalPrice: promo.finalUnitPrice,
      promoApplied: promo.promoName,
      freeQty: promo.freeQty,
    };

    setCart((prev) =>
      prev.some((cartRow) => cartRow.eventItemId === item.id)
        ? prev.map((cartRow) =>
            cartRow.eventItemId === item.id ? row : cartRow
          )
        : [...prev, row]
    );

    setQuery("");
    setSearchFocused(false);
  }

  async function changeQty(eventItemId: number, qty: number) {
    if (qty < 1) {
      setCart((prev) => prev.filter((row) => row.eventItemId !== eventItemId));
      return;
    }

    const item = items.find((row) => row.id === eventItemId);
    if (!item) return;

    const promo = await getPromo(item);

    setCart((prev) =>
      prev.map((row) =>
        row.eventItemId === eventItemId
          ? {
              ...row,
              quantity: qty,
              discountAmt: promo.discountAmt,
              finalPrice: promo.finalUnitPrice,
              promoApplied: promo.promoName,
              freeQty: promo.freeQty,
            }
          : row
      )
    );
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();

    const q = query.trim().toLowerCase();
    if (!q) return;

    const exact = items.find(
      (item) =>
        item.itemId.toLowerCase() === q ||
        item.variantCode?.toLowerCase() === q
    );

    if (exact) {
      addItem(exact);
      return;
    }

    if (suggestions.length === 1) {
      addItem(suggestions[0]);
      return;
    }

    if (suggestions.length === 0) {
      flash("Product not found.", true);
    }
  }

  async function confirmPayment() {
    if (!event || !payMethod || cart.length === 0) return;

    setProcessing(true);

    try {
      const label = `${payMethod.name}${
        payMethod.provider ? ` (${payMethod.provider})` : ""
      }`;
      const clientTxnId = makeClientTxnId(event.id);

      const payload = {
        clientTxnId,
        totalAmount: subtotal,
        discount,
        finalAmount: total,
        paymentMethod: label,
        paymentReference: reference || null,
        createdAt: new Date().toISOString(),
        items: cart.map((item) => ({
          eventItemId: item.eventItemId,
          itemId: item.itemId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmt: item.discountAmt,
          finalPrice: item.finalPrice,
          subtotal: item.finalPrice * item.quantity,
          promoApplied: item.promoApplied,
        })),
      };

      const res = await fetch(`/api/local/events/${event.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = await res.json();

      if (!res.ok) {
        throw new Error(saved.error || "Failed to save transaction.");
      }

      const fresh = await loadLocalBundle(event.id);
      if (fresh) setItems(fresh.items);
      await refreshPendingCount(event.id);

      setLastTxn(saved.clientTxnId ?? clientTxnId);
      setScreen("success");
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Failed to save local transaction.",
        true
      );
    } finally {
      setProcessing(false);
    }
  }

  async function turnOffLocalPOS(force = false) {
    if (!event?.id) return;

    setActionLoading(true);
    setActionError("");

    try {
      const res = await fetch(
        `/api/local/events/${event.id}${force ? "?force=true" : ""}`,
        { method: "DELETE" }
      );
      const result = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setActionDialog("force-turn-off-local");
          setActionError(result.error || "This local POS has unsynced sales.");
          return;
        }

        throw new Error(result.error || "Failed to turn off local POS.");
      }

      localStorage.removeItem("pos:last-event-id");
      setActionDialog(null);
      setActionError("");
      window.location.href = "/pos?select=1";
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to turn off local POS."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteCurrentEvent(forceLocalDelete = false) {
    if (!event?.id) return;

    setActionLoading(true);
    setActionError("");

    try {
      const res = await fetch(
        `/api/events?id=${event.id}${
          forceLocalDelete ? "&forceLocalDelete=true" : ""
        }`,
        { method: "DELETE" }
      );
      const result = await res.json();

      if (!res.ok) {
        if (
          res.status === 409 &&
          result.code === "LOCAL_POS_HAS_UNSYNCED_SALES"
        ) {
          setActionDialog("force-delete-event");
          setActionError(result.error || "This event has unsynced local sales.");
          return;
        }

        throw new Error(result.error || "Failed to delete event.");
      }

      localStorage.removeItem("pos:last-event-id");
      setActionDialog(null);
      setActionError("");
      window.location.href = "/events";
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to delete event."
      );
    } finally {
      setActionLoading(false);
    }
  }

  function nextTransaction() {
    setCart([]);
    setPayMethod(null);
    setReference("");
    setQuery("");
    setScreen("sell");
  }

  function exitPOS() {
    window.location.href = "/";
  }

  function ModalShell({
    children,
    onClose,
  }: {
    children: React.ReactNode;
    onClose?: () => void;
  }) {
    return (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        style={{
          background: "rgba(15, 23, 42, 0.58)",
          backdropFilter: "blur(7px)",
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        {children}
      </div>
    );
  }

  function POSActionModal() {
    if (!actionDialog || !event) return null;

    const isForceTurnOff = actionDialog === "force-turn-off-local";
    const isTurnOff =
      actionDialog === "turn-off-local" || actionDialog === "force-turn-off-local";
    const isForceDelete = actionDialog === "force-delete-event";
    const isDelete =
      actionDialog === "delete-event" || actionDialog === "force-delete-event";

    const title = isDelete
      ? isForceDelete
        ? "Force Delete Event?"
        : "Delete Event?"
      : isForceTurnOff
        ? "Force Turn Off Local POS?"
        : "Turn Off Local POS?";

    const description = isDelete
      ? isForceDelete
        ? "This will delete the cloud event and force remove local POS data on this computer. Unsynced local sales will be lost."
        : "This will delete the event from the system and also remove its local POS data on this computer."
      : isForceTurnOff
        ? "This will remove the prepared local POS data even though there are unsynced local sales. Unsynced local sales will be lost."
        : "This will only turn off the prepared local POS data on this computer. The cloud event will remain.";

    const confirmLabel = isDelete
      ? isForceDelete
        ? "Force Delete Event"
        : "Delete Event"
      : isForceTurnOff
        ? "Force Turn Off"
        : "Turn Off Local POS";

    const confirmColor = isDelete || isForceTurnOff ? "#dc2626" : "#b45309";

    async function confirmAction() {
      if (isDelete) {
        await deleteCurrentEvent(isForceDelete);
        return;
      }

      if (isTurnOff) {
        await turnOffLocalPOS(isForceTurnOff);
      }
    }

    return (
      <ModalShell
        onClose={() => {
          setActionDialog(null);
          setActionError("");
        }}
      >
        <div
          className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden anim-fade-up"
          style={{ background: "white" }}
        >
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background:
                    isDelete || isForceTurnOff
                      ? "rgba(220,38,38,0.10)"
                      : "rgba(245,158,11,0.12)",
                  color: confirmColor,
                }}
              >
                {isDelete ? <Trash2 size={21} /> : <Power size={21} />}
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black" style={{ color: "#111827" }}>
                  {title}
                </h2>
                <p
                  className="text-sm mt-1 leading-relaxed"
                  style={{ color: "#6b7280" }}
                >
                  {description}
                </p>

                <div
                  className="mt-4 rounded-2xl px-4 py-3"
                  style={{
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <p
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: "#9ca3af" }}
                  >
                    Event
                  </p>
                  <p
                    className="text-sm font-bold truncate"
                    style={{ color: "#111827" }}
                  >
                    {event.name}
                  </p>
                  {event.location && (
                    <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
                      {event.location}
                    </p>
                  )}
                </div>

                {pendingSyncCount > 0 && (
                  <div
                    className="mt-3 rounded-2xl px-4 py-3 flex gap-2"
                    style={{
                      background: "rgba(245,158,11,0.10)",
                      color: "#b45309",
                    }}
                  >
                    <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                    <p className="text-xs leading-relaxed">
                      {pendingSyncCount} local sale
                      {pendingSyncCount > 1 ? "s" : ""} still pending sync.
                    </p>
                  </div>
                )}

                {actionError && (
                  <div
                    className="mt-3 rounded-2xl px-4 py-3 text-xs font-semibold"
                    style={{ background: "#fef2f2", color: "#dc2626" }}
                  >
                    {actionError}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            className="px-6 py-4 flex gap-2 justify-end"
            style={{ background: "#f9fafb", borderTop: "1px solid #e5e7eb" }}
          >
            <button
              onClick={() => {
                setActionDialog(null);
                setActionError("");
              }}
              disabled={actionLoading}
              className="px-4 py-2.5 rounded-xl text-sm font-bold border disabled:opacity-50"
              style={{
                background: "white",
                borderColor: "#e5e7eb",
                color: "#374151",
              }}
            >
              Cancel
            </button>

            <button
              onClick={confirmAction}
              disabled={actionLoading}
              className="px-4 py-2.5 rounded-xl text-sm font-black disabled:opacity-50"
              style={{ background: confirmColor, color: "white" }}
            >
              {actionLoading ? "Processing..." : confirmLabel}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  function SearchResultsOverlay() {
    const shouldShow = searchFocused && query.trim().length > 0;

    if (!shouldShow) return null;

    return (
      <div
        className="absolute left-0 right-0 top-[calc(100%+10px)] z-[120] rounded-3xl shadow-2xl overflow-hidden anim-fade-up"
        style={{
          background: "white",
          border: "1px solid #e5e7eb",
          boxShadow: "0 24px 70px rgba(15,23,42,0.18)",
        }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid #f3f4f6" }}
        >
          <div>
            <p
              className="text-xs font-black uppercase tracking-widest"
              style={{ color: "#9ca3af" }}
            >
              Search Results
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              Press Enter to add exact match, or click an item below.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSearchFocused(false);
            }}
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "#f3f4f6", color: "#6b7280" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[430px] overflow-y-auto p-3">
          {suggestions.length === 0 ? (
            <div className="py-12 text-center">
              <Package
                size={30}
                className="mx-auto mb-3"
                style={{ color: "#d1d5db" }}
              />
              <p className="text-sm font-bold" style={{ color: "#6b7280" }}>
                No products found
              </p>
              <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
                Try another item ID, name, variant, or color.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((item) => {
                const inCart = cart.find((row) => row.eventItemId === item.id);
                const stock = Number(item.stock ?? 0);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addItem(item)}
                    className="w-full text-left rounded-2xl p-3 transition-all hover:shadow-md"
                    style={{
                      background: inCart ? "rgba(255,101,63,0.06)" : "#fff",
                      border: inCart
                        ? "1.5px solid rgba(255,101,63,0.25)"
                        : "1.5px solid #e5e7eb",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0"
                        style={{
                          background: inCart
                            ? "rgba(255,101,63,0.12)"
                            : "#f3f4f6",
                          color: inCart ? "var(--brand-orange)" : "#9ca3af",
                        }}
                      >
                        {item.name.slice(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-black truncate"
                          style={{ color: "#111827" }}
                        >
                          {item.name}
                        </p>

                        <p
                          className="text-xs font-mono mt-0.5 truncate"
                          style={{ color: "#9ca3af" }}
                        >
                          {item.itemId}
                          {item.variantCode ? ` · ${item.variantCode}` : ""}
                        </p>

                        {item.color && (
                          <p
                            className="text-xs truncate"
                            style={{ color: "#9ca3af" }}
                          >
                            {item.color}
                          </p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p
                          className="text-sm font-black"
                          style={{ color: "var(--brand-orange)" }}
                        >
                          {money(item.netPrice)}
                        </p>

                        <span
                          className="inline-flex mt-1 text-[11px] font-black px-2 py-1 rounded-full"
                          style={{
                            background: stock < 0 ? "#fef2f2" : "#f3f4f6",
                            color: stockTone(stock),
                          }}
                        >
                          Total stock = {stock.toLocaleString("id-ID")}
                        </span>

                        {inCart && (
                          <p
                            className="text-[11px] font-bold mt-1"
                            style={{ color: "var(--brand-orange)" }}
                          >
                            ×{inCart.quantity} in cart
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  function PaymentSuccessOverlay() {
    if (screen !== "success") return null;

    return (
      <ModalShell onClose={nextTransaction}>
        <div
          className="w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden anim-fade-up"
          style={{ background: "white" }}
        >
          <div className="px-6 pt-7 pb-5 text-center" style={{ borderBottom: "2px dashed #e5e7eb" }}>
            <div
              className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ background: "rgba(22,163,74,0.10)" }}
            >
              <CheckCircle2 size={28} style={{ color: "#16a34a" }} />
            </div>
            <p className="font-black text-lg" style={{ color: "#111827" }}>
              Payment Complete
            </p>
            <p className="text-xs font-mono mt-1" style={{ color: "#9ca3af" }}>
              {String(lastTxn)}
            </p>
            <p className="text-[11px] mt-2" style={{ color: "#9ca3af" }}>
              Sale saved locally. Sync will run when internet is stable.
            </p>
          </div>

          <div className="px-6 py-4 space-y-2 max-h-64 overflow-y-auto" style={{ borderBottom: "1px solid #f3f4f6" }}>
            {cart.map((item) => (
              <div key={item.eventItemId} className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: "#111827" }}>
                    {item.productName}
                    {item.variantCode && <span style={{ color: "#9ca3af" }}> ({item.variantCode})</span>}
                  </p>
                  <p className="text-xs font-mono" style={{ color: "#9ca3af" }}>
                    {money(item.finalPrice)} × {item.quantity}
                  </p>
                </div>
                <p className="text-xs font-black font-mono" style={{ color: "#111827" }}>
                  {money(item.finalPrice * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          <div className="px-6 py-4">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#9ca3af" }}>
                Total
              </span>
              <span className="text-3xl font-black" style={{ color: "#111827" }}>
                {money(total)}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
              via {payMethod?.name}
              {payMethod?.provider ? ` · ${payMethod.provider}` : ""}
            </p>
          </div>

          <div className="px-6 pb-6 flex gap-2">
            <button
              onClick={nextTransaction}
              className="flex-1 rounded-2xl py-3.5 text-sm font-black"
              style={{ background: "var(--brand-orange)", color: "white" }}
            >
              Next Sale
            </button>
            <button
              onClick={() => event?.id && syncLocalTransactions(event.id)}
              disabled={syncing || !online}
              className="px-4 rounded-2xl text-sm font-bold border disabled:opacity-40"
              style={{ borderColor: "#e5e7eb", color: "#0369a1", background: "white" }}
            >
              {syncing ? "Syncing…" : "Sync"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  function ReportDrawer() {
    if (!showReport) return null;

    return (
      <>
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.18)" }}
          onClick={() => setShowReport(false)}
        />

        <div
          className="fixed right-0 top-0 h-full z-50 flex flex-col"
          style={{
            width: 360,
            background: "white",
            boxShadow: "-4px 0 32px rgba(0,0,0,0.1)",
            borderLeft: "1px solid #e5e7eb",
          }}
        >
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #e5e7eb" }}>
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(124,58,237,0.1)", color: "#7c3aed" }}
              >
                <BarChart2 size={15} />
              </div>
              <div>
                <p className="text-sm font-black" style={{ color: "#111" }}>
                  Sales Report
                </p>
                <p className="text-xs truncate max-w-[230px]" style={{ color: "#9ca3af" }}>
                  {event?.name}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowReport(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "#f3f4f6", color: "#6b7280" }}
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {loadingStats ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <RefreshCw size={20} className="animate-spin" style={{ color: "#d1d5db" }} />
                <p className="text-xs" style={{ color: "#9ca3af" }}>
                  Loading stats…
                </p>
              </div>
            ) : dailyStats ? (
              <>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#9ca3af" }}>
                    Today
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        icon: <DollarSign size={14} />,
                        label: "Revenue",
                        value: money(dailyStats.todayRevenue),
                        color: "var(--brand-orange)",
                        bg: "rgba(255,101,63,0.08)",
                      },
                      {
                        icon: <ShoppingBag size={14} />,
                        label: "Transactions",
                        value: String(dailyStats.todayTxnCount),
                        color: "#0369a1",
                        bg: "rgba(3,105,161,0.07)",
                      },
                      {
                        icon: <TrendingUp size={14} />,
                        label: "Items Sold",
                        value: `${dailyStats.todayItemsSold} units`,
                        color: "#7c3aed",
                        bg: "rgba(124,58,237,0.08)",
                      },
                      {
                        icon: <Tag size={14} />,
                        label: "Discounts",
                        value: money(dailyStats.todayDiscount),
                        color: "#16a34a",
                        bg: "rgba(22,163,74,0.07)",
                      },
                    ].map(({ icon, label, value, color, bg }) => (
                      <div key={label} className="rounded-xl p-3" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-2" style={{ background: bg, color }}>
                          {icon}
                        </div>
                        <p className="text-xs" style={{ color: "#9ca3af" }}>
                          {label}
                        </p>
                        <p className="text-sm font-black mt-0.5 truncate" style={{ color }}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #f3f4f6" }} />

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#9ca3af" }}>
                    Total Event Sales
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: "Total Revenue", value: money(dailyStats.revenue), color: "var(--brand-orange)" },
                      { label: "Transactions", value: String(dailyStats.txnCount), color: "#0369a1" },
                      { label: "Items Sold", value: `${dailyStats.itemsSold} units`, color: "#7c3aed" },
                      { label: "Total Discounts", value: money(dailyStats.discount), color: "#16a34a" },
                      { label: "Total Stock", value: String(dailyStats.totalUnits), color: stockTone(dailyStats.totalUnits) },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: "#f9fafb" }}>
                        <span className="text-xs" style={{ color: "#9ca3af" }}>
                          {label}
                        </span>
                        <span className="text-sm font-black" style={{ color }}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <BarChart2 size={24} style={{ color: "#d1d5db" }} />
                <p className="text-xs text-center" style={{ color: "#9ca3af" }}>
                  Could not load stats.
                  <br />
                  Check your connection and try again.
                </p>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 px-5 py-4" style={{ borderTop: "1px solid #e5e7eb" }}>
            <button
              onClick={() => event?.id && loadDailyStats(event.id)}
              disabled={loadingStats}
              className="w-full rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{ background: "#f3f4f6", color: "#374151" }}
            >
              <RefreshCw size={11} className={loadingStats ? "animate-spin" : ""} />
              Refresh Stats
            </button>
          </div>
        </div>
      </>
    );
  }

  if (screen === "event-select") {
    return (
      <div className="min-h-screen" style={{ background: "#fafaf8" }}>
        <style>{KEYFRAMES}</style>

        {toast && (
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl"
            style={{ background: toastErr ? "#ef4444" : "#16a34a", color: "white" }}
          >
            {toast}
          </div>
        )}

        <div style={{ background: "white", borderBottom: "1px solid #e5e7eb" }}>
          <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "var(--brand-orange)", color: "white" }}
              >
                <Zap size={17} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight" style={{ color: "#111" }}>
                  Point of Sale
                </p>
                <p className="text-xs" style={{ color: "#9ca3af" }}>
                  Choose an event to open
                </p>
              </div>
            </div>

            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{
                background: online ? "rgba(22,163,74,0.08)" : "rgba(245,158,11,0.1)",
                color: online ? "#16a34a" : "#b45309",
              }}
            >
              {online ? <Wifi size={11} /> : <WifiOff size={11} />}
              {online ? "Online" : "Offline"}
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          {preparedEvents.length > 0 && (
            <section className="anim-fade-up">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full" style={{ background: "var(--brand-orange)" }} />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#374151" }}>
                  Ready to Sell
                </p>
              </div>

              <div className="space-y-2">
                {preparedEvents.map((ev, index) => {
                  const style = STATUS_STYLE[ev.status] ?? STATUS_STYLE.draft;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => {
                        localStorage.setItem("pos:last-event-id", String(ev.id));
                        loadLocalBundle(ev.id).then((bundle) => bundle && setScreen("sell"));
                      }}
                      className="anim-fade-up w-full text-left rounded-2xl px-5 py-4 transition-all group hover:shadow-md"
                      style={{
                        background: "white",
                        border: `1.5px solid ${style.border}`,
                        animationDelay: `${index * 55}ms`,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: style.bg }}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full block"
                            style={{
                              background: style.dot,
                              animation:
                                ev.status === "active"
                                  ? "pulseDot 2s ease-in-out infinite"
                                  : undefined,
                            }}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-[15px] truncate" style={{ color: "#111" }}>
                              {ev.name}
                            </p>
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                              style={{ background: style.bg, color: style.dot }}
                            >
                              {style.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {ev.location && (
                              <span className="flex items-center gap-1 text-xs" style={{ color: "#9ca3af" }}>
                                <MapPin size={10} />
                                {ev.location}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#0369a1" }}>
                              <Database size={9} />
                              Local ready
                            </span>
                            {ev.pendingSyncCount > 0 && (
                              <span
                                className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                                style={{ background: "rgba(245,158,11,0.1)", color: "#b45309" }}
                              >
                                {ev.pendingSyncCount} unsynced
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                          style={{ background: "var(--brand-orange)", color: "white" }}
                        >
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {events.length > 0 && (
            <section className="anim-fade-up" style={{ animationDelay: "80ms" }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full" style={{ background: "#e5e7eb" }} />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#374151" }}>
                  Available Events
                </p>
              </div>

              <div className="space-y-2">
                {events.map((ev, index) => {
                  const style = STATUS_STYLE[ev.status] ?? STATUS_STYLE.draft;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => openLocalEvent(ev)}
                      disabled={preparing}
                      className="anim-fade-up w-full text-left rounded-2xl px-5 py-4 transition-all group hover:shadow-sm disabled:opacity-50"
                      style={{
                        background: "white",
                        border: "1.5px solid #e5e7eb",
                        animationDelay: `${(index + preparedEvents.length) * 55}ms`,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: style.bg }}
                        >
                          <span className="w-2.5 h-2.5 rounded-full block" style={{ background: style.dot }} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-[15px] truncate" style={{ color: "#111" }}>
                              {ev.name}
                            </p>
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                              style={{ background: style.bg, color: style.dot }}
                            >
                              {style.label}
                            </span>
                          </div>
                          {ev.location && (
                            <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: "#9ca3af" }}>
                              <MapPin size={10} />
                              {ev.location}
                            </span>
                          )}
                        </div>

                        {preparing ? (
                          <div
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0"
                            style={{ background: "rgba(255,101,63,0.08)", color: "var(--brand-orange)" }}
                          >
                            <RefreshCw size={11} className="animate-spin" />
                            Preparing…
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border flex-shrink-0 transition-all group-hover:border-orange-300 group-hover:text-orange-600"
                            style={{ borderColor: "#e5e7eb", color: "#6b7280" }}
                          >
                            Open
                            <ChevronRight size={11} />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {preparedEvents.length === 0 && events.length === 0 && (
            <div
              className="rounded-2xl p-10 text-center anim-fade-up"
              style={{ background: "white", border: "1.5px solid #e5e7eb" }}
            >
              <div
                className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: "#f3f4f6" }}
              >
                <Package size={20} style={{ color: "#9ca3af" }} />
              </div>
              <p className="font-semibold text-sm mb-1" style={{ color: "#374151" }}>
                No events available
              </p>
              <p className="text-xs" style={{ color: "#9ca3af" }}>
                {online
                  ? "No events found. Create one from the dashboard."
                  : "Connect to the internet to load events."}
              </p>
            </div>
          )}

          <div className="text-center pt-2">
            <a href="/" className="text-xs" style={{ color: "#d1d5db" }}>
              ← Back to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  const eventStyle = STATUS_STYLE[event?.status ?? "draft"] ?? STATUS_STYLE.draft;
  const needsReference = payMethod && payMethod.type !== "cash";

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: "#fafaf8" }}>
      <style>{KEYFRAMES}</style>
      <POSActionModal />
      <PaymentSuccessOverlay />
      <ReportDrawer />

      {toast && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl pointer-events-none"
          style={{ background: toastErr ? "#ef4444" : "#16a34a", color: "white" }}
        >
          {toast}
        </div>
      )}

      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{ background: "white", borderBottom: "1px solid #e5e7eb", height: 58 }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: eventStyle.dot,
              animation: event?.status === "active" ? "pulseDot 2s ease-in-out infinite" : undefined,
            }}
          />
          <div className="min-w-0">
            <p className="text-sm font-black truncate" style={{ color: "#111" }}>
              {event?.name}
            </p>
            {event?.location && (
              <p className="hidden md:flex items-center gap-1 text-xs" style={{ color: "#9ca3af" }}>
                <MapPin size={10} />
                {event.location}
              </p>
            )}
          </div>
        </div>

        <div
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl"
          style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}
        >
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#9ca3af" }}>
            Status
          </span>
          <span
            className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-xl"
            style={{ background: "rgba(3,105,161,0.07)", color: "#0369a1" }}
          >
            <Database size={9} />
            SQLite
          </span>
          <span
            className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-xl"
            style={{
              background: online ? "rgba(22,163,74,0.07)" : "rgba(245,158,11,0.1)",
              color: online ? "#16a34a" : "#b45309",
            }}
          >
            {online ? <Wifi size={9} /> : <WifiOff size={9} />}
            {online ? "Online" : "Offline"}
          </span>
          {pendingSyncCount > 0 ? (
            <button
              onClick={() => event?.id && syncLocalTransactions(event.id)}
              disabled={syncing || !online}
              className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-xl disabled:opacity-60"
              style={{ background: "rgba(245,158,11,0.1)", color: "#b45309" }}
            >
              {syncing ? <RefreshCw size={9} className="animate-spin" /> : <CloudUpload size={9} />}
              {pendingSyncCount} pending
            </button>
          ) : localReady ? (
            <span
              className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-xl"
              style={{ background: "rgba(22,163,74,0.07)", color: "#16a34a" }}
            >
              <Check size={9} />
              Synced
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => {
              setShowReport(true);
              if (event?.id) loadDailyStats(event.id);
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all"
            style={{ color: "#7c3aed", background: "rgba(124,58,237,0.05)", borderColor: "rgba(124,58,237,0.2)" }}
          >
            <BarChart2 size={12} />
            <span className="hidden sm:inline">Report</span>
          </button>

          <button
            onClick={() => event?.id && prepareEventOffline(event.id)}
            disabled={preparing || !online}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all disabled:opacity-40"
            style={{ color: "#0369a1", background: "white", borderColor: "#e5e7eb" }}
          >
            {preparing ? <RefreshCw size={12} className="animate-spin" /> : <Database size={12} />}
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => {
              setCart([]);
              setPayMethod(null);
              setReference("");
              setQuery("");
              window.location.href = "/pos?select=1";
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all"
            style={{ color: "#374151", background: "white", borderColor: "#e5e7eb" }}
          >
            Switch
          </button>

          <button
            onClick={() => {
              setActionError("");
              setActionDialog("turn-off-local");
            }}
            className="hidden md:flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all"
            style={{ color: "#b45309", background: "white", borderColor: "#fde68a" }}
          >
            <Power size={12} />
            Turn Off
          </button>

          {/* <button
            onClick={() => {
              setActionError("");
              setActionDialog("delete-event");
            }}
            className="hidden md:flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all"
            style={{ color: "#dc2626", background: "white", borderColor: "#fecaca" }}
          >
            <Trash2 size={12} />
            Delete
          </button> */}

          <button
            onClick={exitPOS}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all"
            // style={{ color: "#9ca3af", background: "white", borderColor: "#e5e7eb" }}
            style={{ color: "#dc2626", background: "white", borderColor: "#fecaca" }}
          >
            <LogOut size={12} />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <section className="w-3/4 flex flex-col flex-shrink-0" style={{ background: "white", borderRight: "1px solid #e5e7eb" }}>
          <div
            className="px-5 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid #f3f4f6" }}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: "#9ca3af" }}
                >
                  Cart
                </p>

                <p className="text-sm font-black" style={{ color: "#111827" }}>
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </p>
              </div>

              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-[11px] px-3 py-2 rounded-xl font-bold"
                  style={{ background: "#fef2f2", color: "#ef4444" }}
                >
                  Clear Cart
                </button>
              )}
            </div>

            <div className="relative">
              <form onSubmit={handleSearchSubmit}>
                <div className="relative">
                  <ScanLine
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--brand-orange)" }}
                  />

                  <input
                    ref={scanRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    placeholder="Scan barcode or search product..."
                    className="w-full rounded-2xl pl-11 pr-11 py-4 text-base focus:outline-none"
                    style={{
                      background: "#f9fafb",
                      border: "1.5px solid #e5e7eb",
                      color: "#111827",
                    }}
                    autoFocus
                  />

                  {query ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setSearchFocused(false);
                        scanRef.current?.focus();
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: "#f3f4f6", color: "#6b7280" }}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              </form>

              <SearchResultsOverlay />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                <Package size={34} style={{ color: "#e5e7eb" }} />
                <p className="text-sm font-bold mt-3" style={{ color: "#9ca3af" }}>
                  Cart is empty
                </p>
                <p className="text-xs mt-1" style={{ color: "#d1d5db" }}>
                  Tap Scan / Search to add products.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div
                    key={item.eventItemId}
                    className="rounded-2xl p-3"
                    style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black truncate" style={{ color: "#111827" }}>
                          {item.productName}
                        </p>
                        <p className="text-xs font-mono mt-0.5" style={{ color: "#9ca3af" }}>
                          {item.itemId}
                          {item.variantCode ? ` · ${item.variantCode}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => setCart((prev) => prev.filter((row) => row.eventItemId !== item.eventItemId))}
                        className="p-1.5 rounded-xl flex-shrink-0"
                        style={{ color: "#ef4444", background: "#fee2e2" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => changeQty(item.eventItemId, item.quantity - 1)}
                          className="w-8 h-8 rounded-xl flex items-center justify-center"
                          style={{ background: "#f3f4f6", color: "#374151" }}
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-9 text-center text-sm font-black" style={{ color: "#111827" }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => changeQty(item.eventItemId, item.quantity + 1)}
                          className="w-8 h-8 rounded-xl flex items-center justify-center"
                          style={{ background: "#f3f4f6", color: "#374151" }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <div className="text-right">
                        <p className="text-xs font-mono" style={{ color: "#9ca3af" }}>
                          {money(item.finalPrice)} each
                        </p>
                        <p className="text-sm font-black" style={{ color: "#111827" }}>
                          {money(item.finalPrice * item.quantity)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 p-5 space-y-3" style={{ borderTop: "1px solid #e5e7eb", background: "#fff" }}>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: "#9ca3af" }}>Subtotal</span>
                <span className="font-mono" style={{ color: "#374151" }}>
                  {money(subtotal)}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: "#16a34a" }}>Discount</span>
                  <span className="font-mono" style={{ color: "#16a34a" }}>
                    −{money(discount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-2" style={{ borderTop: "1px solid #f3f4f6" }}>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#9ca3af" }}>
                  Total
                </span>
                <span className="text-4xl font-black" style={{ color: "#111827" }}>
                  {money(total)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <main
          className="w-1/4 min-w-[280px] max-w-[360px] flex flex-col overflow-hidden"
          style={{ background: "white", borderLeft: "1px solid #e5e7eb" }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid #f3f4f6" }}
          >
            <p
              className="text-[11px] font-black uppercase tracking-widest"
              style={{ color: "#9ca3af" }}
            >
              Payment
            </p>
            <p className="text-sm font-black mt-0.5" style={{ color: "#111827" }}>
              Choose method
            </p>
          </div>

          {/* Payment methods */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {groupedPaymentMethods.map(([type, methods]) => (
              <div key={type}>
                <p
                  className="text-[10px] uppercase tracking-widest mb-1.5 font-black"
                  style={{ color: "#9ca3af" }}
                >
                  {type === "ewallet" ? "E-Wallet" : type}
                </p>

                <div className="space-y-1.5">
                  {methods.map((method) => {
                    const selected = payMethod?.id === method.id;
                    const color = PAY_COLOR[method.type] ?? "#374151";

                    return (
                      <button
                        key={method.id}
                        onClick={() => {
                          setPayMethod(method);
                          setReference("");
                        }}
                        className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-all"
                        style={{
                          background: selected ? `${color}0D` : "#f9fafb",
                          border: selected
                            ? `1.5px solid ${color}66`
                            : "1px solid #e5e7eb",
                        }}
                      >
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: selected ? `${color}18` : "#f3f4f6",
                            color: selected ? color : "#9ca3af",
                          }}
                        >
                          {PAY_ICON[method.type] ?? <CreditCard size={14} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs font-black truncate"
                            style={{ color: selected ? color : "#111827" }}
                          >
                            {method.name}
                          </p>

                          {method.provider && (
                            <p
                              className="text-[10px] truncate"
                              style={{ color: "#9ca3af" }}
                            >
                              {method.provider}
                            </p>
                          )}
                        </div>

                        {selected && (
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: color }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {needsReference && (
              <div>
                <label
                  className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                  style={{ color: "#9ca3af" }}
                >
                  Reference
                </label>

                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="EDC / QR ref..."
                  className="w-full rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none"
                  style={{
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    color: "#111827",
                  }}
                />
              </div>
            )}

            {/* Mini actions */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                onClick={() => scanRef.current?.focus()}
                className="rounded-xl px-2 py-2 text-center border"
                style={{ background: "#fafaf8", borderColor: "#e5e7eb" }}
              >
                <ScanLine
                  size={14}
                  className="mx-auto"
                  style={{ color: "var(--brand-orange)" }}
                />
                <p
                  className="text-[10px] font-black mt-1"
                  style={{ color: "#111827" }}
                >
                  Scan
                </p>
              </button>

              <button
                onClick={() => {
                  setShowReport(true);
                  if (event?.id) loadDailyStats(event.id);
                }}
                className="rounded-xl px-2 py-2 text-center border"
                style={{ background: "#fafaf8", borderColor: "#e5e7eb" }}
              >
                <BarChart2
                  size={14}
                  className="mx-auto"
                  style={{ color: "#7c3aed" }}
                />
                <p
                  className="text-[10px] font-black mt-1"
                  style={{ color: "#111827" }}
                >
                  Report
                </p>
              </button>

              <button
                onClick={() => event?.id && syncLocalTransactions(event.id)}
                disabled={syncing || !online || pendingSyncCount === 0}
                className="rounded-xl px-2 py-2 text-center border disabled:opacity-50"
                style={{ background: "#fafaf8", borderColor: "#e5e7eb" }}
              >
                {syncing ? (
                  <RefreshCw
                    size={14}
                    className="mx-auto animate-spin"
                    style={{ color: "#b45309" }}
                  />
                ) : (
                  <CloudUpload
                    size={14}
                    className="mx-auto"
                    style={{ color: "#b45309" }}
                  />
                )}

                <p
                  className="text-[10px] font-black mt-1"
                  style={{ color: "#111827" }}
                >
                  Sync
                </p>
              </button>
            </div>
          </div>

          {/* Bottom confirm */}
          <div
            className="flex-shrink-0 px-3 py-3 space-y-2"
            style={{ background: "white", borderTop: "1px solid #e5e7eb" }}
          >
            <div className="flex items-end justify-between gap-2">
              <div>
                <p
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: "#9ca3af" }}
                >
                  Total
                </p>
                <p
                  className="text-xl font-black leading-tight"
                  style={{ color: "var(--brand-orange)" }}
                >
                  {money(total)}
                </p>
              </div>

              <p className="text-[10px] text-right" style={{ color: "#9ca3af" }}>
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </p>
            </div>

            <button
              onClick={confirmPayment}
              disabled={!payMethod || processing || cart.length === 0}
              className="w-full rounded-xl py-3 text-xs font-black transition-all disabled:opacity-30"
              style={{
                background:
                  payMethod && cart.length > 0 ? "var(--brand-orange)" : "#f3f4f6",
                color: payMethod && cart.length > 0 ? "white" : "#9ca3af",
              }}
            >
              {processing
                ? "Saving..."
                : cart.length === 0
                  ? "Add items first"
                  : payMethod
                    ? "Confirm Payment"
                    : "Choose Method"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense
      fallback={
        <div
          className="h-screen w-screen flex items-center justify-center"
          style={{ background: "#fafaf8" }}
        >
          <div className="flex items-center gap-2" style={{ color: "#9ca3af" }}>
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Loading POS…</span>
          </div>
        </div>
      }
    >
      <POSInner />
    </Suspense>
  );
}
