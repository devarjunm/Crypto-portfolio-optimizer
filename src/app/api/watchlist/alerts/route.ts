import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addPriceAlert, deletePriceAlert } from '@/lib/watchlist';
import type { AlertDirection } from '@/lib/watchlist';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please login to add price alerts.' }, { status: 401 });
    const body = await request.json();
    return NextResponse.json(await addPriceAlert(user.id, {
      assetId: String(body.assetId ?? ''),
      direction: String(body.direction ?? 'above') as AlertDirection,
      targetPrice: Number(body.targetPrice)
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add price alert.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please login to delete price alerts.' }, { status: 401 });
    const alertId = request.nextUrl.searchParams.get('alertId') ?? '';
    return NextResponse.json(await deletePriceAlert(user.id, alertId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete price alert.' }, { status: 400 });
  }
}
