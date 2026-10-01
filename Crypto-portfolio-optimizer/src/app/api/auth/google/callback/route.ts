import { NextRequest, NextResponse } from 'next/server';
import { createOrGetOAuthUser, setSession } from '@/lib/auth';

export const runtime = 'nodejs';

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const savedState = request.cookies.get('google_oauth_state')?.value;

  try {
    if (!clientId || !clientSecret) throw new Error('Google Login is not configured.');
    if (!code) throw new Error('Google did not return an authorization code.');
    if (!state || !savedState || state !== savedState) throw new Error('Invalid Google OAuth state.');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error || 'Unable to exchange Google authorization code.');
    }

    const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!userInfoResponse.ok) throw new Error('Unable to load Google profile.');
    const profile = await userInfoResponse.json() as GoogleUserInfo;
    if (!profile.email) throw new Error('Google account did not provide an email address.');

    const user = await createOrGetOAuthUser({
      provider: 'google',
      providerId: profile.sub,
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      image: profile.picture,
      emailVerified: Boolean(profile.email_verified)
    });
    await setSession(user);

    const response = NextResponse.redirect(`${appUrl}/?auth=google_success`);
    response.cookies.delete('google_oauth_state');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Login failed.';
    return NextResponse.redirect(`${appUrl}/?authError=${encodeURIComponent(message)}`);
  }
}
