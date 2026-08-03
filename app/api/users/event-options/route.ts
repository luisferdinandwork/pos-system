// app/api/users/event-options/route.ts
import { NextResponse } from "next/server";
import { getAllEvents } from "@/lib/events";

export async function GET() {
  const events = await getAllEvents();
  return NextResponse.json(events);
}
