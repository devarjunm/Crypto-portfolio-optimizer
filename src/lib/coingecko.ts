import { supportedAssets } from '@/lib/assets';
import type { HistoricalSeries, MarketAsset, PricePoint } from '@/types/portfolio';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const DEFAULT_IDS = supportedAssets.map((asset) => asset.id);

function headers() {
  const apiKey = process.env.COINGECKO_API_KEY;
  return apiKey ? { 'x-cg-demo-api-key': apiKey } : undefined;
}

function fallbackAsset(id: string): MarketAsset {
  return supportedAssets.find((asset) => asset.id === id) ?? {
    id,
    symbol: id.slice(0, 6).toUpperCase(),
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    currentPrice: 0
  };
}

export async function fetchMarkets(ids = DEFAULT_IDS): Promise<{ assets: MarketAsset[]; source: 'coingecko' | 'synthetic-fallback' }> {
  const params = new URLSearchParams({
    vs_currency: 'usd',
    ids: ids.join(','),
    order: 'market_cap_desc',
    per_page: String(Math.max(ids.length, 1)),
    page: '1',
    sparkline: 'false',
    price_change_percentage: '24h'
  });

  try {
    const response = await fetch(`${COINGECKO_BASE_URL}/coins/markets?${params.toString()}`, {
      headers: headers(),
      next: { revalidate: 90 }
    });

    if (!response.ok) {
      throw new Error(`CoinGecko markets request failed: ${response.status}`);
    }

    const data = (await response.json()) as Array<{
      id: string;
      symbol: string;
      name: string;
      image?: string;
      current_price: number;
      market_cap_rank?: number;
      price_change_percentage_24h?: number;
    }>;

    const assets = ids.map((id) => {
      const coin = data.find((entry) => entry.id === id);
      if (!coin) return fallbackAsset(id);
      return {
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        image: coin.image,
        currentPrice: coin.current_price,
        marketCapRank: coin.market_cap_rank,
        priceChange24h: coin.price_change_percentage_24h
      } satisfies MarketAsset;
    });

    return { assets, source: 'coingecko' };
  } catch {
    return {
      assets: ids.map((id, index) => ({
        ...fallbackAsset(id),
        currentPrice: syntheticBasePrice(id, index)
      })),
      source: 'synthetic-fallback'
    };
  }
}

export async function fetchHistoricalSeries(id: string, days = 365): Promise<{ series: HistoricalSeries; source: 'coingecko' | 'synthetic-fallback' }> {
  const params = new URLSearchParams({ vs_currency: 'usd', days: String(days), interval: 'daily' });

  try {
    const response = await fetch(`${COINGECKO_BASE_URL}/coins/${id}/market_chart?${params.toString()}`, {
      headers: headers(),
      next: { revalidate: 60 * 30 }
    });

    if (!response.ok) {
      throw new Error(`CoinGecko history request failed for ${id}: ${response.status}`);
    }

    const data = (await response.json()) as { prices?: Array<[number, number]> };
    const points = dedupeDailyPoints(
      (data.prices ?? [])
        .filter(([, price]) => Number.isFinite(price) && price > 0)
        .map(([timestamp, price]) => ({ date: new Date(timestamp).toISOString().slice(0, 10), price }))
    );

    if (points.length < 60) {
      throw new Error(`Insufficient historical prices for ${id}`);
    }

    return { series: { id, points }, source: 'coingecko' };
  } catch {
    return { series: generateSyntheticHistory(id, days), source: 'synthetic-fallback' };
  }
}

function dedupeDailyPoints(points: PricePoint[]) {
  const byDate = new Map<string, PricePoint>();
  points.forEach((point) => byDate.set(point.date, point));
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function syntheticBasePrice(id: string, index: number) {
  const bases: Record<string, number> = {
    bitcoin: 64000,
    ethereum: 3400,
    solana: 145,
    binancecoin: 590,
    ripple: 0.54,
    cardano: 0.42,
    dogecoin: 0.12,
    chainlink: 14.5
  };
  return bases[id] ?? 10 + index * 7;
}

function deterministicNoise(id: string, day: number) {
  let hash = 2166136261;
  const input = `${id}:${day}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295 - 0.5) * 2;
}

export function generateSyntheticHistory(id: string, days = 365): HistoricalSeries {
  const index = supportedAssets.findIndex((asset) => asset.id === id);
  const base = syntheticBasePrice(id, Math.max(index, 0));
  const beta = id === 'bitcoin' ? 0.75 : id === 'ethereum' ? 1 : 1.25 + Math.max(index, 0) * 0.04;
  const drift = 0.00055 + Math.max(index, 0) * 0.00004;
  const volatility = 0.025 * beta;
  const points: PricePoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let price = base / Math.exp(drift * days * 0.25);
  for (let day = days; day >= 0; day -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - day);
    const cyclical = Math.sin(day / 18 + beta) * 0.006 + Math.cos(day / 47) * 0.004;
    const shock = deterministicNoise(id, day) * volatility;
    price = Math.max(0.000001, price * Math.exp(drift + cyclical + shock));
    points.push({ date: date.toISOString().slice(0, 10), price });
  }

  return { id, points };
}
