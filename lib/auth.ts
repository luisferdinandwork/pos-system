// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyLogin } from "@/lib/auth-users";

function normalizeEventIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((eventId) => Number(eventId))
    .filter((eventId) => Number.isFinite(eventId) && eventId > 0);
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",

      credentials: {
        username: {
          label: "Username",
          type: "text",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        const username = credentials?.username?.trim();
        const password = credentials?.password ?? "";

        if (!username || !password) {
          return null;
        }

        const user = await verifyLogin(username, password);

        if (!user) {
          return null;
        }

        const eventIds = normalizeEventIds((user as any).eventIds);

        return {
          id: String(user.id),
          name: user.name,
          username: user.username,
          role: user.role,
          eventId: user.eventId ?? eventIds[0] ?? null,
          eventIds,
        } as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const eventIds = normalizeEventIds((user as any).eventIds);

        token.id = Number((user as any).id);
        token.username = (user as any).username;
        token.role = (user as any).role;
        token.eventId = (user as any).eventId ?? eventIds[0] ?? null;
        (token as any).eventIds = eventIds;
      }

      return token;
    },

    async session({ session, token }) {
      const eventIds = normalizeEventIds((token as any).eventIds);

      session.user.id = Number(token.id);
      session.user.username = String(token.username);
      session.user.role = String(token.role);
      session.user.eventId =
        token.eventId === null || token.eventId === undefined
          ? eventIds[0] ?? null
          : Number(token.eventId);
      (session.user as any).eventIds = eventIds;

      return session;
    },
  },
};
