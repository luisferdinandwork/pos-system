// components/NavLink.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, LayoutDashboard, Package, Receipt, Warehouse, Wallet } from "lucide-react";

const navItems = [
  { href: "/",             label: "Dashboard",    icon: LayoutDashboard },
  { href: "/pos",          label: "POS",          icon: ShoppingCart },
  { href: "/products",     label: "Products",     icon: Package },
  { href: "/stock",        label: "Stock",        icon: Warehouse },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/payment-methods",  label: "Payment Methods",  icon: Wallet          },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
            style={{
              background: isActive ? "rgba(255,101,63,0.2)" : "transparent",
              color: isActive ? "white" : "rgba(255,255,255,0.6)",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                e.currentTarget.style.color = "white";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "rgba(255,255,255,0.6)";
              }
            }}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </>
  );
}