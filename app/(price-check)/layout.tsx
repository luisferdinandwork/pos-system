// app/(price-check)/layout.tsx
import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

const ALLOWED_ROLES = new Set(["admin", "user", "price_checker"]);

export default async function PriceCheckLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fprice-check");
  }

  const role = String(session.user.role ?? "");

  if (!ALLOWED_ROLES.has(role)) {
    redirect("/");
  }

  return <>{children}</>;
}