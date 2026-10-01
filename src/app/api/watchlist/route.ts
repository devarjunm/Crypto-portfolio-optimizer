import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addWatchCoin, getWatchlistSnapshot, removeWatchCoin } from '@/lib/watchlist';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Please login to use watchlist.' }, { status: 401 });
  return NextResponse.json(await getWatchlistSnapshot(user.id));
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please login to add watchlist coins.' }, { status: 401 });
    const body = await request.json();
    return NextResponse.json(await addWatchCoin(user.id, String(body.assetId ?? '')));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add watchlist coin.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please login to remove watchlist coins.' }, { status: 401 });
    const assetId = request.nextUrl.searchParams.get('assetId') ?? '';
    return NextResponse.json(await removeWatchCoin(user.id, assetId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to remove watchlist coin.' }, { status: 400 });
  }
}
