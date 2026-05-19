// components/events/CashierSessionsTab.tsx
// Admin-facing tab inside the event detail page.
// Flow:
//   1. Admin sees all registered POS users for this event (from auth_users)
//   2. Admin picks a user, enters opening cash, and opens a session
//   3. Session is created in Neon cashier_sessions
//   4. When the cashier opens POS, their active session is fetched and used
//   5. Admin can close sessions from here too
"use client";

import { useEffect, useState } from "react";
import {
  Plus, RefreshCw, LogIn, LogOut, User,
  Clock, Banknote, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { formatRupiah, formatDate, formatRupiahInput, parseRupiahInput } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type EventUser = {
  id: number;
  name: string;
  username: string;
  role: string;
  isActive: boolean;
};

type CashierSession = {
  id: number;
  eventId: number;
  cashierName: string;
  openingCash: string;
  closingCash: string | null;
  openedAt: string | null;
  closedAt: string | null;
  notes: string | null;
};

type Props = {
  eventId: number;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CashierSessionsTab({ eventId }: Props) {
  const [sessions,     setSessions]     = useState<CashierSession[]>([]);
  const [users,        setUsers]        = useState<EventUser[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [closingId,    setClosingId]    = useState<number | null>(null);
  const [expandedId,   setExpandedId]   = useState<number | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  // Form state
  const [selectedUser,  setSelectedUser]  = useState<EventUser | null>(null);
  const [openingCash,   setOpeningCash]   = useState("");
  const [notes,         setNotes]         = useState("");

  // Close session state
  const [closingCash,   setClosingCash]   = useState("");
  const [closingNotes,  setClosingNotes]  = useState("");

  const C = {
    border:  "var(--border)",
    muted:   "var(--muted)",
    mutedFg: "var(--muted-foreground)",
    fg:      "var(--foreground)",
    orange:  "var(--brand-orange)",
    deep:    "var(--brand-deep)",
    mid:     "var(--brand-mid)",
    sec:     "var(--secondary)",
    secFg:   "var(--secondary-foreground)",
    card:    "var(--card)",
  };

  // ── Data loading ─────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sessionsRes, usersRes] = await Promise.all([
        fetch(`/api/events/${eventId}/cashier-sessions`, { cache: "no-store" }),
        fetch(`/api/events/${eventId}/users`, { cache: "no-store" }),
      ]);
      const sessionsData = await sessionsRes.json();
      const usersData    = await usersRes.json();
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      setUsers(Array.isArray(usersData) ? usersData.filter((u: EventUser) => u.isActive) : []);
    } catch {
      setError("Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [eventId]);

  // ── Open session ──────────────────────────────────────────────────────────

  async function handleOpenSession(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/cashier-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashierName:  selectedUser.name,
          cashierUserId: selectedUser.id,
          openingCash:  parseRupiahInput(openingCash),
          notes:        notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to open session");
      setShowForm(false);
      setSelectedUser(null);
      setOpeningCash("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open session");
    } finally {
      setSaving(false);
    }
  }

  // ── Close session ─────────────────────────────────────────────────────────

  async function handleCloseSession(sessionId: number) {
    setClosingId(sessionId);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/cashier-sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closingCash:  parseRupiahInput(closingCash) || null,
          notes:        closingNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to close session");
      setExpandedId(null);
      setClosingCash("");
      setClosingNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close session");
    } finally {
      setClosingId(null);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const openSessions   = sessions.filter(s => !s.closedAt);
  const closedSessions = sessions.filter(s => s.closedAt);

  // Users who already have an open session (can't open a second one)
  const activeUserNames = new Set(openSessions.map(s => s.cashierName));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold"
          style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.2)" }}>
          <AlertCircle size={14} className="flex-shrink-0" />{error}
        </div>
      )}

      {/* ── Active sessions ── */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: C.card, borderColor: C.border }}>
        <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(22,163,74,0.08)", color: "#16a34a" }}>
              <User size={16} />
            </div>
            <div>
              <p className="text-sm font-black" style={{ color: C.fg }}>Active Sessions</p>
              <p className="text-xs" style={{ color: C.mutedFg }}>
                {openSessions.length} cashier{openSessions.length !== 1 ? "s" : ""} currently on shift
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="p-2 rounded-xl border disabled:opacity-50 transition-all hover:bg-black/5"
              style={{ borderColor: C.border, color: C.mutedFg }}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => { setShowForm(true); setSelectedUser(null); setOpeningCash(""); setNotes(""); setError(null); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: "var(--brand-orange)", color: "white" }}>
              <Plus size={14} /> Open Session
            </button>
          </div>
        </div>

        {/* Open session form */}
        {showForm && (
          <form onSubmit={handleOpenSession}
            className="px-5 py-5 space-y-4"
            style={{ borderBottom: `1px solid ${C.border}`, background: C.muted }}>
            <p className="text-xs font-black uppercase tracking-widest" style={{ color: C.mutedFg }}>
              New Cashier Session
            </p>

            {/* User picker */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-2"
                style={{ color: C.mutedFg }}>
                Assign Cashier *
              </label>
              {users.length === 0 ? (
                <div className="rounded-xl px-4 py-3 text-xs" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.mutedFg }}>
                  No active POS users for this event. Add users in the Users tab first.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {users.map(user => {
                    const hasOpenSession = activeUserNames.has(user.name);
                    const selected = selectedUser?.id === user.id;
                    return (
                      <button key={user.id} type="button"
                        disabled={hasOpenSession}
                        onClick={() => setSelectedUser(user)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background:   selected ? "rgba(255,101,63,0.06)" : C.card,
                          border:       `1.5px solid ${selected ? "var(--brand-orange)" : C.border}`,
                        }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: selected ? "rgba(255,101,63,0.12)" : C.muted, color: selected ? "var(--brand-orange)" : C.mutedFg }}>
                          <User size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black truncate" style={{ color: selected ? "var(--brand-orange)" : C.fg }}>{user.name}</p>
                          <p className="text-[10px] font-mono truncate" style={{ color: C.mutedFg }}>{user.username}</p>
                        </div>
                        {hasOpenSession && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>On shift</span>
                        )}
                        {selected && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--brand-orange)" }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Opening cash */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                style={{ color: C.mutedFg }}>Opening Cash (optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black"
                  style={{ color: C.mutedFg }}>Rp</span>
                <input inputMode="numeric" value={openingCash}
                  onChange={e => setOpeningCash(formatRupiahInput(e.target.value))}
                  placeholder="0"
                  className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm font-mono font-bold focus:outline-none"
                  style={{ border: `1px solid ${C.border}`, color: C.fg, background: C.card }} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                style={{ color: C.mutedFg }}>Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Morning shift, Counter 1…"
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                style={{ border: `1px solid ${C.border}`, color: C.fg, background: C.card }} />
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving || !selectedUser}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black disabled:opacity-40 transition-all hover:opacity-90"
                style={{ background: "var(--brand-orange)", color: "white" }}>
                <LogIn size={14} />{saving ? "Opening…" : "Open Session"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError(null); }}
                className="px-5 py-2.5 rounded-xl text-sm font-bold border transition-all hover:bg-white"
                style={{ borderColor: C.border, color: C.secFg, background: C.card }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Active session list */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2">
            <RefreshCw size={16} className="animate-spin" style={{ color: C.border }} />
            <p className="text-sm" style={{ color: C.mutedFg }}>Loading…</p>
          </div>
        ) : openSessions.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: C.muted }}>
              <User size={20} style={{ color: C.border }} />
            </div>
            <p className="text-sm font-black" style={{ color: C.mutedFg }}>No active sessions</p>
            <p className="text-xs mt-1" style={{ color: C.border }}>Open a session to assign a cashier to this event.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: C.border }}>
            {openSessions.map(session => {
              const isExpanding = expandedId === session.id;
              const isClosing   = closingId === session.id;
              return (
                <div key={session.id}>
                  {/* Session row */}
                  <div className="px-5 py-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(22,163,74,0.08)", color: "#16a34a" }}>
                      <User size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black" style={{ color: C.fg }}>{session.cashierName}</p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
                          <CheckCircle2 size={9} /> On shift
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 text-xs" style={{ color: C.mutedFg }}>
                          <Clock size={10} /> Since {formatDate(session.openedAt)}
                        </span>
                        <span className="flex items-center gap-1 text-xs" style={{ color: C.mutedFg }}>
                          <Banknote size={10} /> Opening: {formatRupiah(session.openingCash)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanding ? null : session.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-red-50"
                      style={{ borderColor: "rgba(220,38,38,0.25)", color: "#dc2626", background: "rgba(220,38,38,0.04)" }}>
                      <LogOut size={12} />
                      Close
                      {isExpanding ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                  </div>

                  {/* Close session inline form */}
                  {isExpanding && (
                    <div className="px-5 pb-4 space-y-3" style={{ background: C.muted }}>
                      <p className="text-[10px] font-black uppercase tracking-widest pt-3" style={{ color: C.mutedFg }}>
                        Close Session — {session.cashierName}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                            style={{ color: C.mutedFg }}>Closing Cash (optional)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black"
                              style={{ color: C.mutedFg }}>Rp</span>
                            <input inputMode="numeric" value={closingCash}
                              onChange={e => setClosingCash(formatRupiahInput(e.target.value))}
                              placeholder="0"
                              className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm font-mono font-bold focus:outline-none"
                              style={{ border: `1px solid ${C.border}`, color: C.fg, background: C.card }} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                            style={{ color: C.mutedFg }}>Notes (optional)</label>
                          <input value={closingNotes} onChange={e => setClosingNotes(e.target.value)}
                            placeholder="End of shift notes…"
                            className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                            style={{ border: `1px solid ${C.border}`, color: C.fg, background: C.card }} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleCloseSession(session.id)} disabled={isClosing}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black disabled:opacity-50 transition-all hover:opacity-90"
                          style={{ background: "#dc2626", color: "white" }}>
                          <LogOut size={12} />{isClosing ? "Closing…" : "Confirm Close"}
                        </button>
                        <button onClick={() => { setExpandedId(null); setClosingCash(""); setClosingNotes(""); }}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold border transition-all hover:bg-white"
                          style={{ borderColor: C.border, color: C.secFg, background: C.card }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Closed sessions history ── */}
      {closedSessions.length > 0 && (
        <div className="rounded-2xl border overflow-hidden" style={{ background: C.card, borderColor: C.border }}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
            <p className="text-sm font-black" style={{ color: C.fg }}>Session History</p>
            <p className="text-xs mt-0.5" style={{ color: C.mutedFg }}>{closedSessions.length} closed session{closedSessions.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y" style={{ borderColor: C.border }}>
            {closedSessions.map(session => (
              <div key={session.id} className="px-5 py-3.5 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: C.muted, color: C.mutedFg }}>
                  <User size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: C.fg }}>{session.cashierName}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs" style={{ color: C.mutedFg }}>
                      {formatDate(session.openedAt)} → {formatDate(session.closedAt)}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold" style={{ color: C.mutedFg }}>
                    Open: {formatRupiah(session.openingCash)}
                  </p>
                  {session.closingCash && (
                    <p className="text-xs font-bold" style={{ color: C.fg }}>
                      Close: {formatRupiah(session.closingCash)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}