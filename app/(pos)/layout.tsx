// app/(pos)/layout.tsx
// The POS route group gets ZERO chrome — no sidebar, no topbar, no padding.
// The POS page owns the entire viewport and manages its own navigation.
// URL: /pos  (route group folders don't appear in URLs)

export default function POSLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 h-dvh w-dvw overflow-hidden">
      {children}
    </div>
  );
}
