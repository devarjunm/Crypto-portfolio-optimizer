import { NextRequest, NextResponse } from 'next/server';
import { createUser, setSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user = await createUser({
      name: String(body.name ?? ''),
      email: String(body.email ?? ''),
      password: String(body.password ?? '')
    });
    await setSession(user);
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
