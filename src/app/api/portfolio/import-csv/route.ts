import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPortfolioSnapshot, importCsvHoldings } from '@/lib/portfolio';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please login to import portfolio CSV.' }, { status: 401 });
    const body = await request.json();
    const result = await importCsvHoldings(user.id, String(body.csv ?? ''));
    return NextResponse.json({ ...await getPortfolioSnapshot(user.id), importResult: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to import CSV.' }, { status: 400 });
  }
}
