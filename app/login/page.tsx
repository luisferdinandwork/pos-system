// app/login/page.tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Lock, User, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setErr("");

    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!res || res.error) {
      setErr("Invalid username or password.");
      return;
    }

    /**
     * Ask the server where this user should go.
     */
    const me = await fetch("/api/auth/me").then((r) => r.json());

    if (me.role === "admin") {
      router.push("/");
      router.refresh();
      return;
    }

    if (me.eventId) {
      router.push(`/pos?event=${me.eventId}`);
      router.refresh();
      return;
    }

    setErr("This user is not assigned to an event.");
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--brand-deep)" }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "var(--brand-orange)", color: "white" }}
          >
            <Zap size={26} />
          </div>

          <h1 className="text-3xl font-black text-white">POS Login</h1>

          <p className="text-sm mt-2" style={{ color: "#9ca3af" }}>
            Login to access your event POS system.
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl p-6 space-y-4"
          style={{
            background: "white",
            boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          }}
        >
          <div>
            <label
              className="block text-xs font-bold uppercase tracking-widest mb-2"
              style={{ color: "#6b7280" }}
            >
              Username
            </label>

            <div className="relative">
              <User
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "#9ca3af" }}
              />

              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                className="w-full rounded-xl pl-10 pr-3 py-3 text-sm outline-none"
                style={{
                  background: "#f9fafb",
                  border: "1.5px solid #e5e7eb",
                  color: "#111827",
                }}
                placeholder="admin or cashier username"
              />
            </div>
          </div>

          <div>
            <label
              className="block text-xs font-bold uppercase tracking-widest mb-2"
              style={{ color: "#6b7280" }}
            >
              Password
            </label>

            <div className="relative">
              <Lock
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "#9ca3af" }}
              />

              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="w-full rounded-xl pl-10 pr-3 py-3 text-sm outline-none"
                style={{
                  background: "#f9fafb",
                  border: "1.5px solid #e5e7eb",
                  color: "#111827",
                }}
                placeholder="••••••••"
              />
            </div>
          </div>

          {err && (
            <div
              className="rounded-xl px-4 py-3 text-sm font-semibold"
              style={{
                background: "#fef2f2",
                color: "#dc2626",
              }}
            >
              {err}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full rounded-xl py-3.5 text-sm font-black disabled:opacity-60"
            style={{
              background: "var(--brand-orange)",
              color: "white",
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </main>
  );
}