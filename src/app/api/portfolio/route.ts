import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPortfolioSnapshot } from '@/lib/portfolio';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Please login to view your portfolio.' }, { status: 401 });
  const snapshot = await getPortfolioSnapshot(user.id);
  return NextResponse.json(snapshot);
}
