// app/(main)/layout.tsx
// All pages EXCEPT /pos live inside this route group.
// They get the sidebar + topbar chrome.
//
// MIGRATION: Move these folders into app/(main)/:
//   app/dashboard  → app/(main)/dashboard  (or keep app/(main)/page.tsx for "/")
//   app/events     → app/(main)/events
//   app/products   → app/(main)/products
//   app/stock      → app/(main)/stock
//   app/transactions → app/(main)/transactions
//   app/payment-methods → app/(main)/payment-methods
//
// Your existing app/layout.tsx content goes here.
// The root app/layout.tsx should only contain <html><body> and import global CSS.

import NavLinks from "@/components/NavLink";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        id="app-sidebar"
        className="w-56 flex-shrink-0 flex flex-col h-screen overflow-hidden"
        style={{ background: "var(--brand-deep)" }}
      >
        {/* Logo */}
        <div className="px-5 py-5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
              style={{ background: "var(--brand-orange)", color: "white" }}
            >
              P
            </div>
            <span className="font-bold text-sm tracking-tight text-white">
              POS System
            </span>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <NavLinks />
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        {/* <header
          id="app-topbar"
          className="h-14 flex-shrink-0 flex items-center px-6 border-b"
          style={{
            background:   "var(--card)",
            borderColor:  "var(--border)",
          }}
        >
          <div className="flex-1" />
        </header> */}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}