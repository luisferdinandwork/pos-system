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

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname, searchParams } = req.nextUrl;

    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const role = String(token.role);
    const assignedEventId =
      token.eventId === null || token.eventId === undefined
        ? null
        : Number(token.eventId);

    /**
     * Already logged in user should not stay on login.
     */
    if (pathname === "/login") {
      if (role === "admin") {
        return NextResponse.redirect(new URL("/", req.url));
      }

      if (assignedEventId) {
        return NextResponse.redirect(
          new URL(`/pos?event=${assignedEventId}`, req.url)
        );
      }
    }

    /**
     * Admin can access everything.
     */
    if (role === "admin") {
      return NextResponse.next();
    }

    /**
     * User must have assigned event.
     */
    if (!assignedEventId) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    /**
     * Normal user may only access POS.
     */
    if (pathname === "/") {
      return NextResponse.redirect(
        new URL(`/pos?event=${assignedEventId}`, req.url)
      );
    }

    /**
     * POS route protection.
     */
    if (pathname.startsWith("/pos")) {
      const requestedEvent = searchParams.get("event");

      if (!requestedEvent) {
        return NextResponse.redirect(
          new URL(`/pos?event=${assignedEventId}`, req.url)
        );
      }

      if (Number(requestedEvent) !== assignedEventId) {
        return NextResponse.redirect(
          new URL(`/pos?event=${assignedEventId}`, req.url)
        );
      }

      return NextResponse.next();
    }

    /**
     * Allow assigned event user to access local SQLite POS APIs for their event only.
     */
    if (pathname.startsWith("/api/local/events")) {
      const apiEventId = getEventIdFromLocalApi(pathname);

      if (apiEventId === assignedEventId) {
        return NextResponse.next();
      }

      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /**
     * Optional: allow event users to read only their assigned cloud event APIs.
     * If you want POS users to be fully local-only, you can remove this block.
     */
    if (pathname.startsWith("/api/events")) {
      const apiEventId = getEventIdFromCloudApi(pathname);

      if (apiEventId && apiEventId === assignedEventId) {
        return NextResponse.next();
      }

      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /**
     * Block all main admin pages and other APIs.
     */
    return NextResponse.redirect(
      new URL(`/pos?event=${assignedEventId}`, req.url)
    );
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