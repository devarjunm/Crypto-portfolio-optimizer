import { NextResponse } from 'next/server';
import { fetchMarkets } from '@/lib/coingecko';
import { supportedAssets } from '@/lib/assets';

export const runtime = 'nodejs';

export async function GET() {
  const ids = supportedAssets.map((asset) => asset.id);
  const { assets, source } = await fetchMarkets(ids);
  return NextResponse.json({ assets, source, generatedAt: new Date().toISOString() });
}
