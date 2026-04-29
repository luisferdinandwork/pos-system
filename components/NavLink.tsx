// components/NavLinks.tsx
"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Package, Wallet, CalendarDays,
  Receipt, Warehouse, ShoppingCart, Settings2, Zap,
  ChevronRight,
} from "lucide-react";

// ── Nav structure ─────────────────────────────────────────────────────────────
// Two clear zones:
//   SETUP   — configure the system (do this before events)
//   LIVE    — use during an active event

const SETUP_ITEMS = [
  { href: "/",                label: "Dashboard",       icon: LayoutDashboard, exact: true },
  { href: "/events",          label: "Events",          icon: CalendarDays    },
  { href: "/products",        label: "Products",        icon: Package         },
  { href: "/payment-methods", label: "Payment Methods", icon: Wallet          },
] as const;

// const LIVE_ITEMS = [
//   { href: "/transactions",    label: "Transactions",    icon: Receipt         },
//   { href: "/stock",           label: "Stock",           icon: Warehouse       },
// ] as const;

function NavItem({
  href,
  label,
  icon: Icon,
  exact = false,
  accent = false,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  accent?: boolean;
}) {
  const pathname  = usePathname();
  const isActive  = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative"
      style={{
        background: isActive
          ? accent ? "rgba(255,101,63,0.22)" : "rgba(255,255,255,0.1)"
          : "transparent",
        color: isActive ? "white" : "rgba(255,255,255,0.52)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "rgba(255,255,255,0.07)";
          e.currentTarget.style.color = "rgba(255,255,255,0.85)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.52)";
        }
      }}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
          style={{ background: accent ? "var(--brand-orange)" : "rgba(255,255,255,0.7)" }}
        />
      )}
      <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
      <span className="truncate">{label}</span>
      {isActive && (
        <ChevronRight size={12} className="ml-auto opacity-40" />
      )}
    </Link>
  );
}

export default function NavLinks() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-1 h-full">

      {/* ── SETUP section ──────────────────────────────────────────────────── */}
      <div className="px-3 pt-1 pb-0.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "rgba(255,255,255,0.28)" }}>
          Setup
        </p>
      </div>

      {SETUP_ITEMS.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="mx-3 my-2 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

      {/* ── OPERATIONS section ─────────────────────────────────────────────── */}
      {/* <div className="px-3 pb-0.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "rgba(255,255,255,0.28)" }}>
          Operations
        </p>
      </div> */}

      {/* {LIVE_ITEMS.map((item) => (
        <NavItem key={item.href} {...item} />
      ))} */}

      {/* ── POS Launch — bottom of sidebar ─────────────────────────────────── */}
      {/* Placed at the bottom so it's always reachable, visually distinct */}
      <div className="flex-1" />

      <div className="px-3 pb-4">
        <button
          onClick={() => router.push("/pos")}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3 text-sm font-bold transition-all duration-150 group"
          style={{
            background:  "var(--brand-orange)",
            color:       "white",
            boxShadow:   "0 4px 14px rgba(255,101,63,0.35)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background  = "#ff7043";
            e.currentTarget.style.boxShadow   = "0 6px 20px rgba(255,101,63,0.5)";
            e.currentTarget.style.transform   = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background  = "var(--brand-orange)";
            e.currentTarget.style.boxShadow   = "0 4px 14px rgba(255,101,63,0.35)";
            e.currentTarget.style.transform   = "translateY(0)";
          }}
        >
          <Zap size={15} strokeWidth={2.5} />
          Launch POS
        </button>
      </div>
    </div>
  );
}