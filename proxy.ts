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

function getEventIdFromPriceCheckApi(pathname: string) {
  const match = pathname.match(/^\/api\/price-check\/events\/(\d+)/);
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

/**
 * Role home pages:
 * - admin          -> dashboard "/"
 * - user (cashier) -> POS flow
 * - price_checker  -> "/price-check" ONLY, nothing else
 */
function getRoleHome(role: string, eventIds: number[]) {
  if (role === "admin") return "/";
  if (role === "price_checker") return "/price-check";
  return getCashierHome(eventIds);
}

/**
 * Shared handling for /price-check and its APIs.
 * Used by BOTH the cashier ("user") branch and the price_checker branch,
 * since cashiers may also use the price-check page in addition to POS.
 * Returns a NextResponse if this pathname is a price-check route (allowed
 * or forbidden), or null if it's not a price-check route at all — in which
 * case the caller keeps evaluating its own rules.
 */
function handlePriceCheckRoutes(
  pathname: string,
  canAccessEvent: (eventId: number | null) => boolean
): NextResponse | null {
  if (pathname === "/price-check") {
    return NextResponse.next();
  }

  if (pathname === "/api/price-check/events") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/price-check/events/")) {
    const apiEventId = getEventIdFromPriceCheckApi(pathname);

    if (canAccessEvent(apiEventId)) {
      return NextResponse.next();
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

export default withAuth(
  function proxy(req) {
    const token = req.nextauth.token;
    const { pathname, searchParams } = req.nextUrl;

    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const role = String(token.role);
    const assignedEventIds = normalizeEventIds(
      token.eventIds,
      token.eventId
    );
    const canAccessEvent = (eventId: number | null) =>
      Boolean(eventId && assignedEventIds.includes(Number(eventId)));

    /**
     * Already logged in user should not stay on login.
     */
    if (pathname === "/login") {
      return NextResponse.redirect(
        new URL(getRoleHome(role, assignedEventIds), req.url)
      );
    }

    /**
     * Admin can access everything.
     */
    if (role === "admin") {
      return NextResponse.next();
    }

    /**
     * Both non-admin roles need at least one assigned event to do anything.
     */
    if (assignedEventIds.length === 0) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    /**
     * price_checker: ONLY /price-check and its read-only APIs.
     * Everything else — "/", "/pos", local POS APIs, cloud /api/events —
     * redirects back to /price-check. This role never falls through to
     * the cashier logic below.
     */
    if (role === "price_checker") {
      const priceCheckResponse = handlePriceCheckRoutes(pathname, canAccessEvent);

      if (priceCheckResponse) {
        return priceCheckResponse;
      }

      return NextResponse.redirect(new URL("/price-check", req.url));
    }

    /**
     * From here down: role === "user" (cashier).
     */

    /**
     * Cashiers may also use /price-check in addition to POS.
     */
    const priceCheckResponse = handlePriceCheckRoutes(pathname, canAccessEvent);

    if (priceCheckResponse) {
      return priceCheckResponse;
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
