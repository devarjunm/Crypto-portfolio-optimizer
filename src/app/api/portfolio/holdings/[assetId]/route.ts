import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteHolding, getPortfolioSnapshot, upsertHolding } from '@/lib/portfolio';

export const runtime = 'nodejs';

export async function PUT(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please login to edit holdings.' }, { status: 401 });
    const { assetId } = await context.params;
    const body = await request.json();
    await upsertHolding(user.id, {
      assetId,
      quantity: Number(body.quantity),
      averageBuyPrice: Number(body.averageBuyPrice)
    });
    return NextResponse.json(await getPortfolioSnapshot(user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update holding.' }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please login to delete holdings.' }, { status: 401 });
    const { assetId } = await context.params;
    await deleteHolding(user.id, assetId);
    return NextResponse.json(await getPortfolioSnapshot(user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete holding.' }, { status: 400 });
  }
}
