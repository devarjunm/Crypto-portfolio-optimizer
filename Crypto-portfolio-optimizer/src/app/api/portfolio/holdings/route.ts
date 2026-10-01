import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPortfolioSnapshot, upsertHolding } from '@/lib/portfolio';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please login to add holdings.' }, { status: 401 });
    const body = await request.json();
    await upsertHolding(user.id, {
      assetId: String(body.assetId ?? ''),
      quantity: Number(body.quantity),
      averageBuyPrice: Number(body.averageBuyPrice)
    });
    return NextResponse.json(await getPortfolioSnapshot(user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save holding.' }, { status: 400 });
  }
}
