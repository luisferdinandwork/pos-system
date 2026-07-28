// app/(price-check)/price-check/page.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Info,
  LogOut,
  MapPin,
  Package,
  RefreshCw,
  ScanLine,
  Search,
  Tag,
  X,
} from "lucide-react";

import { discountPct, formatRupiah } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type EventRow = {
  id: number;
  name: string;
  status: string;
  location: string | null;
};

type EventItem = {
  id: number;
  itemId: string;
  variantCode: string | null;
  name: string;
  color: string | null;
  unit: string | null;
  netPrice: string;
  retailPrice: string;
  stock: number;
};

type Screen = "loading" | "event-select" | "check";

type ErrorResponse = {
  error?: string;
  message?: string;
};

// ── Styling ───────────────────────────────────────────────────────────────────

const C = {
  bg: "var(--background)",
  border: "var(--border)",
  muted: "var(--muted)",
  mutedFg: "var(--muted-foreground)",
  fg: "var(--foreground)",
  orange: "var(--brand-orange)",
  mid: "var(--brand-mid)",
  deep: "var(--brand-deep)",
};

// ── API helpers ────────────────────────────────────────────────────────────────

class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function requestJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });

  const rawBody = await response.text();

  let body: unknown = null;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody;
    }
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;

    if (typeof body === "string" && body.trim()) {
      message = body;
    } else if (body && typeof body === "object") {
      const errorBody = body as ErrorResponse;
      message = errorBody.error ?? errorBody.message ?? message;
    }

    throw new ApiRequestError(response.status, message);
  }

  return body as T;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

// ── Display helpers ────────────────────────────────────────────────────────────

function money(value: string | number) {
  return formatRupiah(value);
}

function stockTone(stock: number) {
  if (stock <= 0) return "#ef4444";
  if (stock <= 5) return "#f59e0b";
  return "#16a34a";
}

function stockLabel(stock: number) {
  if (stock <= 0) return "Out of stock";
  if (stock <= 5) return `Low stock — ${stock} left`;
  return `${stock} in stock`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PriceCheckPage() {
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>("loading");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<EventItem[]>([]);

  const [openingEventId, setOpeningEventId] = useState<number | null>(null);
  const [eventSearch, setEventSearch] = useState("");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<EventItem[]>([]);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);
  const initialLoadStartedRef = useRef(false);

  const handleRequestError = useCallback(
    (error: unknown) => {
      console.error("[price-check]", error);

      if (error instanceof ApiRequestError && error.status === 401) {
        router.replace("/login?callbackUrl=%2Fprice-check");
        return;
      }

      if (error instanceof ApiRequestError && error.status === 403) {
        setErrorMessage(
          error.message || "You do not have permission to access this page."
        );
        return;
      }

      setErrorMessage(getErrorMessage(error));
    },
    [router]
  );

  const openEvent = useCallback(
    async (eventRow: EventRow) => {
      setOpeningEventId(eventRow.id);
      setErrorMessage(null);
      setNotFound(false);
      setSelected(null);

      try {
        const data = await requestJson<unknown>(
          `/api/price-check/events/${eventRow.id}/items`
        );

        if (!Array.isArray(data)) {
          throw new Error("The event items response has an invalid format.");
        }

        setItems(data as EventItem[]);
        setEvent(eventRow);
        setScreen("check");

        window.setTimeout(() => {
          scanRef.current?.focus();
        }, 50);
      } catch (error) {
        setItems([]);
        setEvent(null);
        setScreen("event-select");
        handleRequestError(error);
      } finally {
        setOpeningEventId(null);
      }
    },
    [handleRequestError]
  );

  const loadEvents = useCallback(async () => {
    setScreen("loading");
    setErrorMessage(null);

    try {
      const data = await requestJson<unknown>("/api/price-check/events");

      if (!Array.isArray(data)) {
        throw new Error("The events response has an invalid format.");
      }

      const rows = data as EventRow[];

      setEvents(rows);

      if (rows.length === 1) {
        await openEvent(rows[0]);
        return;
      }

      setScreen("event-select");
    } catch (error) {
      setEvents([]);
      setScreen("event-select");
      handleRequestError(error);
    }
  }, [handleRequestError, openEvent]);

  useEffect(() => {
    if (initialLoadStartedRef.current) {
      return;
    }

    initialLoadStartedRef.current = true;
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      setSuggestions([]);
      return;
    }

    const matchingItems = items
      .filter((item) => {
        return (
          item.itemId.toLowerCase().includes(normalizedQuery) ||
          item.name.toLowerCase().includes(normalizedQuery) ||
          (item.variantCode ?? "")
            .toLowerCase()
            .includes(normalizedQuery) ||
          (item.color ?? "").toLowerCase().includes(normalizedQuery)
        );
      })
      .slice(0, 24);

    setSuggestions(matchingItems);
  }, [items, query]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = eventSearch.trim().toLowerCase();

    if (!normalizedQuery) {
      return events;
    }

    return events.filter((eventRow) => {
      return (
        eventRow.name.toLowerCase().includes(normalizedQuery) ||
        (eventRow.location ?? "")
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [eventSearch, events]);

  function pickItem(item: EventItem) {
    setSelected(item);
    setNotFound(false);
    setQuery("");
    setSuggestions([]);

    window.setTimeout(() => {
      scanRef.current?.focus();
    }, 0);
  }

  function handleSubmit(eventObject: React.FormEvent<HTMLFormElement>) {
    eventObject.preventDefault();

    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return;
    }

    const exactItem = items.find((item) => {
      return (
        item.itemId.toLowerCase() === normalizedQuery ||
        (item.variantCode ?? "").toLowerCase() === normalizedQuery
      );
    });

    if (exactItem) {
      pickItem(exactItem);
      return;
    }

    if (suggestions.length === 1) {
      pickItem(suggestions[0]);
      return;
    }

    if (suggestions.length === 0) {
      setSelected(null);
      setNotFound(true);
      setQuery("");
    }
  }

  function switchEvent() {
    setEvent(null);
    setItems([]);
    setQuery("");
    setSuggestions([]);
    setSelected(null);
    setNotFound(false);
    setErrorMessage(null);
    setScreen("event-select");
  }

  function logout() {
    void signOut({
      callbackUrl: "/login",
    });
  }

  // ── Loading screen ────────────────────────────────────────────────────────

  if (screen === "loading") {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center"
        style={{ background: C.deep }}
      >
        <div className="flex items-center gap-2.5">
          <RefreshCw
            size={16}
            className="animate-spin"
            style={{ color: "rgba(255,101,63,0.7)" }}
          />

          <span
            className="text-sm font-bold"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Loading price check…
          </span>
        </div>
      </div>
    );
  }

  // ── Event selection screen ────────────────────────────────────────────────

  if (screen === "event-select") {
    return (
      <div
        className="flex h-screen flex-col overflow-hidden"
        style={{ background: C.bg }}
      >
        <div style={{ background: C.deep }}>
          <div className="flex items-center gap-3 px-4 py-4">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: C.orange }}
            >
              <Tag size={16} strokeWidth={2.5} color="white" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-black leading-tight text-white">
                Price Check
              </p>

              <p className="text-[11px] text-white opacity-50">
                {events.length} event{events.length === 1 ? "" : "s"} available
              </p>
            </div>

            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all hover:bg-red-500/20"
              style={{
                color: "rgba(248,113,113,0.85)",
                border: "1px solid rgba(248,113,113,0.16)",
              }}
            >
              <LogOut size={12} />
              Log Out
            </button>
          </div>

          <div className="px-4 pb-3">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "rgba(255,255,255,0.35)" }}
              />

              <input
                value={eventSearch}
                onChange={(eventObject) =>
                  setEventSearch(eventObject.target.value)
                }
                placeholder="Search events…"
                className="w-full rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "white",
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {errorMessage ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: "rgba(220,38,38,0.06)",
                border: "1.5px solid rgba(220,38,38,0.2)",
              }}
            >
              <AlertCircle
                size={24}
                className="mx-auto mb-2"
                style={{ color: "#dc2626" }}
              />

              <p
                className="text-sm font-black"
                style={{ color: "#dc2626" }}
              >
                Unable to load price check
              </p>

              <p
                className="mt-1 break-words text-xs"
                style={{ color: C.mutedFg }}
              >
                {errorMessage}
              </p>

              <button
                type="button"
                onClick={() => {
                  initialLoadStartedRef.current = true;
                  void loadEvents();
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white"
                style={{ background: C.orange }}
              >
                <RefreshCw size={13} />
                Try Again
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div
              className="rounded-2xl p-10 text-center"
              style={{
                background: "white",
                border: `1.5px solid ${C.border}`,
              }}
            >
              <Package
                size={22}
                className="mx-auto mb-2"
                style={{ color: C.border }}
              />

              <p
                className="text-sm font-black"
                style={{ color: C.mid }}
              >
                No events available
              </p>

              <p
                className="mt-1 text-xs"
                style={{ color: C.mutedFg }}
              >
                Ask an admin to assign you to an event.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map((eventRow) => {
                const isOpening = openingEventId === eventRow.id;

                return (
                  <button
                    key={eventRow.id}
                    type="button"
                    onClick={() => void openEvent(eventRow)}
                    disabled={openingEventId !== null}
                    className="w-full rounded-2xl px-4 py-3.5 text-left transition-all hover:shadow-sm disabled:opacity-60"
                    style={{
                      background: "white",
                      border: `1.5px solid ${C.border}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
                        style={{
                          background: "rgba(255,101,63,0.08)",
                        }}
                      >
                        <Tag size={16} style={{ color: C.orange }} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-black"
                          style={{ color: C.fg }}
                        >
                          {eventRow.name}
                        </p>

                        {eventRow.location && (
                          <p
                            className="mt-0.5 flex items-center gap-1 text-xs"
                            style={{ color: C.mutedFg }}
                          >
                            <MapPin size={9} />
                            {eventRow.location}
                          </p>
                        )}
                      </div>

                      {isOpening ? (
                        <RefreshCw
                          size={14}
                          className="animate-spin"
                          style={{ color: C.mutedFg }}
                        />
                      ) : (
                        <ChevronRight
                          size={14}
                          style={{ color: C.mutedFg }}
                        />
                      )}
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

  // ── Price checking screen ─────────────────────────────────────────────────

  const showSuggestions =
    suggestions.length > 0 && query.trim().length > 0;

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: C.bg }}
    >
      <header
        className="flex flex-shrink-0 items-center gap-2 px-4"
        style={{
          background: C.deep,
          height: 56,
        }}
      >
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <Tag
            size={15}
            strokeWidth={2.5}
            style={{ color: C.orange }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">
            {event?.name}
          </p>

          {event?.location && (
            <p className="flex items-center gap-1 text-[11px] text-white opacity-50">
              <MapPin size={9} />
              {event.location}
            </p>
          )}
        </div>

        {events.length > 1 && (
          <button
            type="button"
            onClick={switchEvent}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all hover:bg-white/10"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            <ArrowLeft size={13} />
            Switch Event
          </button>
        )}

        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all hover:bg-red-500/20"
          style={{ color: "rgba(248,113,113,0.85)" }}
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Log Out</span>
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-8">
        <div className="w-full max-w-lg">
          <form
            onSubmit={handleSubmit}
            className="relative"
          >
            <div className="relative">
              <ScanLine
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
                style={{ color: C.orange }}
              />

              <input
                ref={scanRef}
                value={query}
                onChange={(eventObject) => {
                  setQuery(eventObject.target.value);
                  setNotFound(false);
                }}
                placeholder="Scan barcode or search product…"
                autoFocus
                className="w-full rounded-2xl py-4 pl-12 pr-10 text-base focus:outline-none focus:ring-2"
                style={
                  {
                    background: "white",
                    border: `1.5px solid ${C.border}`,
                    color: C.fg,
                    "--tw-ring-color": "rgba(255,101,63,0.3)",
                  } as React.CSSProperties
                }
              />

              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSuggestions([]);
                    setNotFound(false);
                    scanRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg"
                  style={{
                    background: C.muted,
                    color: C.mutedFg,
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {showSuggestions && (
              <div
                className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl shadow-2xl"
                style={{
                  background: "white",
                  border: `1px solid ${C.border}`,
                }}
              >
                <div className="max-h-80 space-y-1.5 overflow-y-auto p-2">
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => pickItem(item)}
                      className="w-full rounded-xl p-3 text-left transition-all"
                      style={{
                        background: C.muted,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-black"
                            style={{ color: C.fg }}
                          >
                            {item.name}
                          </p>

                          <p
                            className="mt-0.5 text-xs font-mono"
                            style={{ color: C.mutedFg }}
                          >
                            {item.itemId}
                            {item.variantCode
                              ? ` · ${item.variantCode}`
                              : ""}
                          </p>
                        </div>

                        <p
                          className="flex-shrink-0 text-sm font-black"
                          style={{ color: C.orange }}
                        >
                          {money(item.netPrice)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>

          {notFound && (
            <div
              className="mt-6 rounded-2xl p-6 text-center"
              style={{
                background: "rgba(220,38,38,0.06)",
                border: "1.5px solid rgba(220,38,38,0.2)",
              }}
            >
              <p
                className="text-sm font-bold"
                style={{ color: "#dc2626" }}
              >
                Product not found
              </p>

              <p
                className="mt-1 text-xs"
                style={{ color: C.mutedFg }}
              >
                Try a different code or product name.
              </p>
            </div>
          )}

          {selected && (
            <div
              className="mt-6 overflow-hidden rounded-3xl shadow-lg"
              style={{
                background: "white",
                border: `1.5px solid ${C.border}`,
              }}
            >
              <div
                className="px-6 pb-5 pt-6 text-center"
                style={{
                  background:
                    "linear-gradient(135deg,rgba(30,16,78,0.03),rgba(255,101,63,0.05))",
                }}
              >
                <p
                  className="text-base font-black"
                  style={{ color: C.fg }}
                >
                  {selected.name}
                </p>

                {(selected.variantCode || selected.color) && (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: C.mutedFg }}
                  >
                    {[selected.color, selected.variantCode]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}

                <p
                  className="mt-2 inline-block rounded-lg px-2 py-1 text-[11px] font-mono"
                  style={{
                    background: C.muted,
                    color: C.mutedFg,
                  }}
                >
                  {selected.itemId}
                </p>
              </div>

              <div
                className="px-6 py-6 text-center"
                style={{ borderTop: `1px dashed ${C.border}` }}
              >
                {Number(selected.retailPrice) >
                  Number(selected.netPrice) && (
                  <p
                    className="mb-1 text-sm line-through"
                    style={{ color: C.border }}
                  >
                    {money(selected.retailPrice)}
                  </p>
                )}

                <p
                  className="text-4xl font-black"
                  style={{ color: C.orange }}
                >
                  {money(selected.netPrice)}
                </p>

                {Number(selected.retailPrice) >
                  Number(selected.netPrice) && (
                  <span
                    className="mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-black"
                    style={{
                      background: "rgba(22,163,74,0.1)",
                      color: "#16a34a",
                    }}
                  >
                    {discountPct(
                      selected.retailPrice,
                      selected.netPrice
                    )}
                    % off list price
                  </span>
                )}
              </div>

              <div className="flex items-center justify-center px-6 pb-6">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black"
                  style={{
                    background: `${stockTone(selected.stock)}15`,
                    color: stockTone(selected.stock),
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: stockTone(selected.stock),
                    }}
                  />

                  {stockLabel(selected.stock)}
                </span>
              </div>
            </div>
          )}

          {!selected && !notFound && (
            <div className="mt-10 text-center">
              <ScanLine
                size={32}
                className="mx-auto mb-3"
                style={{ color: C.border }}
              />

              <p
                className="text-sm font-bold"
                style={{ color: C.mutedFg }}
              >
                Scan or search a product
              </p>

              <p
                className="mt-1 text-xs"
                style={{ color: C.border }}
              >
                Price will appear here
              </p>
            </div>
          )}

          <div
            className="mt-8 flex items-start gap-2 rounded-xl px-4 py-3"
            style={{ background: C.muted }}
          >
            <Info
              size={13}
              className="mt-0.5 flex-shrink-0"
              style={{ color: C.mutedFg }}
            />

            <p
              className="text-[11px]"
              style={{ color: C.mutedFg }}
            >
              Prices shown are list prices. Promotions and quantity
              discounts are applied at checkout.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}