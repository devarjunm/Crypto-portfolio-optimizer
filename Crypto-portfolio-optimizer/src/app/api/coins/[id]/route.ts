import { NextRequest, NextResponse } from 'next/server';
import { generateSyntheticHistory, fetchHistoricalSeries } from '@/lib/coingecko';
import { supportedAssets } from '@/lib/assets';

export const runtime = 'nodejs';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

function headers() {
  const apiKey = process.env.COINGECKO_API_KEY;
  return apiKey ? { 'x-cg-demo-api-key': apiKey } : undefined;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const [detailsResponse, history] = await Promise.all([
      fetch(`${COINGECKO_BASE_URL}/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`, {
        headers: headers(),
        next: { revalidate: 180 }
      }),
      fetchHistoricalSeries(id, 30)
    ]);

    if (!detailsResponse.ok) throw new Error('Coin not found');
    const details = await detailsResponse.json();
    return NextResponse.json({ details, history: history.series.points, source: history.source === 'coingecko' ? 'coingecko' : 'mixed' });
  } catch {
    const asset = supportedAssets.find((coin) => coin.id === id) ?? {
      id,
      name: id.replace(/-/g, ' '),
      symbol: id.slice(0, 5).toUpperCase(),
      currentPrice: 0
    };
    const history = generateSyntheticHistory(id, 30).points;
    return NextResponse.json({
      source: 'synthetic-fallback',
      history,
      details: {
        id,
        symbol: asset.symbol.toLowerCase(),
        name: asset.name,
        market_cap_rank: asset.marketCapRank,
        market_data: {
          current_price: { usd: history.at(-1)?.price ?? asset.currentPrice ?? 0 },
          market_cap: { usd: 0 },
          total_volume: { usd: 0 },
          circulating_supply: 0,
          max_supply: null,
          ath: { usd: Math.max(...history.map((point) => point.price)) },
          atl: { usd: Math.min(...history.map((point) => point.price)) },
          price_change_percentage_24h: 0,
          price_change_percentage_7d: 0,
          price_change_percentage_30d: 0
        }
      }
    });
  }
}
