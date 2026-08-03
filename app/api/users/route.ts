// app/api/users/route.ts
import { NextResponse } from "next/server";
import { createAuthUser, getAllAuthUsersWithEvents } from "@/lib/auth-users";

export async function GET() {
  const users = await getAllAuthUsersWithEvents();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const user = await createAuthUser({
      name: body.name,
      username: body.username,
      password: body.password,
      role: body.role === "admin" ? "admin" : "user",
      eventId: body.eventId ? Number(body.eventId) : null,
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create user." },
      { status: 400 }
    );
  }
}
