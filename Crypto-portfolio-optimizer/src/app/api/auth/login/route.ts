import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, setSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user = await authenticateUser(String(body.email ?? ''), String(body.password ?? ''));
    await setSession(user);
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign in.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
