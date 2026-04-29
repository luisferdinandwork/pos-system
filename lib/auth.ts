// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyLogin } from "@/lib/auth-users";

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

        return {
          id: String(user.id),
          name: user.name,
          username: user.username,
          role: user.role,
          eventId: user.eventId,
        } as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = Number((user as any).id);
        token.username = (user as any).username;
        token.role = (user as any).role;
        token.eventId = (user as any).eventId ?? null;
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = Number(token.id);
      session.user.username = String(token.username);
      session.user.role = String(token.role);
      session.user.eventId =
        token.eventId === null || token.eventId === undefined
          ? null
          : Number(token.eventId);

      return session;
    },
  },
};