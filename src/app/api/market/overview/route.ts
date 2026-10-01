import { NextResponse } from 'next/server';
import { supportedAssets } from '@/lib/assets';

export const runtime = 'nodejs';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

type MarketCoin = {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price: number;
  market_cap?: number;
  market_cap_rank?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
};

function headers() {
  const apiKey = process.env.COINGECKO_API_KEY;
  return apiKey ? { 'x-cg-demo-api-key': apiKey } : undefined;
}

async function fetchJson<T>(url: string, revalidate = 90): Promise<T> {
  const response = await fetch(url, { headers: headers(), next: { revalidate } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function fallbackMarkets(): MarketCoin[] {
  return supportedAssets.map((asset, index) => ({
    id: asset.id,
    symbol: asset.symbol.toLowerCase(),
    name: asset.name,
    current_price: [64000, 3400, 145, 590, 0.54, 0.42, 0.12, 14.5][index] ?? 10,
    market_cap: [1_250_000_000_000, 420_000_000_000, 68_000_000_000, 91_000_000_000, 31_000_000_000, 15_000_000_000, 18_000_000_000, 8_500_000_000][index] ?? 1_000_000_000,
    market_cap_rank: asset.marketCapRank,
    total_volume: [28_000_000_000, 16_000_000_000, 3_000_000_000, 1_200_000_000, 1_100_000_000, 430_000_000, 900_000_000, 520_000_000][index] ?? 100_000_000,
    price_change_percentage_24h: [1.8, 0.9, 6.4, -0.6, 2.1, -1.2, 4.8, 3.3][index] ?? 0,
    price_change_percentage_7d_in_currency: [4.2, 2.5, 11.1, -1.8, 3.2, -2.2, 9.1, 6.4][index] ?? 0,
    price_change_percentage_30d_in_currency: [12.6, 8.2, 20.5, 4.2, 7.4, -5.1, 16.8, 10.9][index] ?? 0
  }));
}

export async function GET() {
  let markets: MarketCoin[];
  let source: 'coingecko' | 'synthetic-fallback' = 'coingecko';

  try {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: '100',
      page: '1',
      sparkline: 'false',
      price_change_percentage: '24h,7d,30d'
    });
    markets = await fetchJson<MarketCoin[]>(`${COINGECKO_BASE_URL}/coins/markets?${params.toString()}`);
  } catch {
    markets = fallbackMarkets();
    source = 'synthetic-fallback';
  }

  const sortedByChange = [...markets].filter((coin) => Number.isFinite(coin.price_change_percentage_24h));
  const topGainers = [...sortedByChange].sort((a, b) => (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0)).slice(0, 8);
  const topLosers = [...sortedByChange].sort((a, b) => (a.price_change_percentage_24h ?? 0) - (b.price_change_percentage_24h ?? 0)).slice(0, 8);

  let trending: unknown[] = [];
  try {
    const trendingData = await fetchJson<{ coins: Array<{ item: unknown }> }>(`${COINGECKO_BASE_URL}/search/trending`, 300);
    trending = trendingData.coins.map((coin) => coin.item).slice(0, 8);
  } catch {
    trending = fallbackMarkets().slice(0, 6).map((coin, score) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      market_cap_rank: coin.market_cap_rank,
      score
    }));
  }

  let global = {
    activeCryptocurrencies: markets.length,
    totalMarketCapUsd: markets.reduce((total, coin) => total + (coin.market_cap ?? 0), 0),
    totalVolumeUsd: markets.reduce((total, coin) => total + (coin.total_volume ?? 0), 0),
    btcDominance: markets.find((coin) => coin.id === 'bitcoin')?.market_cap
      ? ((markets.find((coin) => coin.id === 'bitcoin')?.market_cap ?? 0) / Math.max(markets.reduce((total, coin) => total + (coin.market_cap ?? 0), 0), 1)) * 100
      : 0
  };

  try {
    const globalData = await fetchJson<{
      data: {
        active_cryptocurrencies: number;
        total_market_cap: { usd: number };
        total_volume: { usd: number };
        market_cap_percentage: { btc: number };
      };
    }>(`${COINGECKO_BASE_URL}/global`, 300);
    global = {
      activeCryptocurrencies: globalData.data.active_cryptocurrencies,
      totalMarketCapUsd: globalData.data.total_market_cap.usd,
      totalVolumeUsd: globalData.data.total_volume.usd,
      btcDominance: globalData.data.market_cap_percentage.btc
    };
  } catch {
    // fallback already calculated
  }

  let fearGreed = { value: 52, classification: 'Neutral', source: 'fallback' };
  try {
    const data = await fetch('https://api.alternative.me/fng/?limit=1', { next: { revalidate: 60 * 60 } });
    if (data.ok) {
      const parsed = (await data.json()) as { data?: Array<{ value: string; value_classification: string }> };
      const latest = parsed.data?.[0];
      if (latest) {
        fearGreed = {
          value: Number(latest.value),
          classification: latest.value_classification,
          source: 'alternative.me'
        };
      }
    }
  } catch {
    // keep fallback
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    source,
    global,
    fearGreed,
    markets: markets.slice(0, 30),
    topGainers,
    topLosers,
    trending
  });
}
