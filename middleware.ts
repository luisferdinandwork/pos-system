// middleware.ts
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

function getEventIdFromLocalApi(pathname: string) {
  const match = pathname.match(/^\/api\/local\/events\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getEventIdFromCloudApi(pathname: string) {
  const match = pathname.match(/^\/api\/events\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeEventIds(value: unknown, fallback?: unknown) {
  const ids = Array.isArray(value) ? value : [];
  const fallbackId =
    fallback === null || fallback === undefined ? null : Number(fallback);

  return [
    ...new Set(
      [...ids, fallbackId]
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
}

function getCashierHome(eventIds: number[]) {
  if (eventIds.length === 1) return `/pos?event=${eventIds[0]}`;
  return "/pos?select=1";
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname, searchParams } = req.nextUrl;

    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const role = String(token.role);
    const assignedEventIds = normalizeEventIds(
      (token as any).eventIds,
      (token as any).eventId
    );
    const canAccessEvent = (eventId: number | null) =>
      Boolean(eventId && assignedEventIds.includes(Number(eventId)));

    /**
     * Already logged in user should not stay on login.
     */
    if (pathname === "/login") {
      if (role === "admin") {
        return NextResponse.redirect(new URL("/", req.url));
      }

      return NextResponse.redirect(new URL(getCashierHome(assignedEventIds), req.url));
    }

    /**
     * Admin can access everything.
     */
    if (role === "admin") {
      return NextResponse.next();
    }

    /**
     * User must have at least one assigned event.
     */
    if (assignedEventIds.length === 0) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    /**
     * Normal users may not access dashboard/admin pages.
     */
    if (pathname === "/") {
      return NextResponse.redirect(new URL(getCashierHome(assignedEventIds), req.url));
    }

    /**
     * POS route protection.
     * Cashiers may open /pos, /pos?select=1, and assigned /pos?event=ID.
     */
    if (pathname.startsWith("/pos")) {
      const requestedEvent = searchParams.get("event");

      if (!requestedEvent) {
        return NextResponse.next();
      }

      if (!canAccessEvent(Number(requestedEvent))) {
        return NextResponse.redirect(new URL("/pos?select=1", req.url));
      }

      return NextResponse.next();
    }

    /**
     * POS event list for cashiers. The route itself returns only assigned events.
     */
    if (pathname === "/api/pos/events") {
      return NextResponse.next();
    }

    /**
     * Local POS helper APIs used by the selection page.
     * Event-specific local APIs are checked below.
     */
    if (
      pathname === "/api/local/prepared-events" ||
      pathname === "/api/local/pos-state"
    ) {
      return NextResponse.next();
    }

    /**
     * Allow assigned event user to access local SQLite POS APIs for assigned events only.
     */
    if (pathname.startsWith("/api/local/events")) {
      const apiEventId = getEventIdFromLocalApi(pathname);

      if (canAccessEvent(apiEventId)) {
        return NextResponse.next();
      }

      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /**
     * Allow event users to read/use cloud event APIs only for assigned events.
     * /api/events with no id remains admin-only; cashiers use /api/pos/events.
     */
    if (pathname.startsWith("/api/events")) {
      const apiEventId = getEventIdFromCloudApi(pathname);

      if (canAccessEvent(apiEventId)) {
        return NextResponse.next();
      }

      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /**
     * Block all admin pages and other APIs.
     */
    return NextResponse.redirect(new URL(getCashierHome(assignedEventIds), req.url));
  },
  {
    callbacks: {
      authorized: ({ token }) => Boolean(token),
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    /*
      Protect everything except:
      - Next static assets
      - images
      - favicon
      - NextAuth API
    */
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
