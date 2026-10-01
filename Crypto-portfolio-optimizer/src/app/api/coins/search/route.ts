import { NextRequest, NextResponse } from 'next/server';
import { supportedAssets } from '@/lib/assets';

export const runtime = 'nodejs';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

function headers() {
  const apiKey = process.env.COINGECKO_API_KEY;
  return apiKey ? { 'x-cg-demo-api-key': apiKey } : undefined;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ coins: [] });

  try {
    const params = new URLSearchParams({ query });
    const response = await fetch(`${COINGECKO_BASE_URL}/search?${params.toString()}`, {
      headers: headers(),
      next: { revalidate: 300 }
    });
    if (!response.ok) throw new Error('Search failed');
    const data = await response.json() as { coins?: unknown[] };
    return NextResponse.json({ coins: (data.coins ?? []).slice(0, 12), source: 'coingecko' });
  } catch {
    const lower = query.toLowerCase();
    const coins = supportedAssets
      .filter((coin) => coin.name.toLowerCase().includes(lower) || coin.symbol.toLowerCase().includes(lower) || coin.id.includes(lower))
      .map((coin) => ({ id: coin.id, name: coin.name, symbol: coin.symbol, market_cap_rank: coin.marketCapRank }));
    return NextResponse.json({ coins, source: 'synthetic-fallback' });
  }
}
