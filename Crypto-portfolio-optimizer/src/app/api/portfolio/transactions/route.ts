import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addTransaction, getPortfolioSnapshot } from '@/lib/portfolio';
import type { TransactionType } from '@/lib/portfolio';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please login to add transactions.' }, { status: 401 });
    const body = await request.json();
    await addTransaction(user.id, {
      assetId: String(body.assetId ?? ''),
      type: String(body.type ?? 'buy') as TransactionType,
      quantity: Number(body.quantity),
      price: Number(body.price),
      fee: Number(body.fee ?? 0),
      date: body.date ? String(body.date) : undefined,
      notes: body.notes ? String(body.notes) : undefined
    });
    return NextResponse.json(await getPortfolioSnapshot(user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add transaction.' }, { status: 400 });
  }
}
