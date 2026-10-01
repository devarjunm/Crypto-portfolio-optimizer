import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fetchMarkets } from '@/lib/coingecko';
import { supportedAssets } from '@/lib/assets';

export type AlertDirection = 'above' | 'below';

export interface WatchAlert {
  id: string;
  assetId: string;
  direction: AlertDirection;
  targetPrice: number;
  enabled: boolean;
  createdAt: string;
}

export interface UserWatchlist {
  coins: string[];
  alerts: WatchAlert[];
}

interface WatchlistStore {
  [userId: string]: UserWatchlist;
}

const WATCHLIST_FILE = path.join(process.cwd(), 'data', 'watchlists.json');

function now() {
  return new Date().toISOString();
}

async function ensureStore() {
  await mkdir(path.dirname(WATCHLIST_FILE), { recursive: true });
  try {
    await readFile(WATCHLIST_FILE, 'utf8');
  } catch {
    await writeFile(WATCHLIST_FILE, '{}', 'utf8');
  }
}

async function readStore(): Promise<WatchlistStore> {
  await ensureStore();
  try {
    return JSON.parse(await readFile(WATCHLIST_FILE, 'utf8')) as WatchlistStore;
  } catch {
    return {};
  }
}

async function writeStore(store: WatchlistStore) {
  await ensureStore();
  await writeFile(WATCHLIST_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function sanitizeAssetId(assetId: string) {
  const clean = assetId.trim().toLowerCase();
  const asset = supportedAssets.find((item) => item.id === clean || item.symbol.toLowerCase() === clean);
  if (!asset) throw new Error('Unsupported watchlist coin.');
  return asset.id;
}

function sanitizePrice(value: unknown) {
  const price = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Alert target price must be positive.');
  if (price > 1_000_000_000) throw new Error('Alert target price is too large.');
  return price;
}

async function getRawWatchlist(userId: string): Promise<UserWatchlist> {
  const store = await readStore();
  return store[userId] ?? { coins: ['bitcoin', 'ethereum'], alerts: [] };
}

async function saveRawWatchlist(userId: string, watchlist: UserWatchlist) {
  const store = await readStore();
  store[userId] = watchlist;
  await writeStore(store);
}

export async function addWatchCoin(userId: string, assetIdInput: string) {
  const assetId = sanitizeAssetId(assetIdInput);
  const watchlist = await getRawWatchlist(userId);
  if (!watchlist.coins.includes(assetId)) watchlist.coins.push(assetId);
  await saveRawWatchlist(userId, watchlist);
  return getWatchlistSnapshot(userId);
}

export async function removeWatchCoin(userId: string, assetIdInput: string) {
  const assetId = sanitizeAssetId(assetIdInput);
  const watchlist = await getRawWatchlist(userId);
  watchlist.coins = watchlist.coins.filter((coin) => coin !== assetId);
  watchlist.alerts = watchlist.alerts.filter((alert) => alert.assetId !== assetId);
  await saveRawWatchlist(userId, watchlist);
  return getWatchlistSnapshot(userId);
}

export async function addPriceAlert(userId: string, input: { assetId: string; direction: AlertDirection; targetPrice: number }) {
  const assetId = sanitizeAssetId(input.assetId);
  const targetPrice = sanitizePrice(input.targetPrice);
  const direction = input.direction === 'below' ? 'below' : 'above';
  const watchlist = await getRawWatchlist(userId);
  if (!watchlist.coins.includes(assetId)) watchlist.coins.push(assetId);
  watchlist.alerts.unshift({ id: randomBytes(10).toString('hex'), assetId, direction, targetPrice, enabled: true, createdAt: now() });
  await saveRawWatchlist(userId, watchlist);
  return getWatchlistSnapshot(userId);
}

export async function deletePriceAlert(userId: string, alertId: string) {
  const watchlist = await getRawWatchlist(userId);
  watchlist.alerts = watchlist.alerts.filter((alert) => alert.id !== alertId);
  await saveRawWatchlist(userId, watchlist);
  return getWatchlistSnapshot(userId);
}

export async function getWatchlistSnapshot(userId: string) {
  const watchlist = await getRawWatchlist(userId);
  const ids = [...new Set([...watchlist.coins, ...watchlist.alerts.map((alert) => alert.assetId)])];
  const { assets, source } = ids.length ? await fetchMarkets(ids) : { assets: [], source: 'coingecko' as const };
  const marketMap = new Map(assets.map((asset) => [asset.id, asset]));

  const coins = watchlist.coins.map((assetId) => {
    const asset = marketMap.get(assetId) ?? supportedAssets.find((item) => item.id === assetId);
    return {
      id: assetId,
      symbol: asset?.symbol ?? assetId.toUpperCase(),
      name: asset?.name ?? assetId,
      currentPrice: asset?.currentPrice ?? 0,
      priceChange24h: asset?.priceChange24h ?? 0,
      marketCapRank: asset?.marketCapRank
    };
  });

  const alerts = watchlist.alerts.map((alert) => {
    const asset = marketMap.get(alert.assetId) ?? supportedAssets.find((item) => item.id === alert.assetId);
    const currentPrice = asset?.currentPrice ?? 0;
    const triggered = alert.enabled && currentPrice > 0 && (alert.direction === 'above' ? currentPrice >= alert.targetPrice : currentPrice <= alert.targetPrice);
    return {
      ...alert,
      symbol: asset?.symbol ?? alert.assetId.toUpperCase(),
      name: asset?.name ?? alert.assetId,
      currentPrice,
      triggered
    };
  });

  return { generatedAt: now(), source, coins, alerts };
}
