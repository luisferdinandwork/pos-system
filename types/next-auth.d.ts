// types/next-auth.d.ts
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: number;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username: string;
      role: string;
      eventId: number | null;
    };
  }

  interface User {
    username: string;
    role: string;
    eventId: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: number;
    username: string;
    role: string;
    eventId: number | null;
  }
}