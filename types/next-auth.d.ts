// types/next-auth.d.ts
import "next-auth";
import "next-auth/jwt";

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
      eventIds: number[];
    };
  }

  interface User {
    username?: string;
    role?: string;
    eventId?: number | null;
    eventIds?: number[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: number;
    username?: string;
    role?: string;
    eventId?: number | null;
    eventIds?: number[];
  }
}
