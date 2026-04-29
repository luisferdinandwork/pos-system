// app/layout.tsx
// ROOT LAYOUT — only provides <html> and <body>.
// NO sidebar, NO nav, NO padding here.
//
// Layout chrome is handled by route groups:
//   app/(main)/layout.tsx  → sidebar + topbar for all normal pages
//   app/(pos)/layout.tsx   → bare full-viewport shell for /pos
//
// This file wraps BOTH groups, so it must stay minimal.

import type { Metadata } from "next";
import "./globals.css";

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
        {/* DM Sans for the main app UI */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&display=swap"
          rel="stylesheet"
        />
        {/* DM Mono for the POS terminal */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: "var(--background)", color: "var(--foreground)" }}>
        {children}
      </body>
    </html>
  );
}