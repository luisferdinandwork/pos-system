// app/(main)/layout.tsx
import NavLinks from "@/components/NavLink";
import { LocalPOSFloatingButton } from "@/components/LocalPOSFloatingButton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LogOutButton } from "@/components/LogOutButton";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "admin") {
    redirect(`/pos?event=${session.user.eventId}`);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        id="app-sidebar"
        className="w-56 flex-shrink-0 flex flex-col h-screen overflow-hidden"
        style={{ background: "var(--brand-deep)" }}
      >
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

        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <NavLinks />
        </div>

        <div className="p-3">
          <LogOutButton />
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <main className="flex-1 overflow-y-auto p-6">{children}</main>

        <LocalPOSFloatingButton />
      </div>
    </div>
  );
}