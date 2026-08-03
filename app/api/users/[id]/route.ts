// app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
import { deleteAuthUser, updateAuthUser } from "@/lib/auth-users";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = parseId(id);

  if (!userId) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    const body = await request.json();

    const user = await updateAuthUser(userId, {
      name: body.name,
      username: body.username,
      password: body.password,
      role: body.role === "admin" ? "admin" : body.role === "user" ? "user" : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });

    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = parseId(id);

  if (!userId) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  await deleteAuthUser(userId);
  return NextResponse.json({ ok: true });
}
