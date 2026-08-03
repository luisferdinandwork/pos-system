// components/LogOutButton.tsx
"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function LogOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold"
      style={{
        background: "rgba(255,255,255,0.08)",
        color: "white",
      }}
    >
      <LogOut size={14} />
      Logout
    </button>
  );
}