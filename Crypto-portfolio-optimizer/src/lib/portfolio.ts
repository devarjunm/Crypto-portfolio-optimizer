import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fetchMarkets } from '@/lib/coingecko';
import { supportedAssets } from '@/lib/assets';
import type { MarketAsset } from '@/types/portfolio';

export type TransactionType = 'buy' | 'sell';

export interface StoredHolding {
  assetId: string;
  quantity: number;
  averageBuyPrice: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredTransaction {
  id: string;
  assetId: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  date: string;
  realizedGain: number;
  notes?: string;
  createdAt: string;
}

export interface UserPortfolio {
  holdings: StoredHolding[];
  transactions: StoredTransaction[];
}

export interface PortfolioStore {
  [userId: string]: UserPortfolio;
}

export interface EnrichedHolding extends StoredHolding {
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
  currentValue: number;
  costBasis: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  dailyGain: number;
  allocationWeight: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCostBasis: number;
  totalUnrealizedGain: number;
  totalRealizedGain: number;
  totalProfitLoss: number;
  totalProfitLossPct: number;
  dailyProfitLoss: number;
  dailyProfitLossPct: number;
  bestPerformer?: EnrichedHolding;
  worstPerformer?: EnrichedHolding;
}

export interface PortfolioAnalytics {
  allocation: Array<{ assetId: string; symbol: string; name: string; value: number; weight: number }>;
  diversificationScore: number;
  riskScore: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  aiSuggestions: Array<{ title: string; action: 'Buy' | 'Hold' | 'Reduce' | 'Avoid'; confidence: number; reason: string }>;
}

const PORTFOLIOS_FILE = path.join(process.cwd(), 'data', 'portfolios.json');

function now() {
  return new Date().toISOString();
}

async function ensureStore() {
  await mkdir(path.dirname(PORTFOLIOS_FILE), { recursive: true });
  try {
    await readFile(PORTFOLIOS_FILE, 'utf8');
  } catch {
    await writeFile(PORTFOLIOS_FILE, '{}', 'utf8');
  }
}

export async function readPortfolioStore(): Promise<PortfolioStore> {
  await ensureStore();
  try {
    return JSON.parse(await readFile(PORTFOLIOS_FILE, 'utf8')) as PortfolioStore;
  } catch {
    return {};
  }
}

async function writePortfolioStore(store: PortfolioStore) {
  await ensureStore();
  await writeFile(PORTFOLIOS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function getUserPortfolio(userId: string): Promise<UserPortfolio> {
  const store = await readPortfolioStore();
  return store[userId] ?? { holdings: [], transactions: [] };
}

async function saveUserPortfolio(userId: string, portfolio: UserPortfolio) {
  const store = await readPortfolioStore();
  store[userId] = portfolio;
  await writePortfolioStore(store);
  return portfolio;
}

export function sanitizeAssetId(assetId: string) {
  const clean = assetId.trim().toLowerCase();
  const asset = supportedAssets.find((item) => item.id === clean || item.symbol.toLowerCase() === clean);
  if (!asset) throw new Error('Unsupported asset. Choose one of the supported crypto assets.');
  return asset.id;
}

export function sanitizePositiveNumber(value: unknown, field: string, max = 1_000_000_000) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be a positive number.`);
  if (parsed > max) throw new Error(`${field} is too large.`);
  return parsed;
}

export function sanitizeNonNegativeNumber(value: unknown, field: string, max = 1_000_000_000) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be zero or a positive number.`);
  if (parsed > max) throw new Error(`${field} is too large.`);
  return parsed;
}

export async function upsertHolding(userId: string, input: { assetId: string; quantity: number; averageBuyPrice: number }) {
  const assetId = sanitizeAssetId(input.assetId);
  const quantity = sanitizePositiveNumber(input.quantity, 'Quantity');
  const averageBuyPrice = sanitizeNonNegativeNumber(input.averageBuyPrice, 'Average buy price');
  const portfolio = await getUserPortfolio(userId);
  const existing = portfolio.holdings.find((holding) => holding.assetId === assetId);

  if (existing) {
    existing.quantity = quantity;
    existing.averageBuyPrice = averageBuyPrice;
    existing.updatedAt = now();
  } else {
    portfolio.holdings.push({ assetId, quantity, averageBuyPrice, createdAt: now(), updatedAt: now() });
  }

  await saveUserPortfolio(userId, portfolio);
  return portfolio;
}

export async function deleteHolding(userId: string, assetIdInput: string) {
  const assetId = sanitizeAssetId(assetIdInput);
  const portfolio = await getUserPortfolio(userId);
  portfolio.holdings = portfolio.holdings.filter((holding) => holding.assetId !== assetId);
  await saveUserPortfolio(userId, portfolio);
  return portfolio;
}

export async function addTransaction(userId: string, input: {
  assetId: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee?: number;
  date?: string;
  notes?: string;
}) {
  const assetId = sanitizeAssetId(input.assetId);
  const type = input.type === 'sell' ? 'sell' : 'buy';
  const quantity = sanitizePositiveNumber(input.quantity, 'Quantity');
  const price = sanitizePositiveNumber(input.price, 'Price');
  const fee = sanitizeNonNegativeNumber(input.fee ?? 0, 'Fee');
  const date = input.date ? new Date(input.date).toISOString() : now();
  const portfolio = await getUserPortfolio(userId);
  let holding = portfolio.holdings.find((item) => item.assetId === assetId);
  let realizedGain = 0;

  if (type === 'buy') {
    if (!holding) {
      holding = { assetId, quantity: 0, averageBuyPrice: 0, createdAt: now(), updatedAt: now() };
      portfolio.holdings.push(holding);
    }
    const oldCost = holding.quantity * holding.averageBuyPrice;
    const newCost = quantity * price + fee;
    const newQuantity = holding.quantity + quantity;
    holding.quantity = newQuantity;
    holding.averageBuyPrice = newQuantity > 0 ? (oldCost + newCost) / newQuantity : 0;
    holding.updatedAt = now();
  } else {
    if (!holding || holding.quantity < quantity) {
      throw new Error('Not enough quantity available to sell.');
    }
    realizedGain = quantity * (price - holding.averageBuyPrice) - fee;
    holding.quantity -= quantity;
    holding.updatedAt = now();
    if (holding.quantity <= 0.00000001) {
      portfolio.holdings = portfolio.holdings.filter((item) => item.assetId !== assetId);
    }
  }

  portfolio.transactions.unshift({
    id: randomBytes(12).toString('hex'),
    assetId,
    type,
    quantity,
    price,
    fee,
    date,
    realizedGain,
    notes: input.notes?.trim() || undefined,
    createdAt: now()
  });

  await saveUserPortfolio(userId, portfolio);
  return portfolio;
}

export async function importCsvHoldings(userId: string, csv: string) {
  const rows = csv.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (rows.length < 2) throw new Error('CSV must include a header row and at least one holding row.');
  const headers = splitCsvLine(rows[0]).map((header) => header.trim().toLowerCase());
  const assetIndex = findHeader(headers, ['assetid', 'asset_id', 'coin', 'symbol', 'asset']);
  const quantityIndex = findHeader(headers, ['quantity', 'qty', 'amount']);
  const avgIndex = findHeader(headers, ['averagebuyprice', 'average_buy_price', 'avgprice', 'avg_buy_price', 'price']);
  if (assetIndex < 0 || quantityIndex < 0 || avgIndex < 0) {
    throw new Error('CSV headers must include assetId/symbol, quantity, and averageBuyPrice.');
  }

  let imported = 0;
  for (const row of rows.slice(1)) {
    const columns = splitCsvLine(row);
    const assetId = columns[assetIndex];
    const quantity = Number(columns[quantityIndex]);
    const averageBuyPrice = Number(columns[avgIndex]);
    if (!assetId || !Number.isFinite(quantity) || !Number.isFinite(averageBuyPrice)) continue;
    await upsertHolding(userId, { assetId, quantity, averageBuyPrice });
    imported += 1;
  }
  if (!imported) throw new Error('No valid holdings found in CSV.');
  return { imported };
}

function splitCsvLine(row: string) {
  const result: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function findHeader(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header.replace(/\s|-/g, '')));
}

export async function getPortfolioSnapshot(userId: string) {
  const portfolio = await getUserPortfolio(userId);
  const assetIds = portfolio.holdings.map((holding) => holding.assetId);
  const { assets, source } = assetIds.length
    ? await fetchMarkets(assetIds)
    : { assets: [] as MarketAsset[], source: 'coingecko' as const };
  const marketMap = new Map(assets.map((asset) => [asset.id, asset]));
  const fallbackMap = new Map(supportedAssets.map((asset) => [asset.id, asset]));

  const holdingsWithoutWeights = portfolio.holdings.map((holding) => {
    const market = marketMap.get(holding.assetId) ?? fallbackMap.get(holding.assetId);
    const currentPrice = market?.currentPrice || holding.averageBuyPrice || 0;
    const priceChange24h = market?.priceChange24h ?? 0;
    const currentValue = holding.quantity * currentPrice;
    const costBasis = holding.quantity * holding.averageBuyPrice;
    const unrealizedGain = currentValue - costBasis;
    const previousPrice = currentPrice / (1 + priceChange24h / 100 || 1);
    const dailyGain = holding.quantity * (currentPrice - previousPrice);

    return {
      ...holding,
      symbol: market?.symbol ?? holding.assetId.toUpperCase(),
      name: market?.name ?? holding.assetId,
      currentPrice,
      priceChange24h,
      currentValue,
      costBasis,
      unrealizedGain,
      unrealizedGainPct: costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0,
      dailyGain,
      allocationWeight: 0
    } satisfies EnrichedHolding;
  });

  const totalValue = holdingsWithoutWeights.reduce((total, holding) => total + holding.currentValue, 0);
  const holdings = holdingsWithoutWeights.map((holding) => ({
    ...holding,
    allocationWeight: totalValue > 0 ? holding.currentValue / totalValue : 0
  }));

  const totalCostBasis = holdings.reduce((total, holding) => total + holding.costBasis, 0);
  const totalUnrealizedGain = holdings.reduce((total, holding) => total + holding.unrealizedGain, 0);
  const totalRealizedGain = portfolio.transactions.reduce((total, transaction) => total + transaction.realizedGain, 0);
  const dailyProfitLoss = holdings.reduce((total, holding) => total + holding.dailyGain, 0);
  const totalProfitLoss = totalUnrealizedGain + totalRealizedGain;

  const summary: PortfolioSummary = {
    totalValue,
    totalCostBasis,
    totalUnrealizedGain,
    totalRealizedGain,
    totalProfitLoss,
    totalProfitLossPct: totalCostBasis > 0 ? (totalProfitLoss / totalCostBasis) * 100 : 0,
    dailyProfitLoss,
    dailyProfitLossPct: totalValue > 0 ? (dailyProfitLoss / totalValue) * 100 : 0,
    bestPerformer: [...holdings].sort((a, b) => b.unrealizedGainPct - a.unrealizedGainPct)[0],
    worstPerformer: [...holdings].sort((a, b) => a.unrealizedGainPct - b.unrealizedGainPct)[0]
  };

  const analytics = buildAnalytics(holdings, summary);

  return {
    generatedAt: now(),
    source,
    holdings,
    transactions: portfolio.transactions,
    summary,
    analytics
  };
}

function buildAnalytics(holdings: EnrichedHolding[], summary: PortfolioSummary): PortfolioAnalytics {
  const allocation = holdings.map((holding) => ({
    assetId: holding.assetId,
    symbol: holding.symbol,
    name: holding.name,
    value: holding.currentValue,
    weight: holding.allocationWeight
  }));
  const hhi = allocation.reduce((total, item) => total + item.weight ** 2, 0);
  const diversificationScore = Math.max(0, Math.min(100, (1 - hhi) * 125));
  const maxWeight = allocation.reduce((max, item) => Math.max(max, item.weight), 0);
  const lossPressure = summary.totalProfitLossPct < 0 ? Math.min(20, Math.abs(summary.totalProfitLossPct) / 2) : 0;
  const riskScore = Math.round(Math.max(0, Math.min(100, 25 + maxWeight * 55 + (100 - diversificationScore) * 0.25 + lossPressure)));
  const riskLevel = riskScore < 40 ? 'Low' : riskScore < 70 ? 'Medium' : 'High';
  const aiSuggestions = createSuggestions(holdings, riskScore, diversificationScore);

  return { allocation, diversificationScore, riskScore, riskLevel, aiSuggestions };
}

function createSuggestions(holdings: EnrichedHolding[], riskScore: number, diversificationScore: number): PortfolioAnalytics['aiSuggestions'] {
  const suggestions: PortfolioAnalytics['aiSuggestions'] = [];
  const sorted = [...holdings].sort((a, b) => b.allocationWeight - a.allocationWeight);
  const top = sorted[0];

  if (!holdings.length) {
    return [{
      title: 'Start with a diversified core',
      action: 'Buy',
      confidence: 74,
      reason: 'Add holdings first. A balanced starter mix can include BTC, ETH, and selected large-cap assets.'
    }];
  }

  if (top && top.allocationWeight > 0.6) {
    suggestions.push({
      title: `Reduce ${top.symbol} concentration`,
      action: 'Reduce',
      confidence: 82,
      reason: `${top.symbol} is ${(top.allocationWeight * 100).toFixed(1)}% of the portfolio. Lowering concentration can reduce drawdown risk.`
    });
  } else {
    suggestions.push({
      title: 'Core allocation looks balanced',
      action: 'Hold',
      confidence: 76,
      reason: 'No single asset is above 60%, so concentration risk is controlled for a crypto portfolio.'
    });
  }

  if (diversificationScore < 45) {
    const owned = new Set(holdings.map((holding) => holding.assetId));
    const candidate = ['ethereum', 'solana', 'chainlink', 'bitcoin'].find((assetId) => !owned.has(assetId));
    suggestions.push({
      title: candidate ? `Add ${candidate.toUpperCase()} for diversification` : 'Add another uncorrelated asset',
      action: 'Buy',
      confidence: 71,
      reason: `Diversification score is ${diversificationScore.toFixed(0)}/100. Adding another quality asset can improve allocation balance.`
    });
  }

  if (riskScore > 70) {
    suggestions.push({
      title: 'Rebalance risk down',
      action: 'Reduce',
      confidence: 79,
      reason: `Risk score is ${riskScore}/100. Consider trimming volatile concentrated positions or increasing BTC/ETH weight.`
    });
  }

  const loser = [...holdings].sort((a, b) => a.unrealizedGainPct - b.unrealizedGainPct)[0];
  if (loser && loser.unrealizedGainPct < -25) {
    suggestions.push({
      title: `Review ${loser.symbol} thesis`,
      action: 'Hold',
      confidence: 66,
      reason: `${loser.symbol} is down ${Math.abs(loser.unrealizedGainPct).toFixed(1)}%. Re-check fundamentals before averaging down.`
    });
  }

  return suggestions.slice(0, 4);
}
