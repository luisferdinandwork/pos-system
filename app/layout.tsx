// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import NavLinks from "@/components/NavLink";

export const metadata: Metadata = {
  title: "POS System",
  description: "Simple local POS system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div className="flex min-h-screen">
          <aside
            className="fixed inset-y-0 left-0 z-50 w-56 flex flex-col border-r shadow-sm"
            style={{ background: "var(--brand-deep)", borderColor: "var(--brand-mid)" }}
          >
            <div className="flex items-center gap-2 px-5 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: "var(--brand-orange)" }}
              >
                P
              </div>
              <div>
                <p className="font-semibold text-sm text-white leading-none">POS System</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--brand-yellow)" }}>Bazar Edition</p>
              </div>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1">
              <NavLinks />
            </nav>

            <div className="px-5 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              <p className="text-xs text-white/40">Local Store POS v1.0</p>
            </div>
          </aside>

          <main className="ml-56 flex-1 min-h-screen">
            <div className="p-6 max-w-6xl mx-auto">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}