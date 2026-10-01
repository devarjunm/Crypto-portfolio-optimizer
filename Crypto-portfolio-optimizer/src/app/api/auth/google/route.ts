import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!clientId) {
    return NextResponse.redirect(`${appUrl}/?authError=${encodeURIComponent('Google Login is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local.')}`);
  }

  const state = randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60
  });
  return response;
}
