// components/events/EventUsersPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, User, KeyRound } from "lucide-react";

type EventUser = {
  id: number;
  name: string;
  username: string;
  role: string;
  eventId: number | null;
  isActive: boolean;
};

type Props = {
  eventId: number;
};

export function EventUsersPanel({ eventId }: Props) {
  const [users, setUsers] = useState<EventUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function load() {
    setLoading(true);

    const data = await fetch(`/api/events/${eventId}/users`, {
      cache: "no-store",
    }).then((r) => r.json());

    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !username.trim() || !password.trim()) return;

    setSaving(true);

    const res = await fetch(`/api/events/${eventId}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, username, password }),
    });

    setSaving(false);

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to create user");
      return;
    }

    setName("");
    setUsername("");
    setPassword("");
    load();
  }

  async function toggleUser(user: EventUser) {
    await fetch(`/api/events/${eventId}/users`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: user.id,
        isActive: !user.isActive,
      }),
    });

    load();
  }

  async function deleteUser(user: EventUser) {
    if (!confirm(`Delete user ${user.username}?`)) return;

    await fetch(`/api/events/${eventId}/users?id=${user.id}`, {
      method: "DELETE",
    });

    load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <form
        onSubmit={createUser}
        className="rounded-2xl border p-5 space-y-4"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div>
          <h3
            className="text-sm font-bold"
            style={{ color: "var(--foreground)" }}
          >
            Add Event POS User
          </h3>

          <p
            className="text-xs mt-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            This user can only login to this event POS.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label
              className="block text-xs font-semibold uppercase tracking-wider mb-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              Name
            </label>

            <div className="relative">
              <User
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--muted-foreground)" }}
              />

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
                placeholder="Cashier 1"
              />
            </div>
          </div>

          <div>
            <label
              className="block text-xs font-semibold uppercase tracking-wider mb-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              Username
            </label>

            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
                background: "var(--input, var(--card))",
              }}
              placeholder="cashier_event_1"
            />
          </div>

          <div>
            <label
              className="block text-xs font-semibold uppercase tracking-wider mb-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              Password
            </label>

            <div className="relative">
              <KeyRound
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--muted-foreground)" }}
              />

              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
                placeholder="••••••••"
              />
            </div>
          </div>
        </div>

        <button
          disabled={saving}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
          style={{
            background: "var(--brand-orange)",
            color: "white",
          }}
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          {saving ? "Creating..." : "Create POS User"}
        </button>
      </form>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h3
              className="text-sm font-bold"
              style={{ color: "var(--foreground)" }}
            >
              Event Users
            </h3>

            <p
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Users assigned to this event.
            </p>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-xl border"
            style={{
              borderColor: "var(--border)",
              color: "var(--muted-foreground)",
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {users.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              No POS users yet.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {users.map((user) => (
              <div
                key={user.id}
                className="px-5 py-4 flex items-center gap-3"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(255,101,63,0.10)",
                    color: "var(--brand-orange)",
                  }}
                >
                  <User size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-bold truncate"
                    style={{ color: "var(--foreground)" }}
                  >
                    {user.name}
                  </p>

                  <p
                    className="text-xs font-mono"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {user.username}
                  </p>
                </div>

                <button
                  onClick={() => toggleUser(user)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold"
                  style={{
                    background: user.isActive
                      ? "rgba(22,163,74,0.10)"
                      : "rgba(107,114,128,0.12)",
                    color: user.isActive ? "#16a34a" : "#6b7280",
                  }}
                >
                  {user.isActive ? "Active" : "Disabled"}
                </button>

                <button
                  onClick={() => deleteUser(user)}
                  className="p-2 rounded-xl"
                  style={{
                    background: "rgba(220,38,38,0.10)",
                    color: "#dc2626",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}