import type {
  Allocation,
  FrontierPoint,
  HistoricalSeries,
  HoldingInput,
  MarketAsset,
  Objective,
  PortfolioMetrics
} from '@/types/portfolio';
import { clamp, covarianceMatrix, dot, mean, mulberry32, normalizeWeights, portfolioVariance } from './math';

const TRADING_DAYS = 365;

export interface OptimizeOptions {
  assets: MarketAsset[];
  series: HistoricalSeries[];
  holdings?: HoldingInput[];
  objective: Objective;
  samples: number;
  riskFreeRate: number;
  minWeight: number;
  maxWeight: number;
  targetReturn?: number;
}

export interface OptimizeResult {
  allocations: Allocation[];
  metrics: PortfolioMetrics;
  frontier: FrontierPoint[];
  warnings: string[];
}

interface Candidate extends PortfolioMetrics {
  weights: number[];
}

export function optimizePortfolio(options: OptimizeOptions): OptimizeResult {
  const warnings: string[] = [];
  const assetCount = options.assets.length;

  if (assetCount < 2) {
    throw new Error('Select at least two assets to optimize a diversified portfolio.');
  }

  const minWeight = clamp(options.minWeight, 0, 0.5);
  const maxWeight = clamp(options.maxWeight, minWeight, 1);
  if (minWeight * assetCount > 1) {
    throw new Error('Minimum weight is infeasible for the number of assets selected.');
  }
  if (maxWeight * assetCount < 1) {
    throw new Error('Maximum weight is infeasible for the number of assets selected.');
  }

  const aligned = alignReturns(options.series);
  if (aligned.rows.length < 30) {
    throw new Error('Not enough overlapping price history to calculate reliable returns.');
  }

  const averageDailyReturns = Array.from({ length: assetCount }, (_, column) => mean(aligned.rows.map((row) => row[column])));
  const annualReturns = averageDailyReturns.map((value) => value * TRADING_DAYS);
  const dailyCovariance = covarianceMatrix(aligned.rows);
  const annualCovariance = dailyCovariance.map((row) => row.map((value) => value * TRADING_DAYS));
  const individualVolatility = annualCovariance.map((row, index) => Math.sqrt(Math.max(row[index] ?? 0, 0)));

  const samples = clamp(Math.round(options.samples), 500, 30000);
  const candidates = generateCandidates({
    count: samples,
    assetCount,
    minWeight,
    maxWeight,
    annualReturns,
    annualCovariance,
    riskFreeRate: options.riskFreeRate
  });

  const feasibleForTarget = options.objective === 'target_return'
    ? candidates.filter((candidate) => candidate.expectedReturn >= (options.targetReturn ?? 0.2))
    : candidates;

  if (options.objective === 'target_return' && feasibleForTarget.length === 0) {
    warnings.push('No sampled portfolio reached the target return. Showing the closest high-return portfolio instead.');
  }

  const best = chooseBestCandidate(
    feasibleForTarget.length ? feasibleForTarget : candidates,
    options.objective,
    options.targetReturn
  );

  const allocations = createAllocations({
    assets: options.assets,
    holdings: options.holdings ?? [],
    weights: best.weights,
    annualReturns,
    individualVolatility
  });

  return {
    allocations,
    metrics: stripWeights(best),
    frontier: createFrontier(candidates),
    warnings
  };
}

function alignReturns(series: HistoricalSeries[]) {
  const returnMaps = series.map((assetSeries) => {
    const map = new Map<string, number>();
    const sorted = [...assetSeries.points].sort((a, b) => a.date.localeCompare(b.date));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous.price > 0 && current.price > 0) {
        map.set(current.date, Math.log(current.price / previous.price));
      }
    }
    return map;
  });

  const commonDates = [...returnMaps[0].keys()]
    .filter((date) => returnMaps.every((map) => map.has(date)))
    .sort((a, b) => a.localeCompare(b));

  const rows = commonDates.map((date) => returnMaps.map((map) => map.get(date) ?? 0));
  return { dates: commonDates, rows };
}

function generateCandidates({
  count,
  assetCount,
  minWeight,
  maxWeight,
  annualReturns,
  annualCovariance,
  riskFreeRate
}: {
  count: number;
  assetCount: number;
  minWeight: number;
  maxWeight: number;
  annualReturns: number[];
  annualCovariance: number[][];
  riskFreeRate: number;
}) {
  const random = mulberry32(42 + assetCount * 17 + Math.round(maxWeight * 1000));
  const candidates: Candidate[] = [];
  const addCandidate = (weights: number[]) => {
    const normalized = enforceConstraints(weights, minWeight, maxWeight);
    candidates.push(evaluateCandidate(normalized, annualReturns, annualCovariance, riskFreeRate));
  };

  addCandidate(Array.from({ length: assetCount }, () => 1 / assetCount));
  addCandidate(inverseVolatilityWeights(annualCovariance));

  for (let sample = 0; sample < count; sample += 1) {
    addCandidate(sampleConstrainedWeights(assetCount, minWeight, maxWeight, random));
  }

  return dedupeCandidates(candidates);
}

function sampleConstrainedWeights(assetCount: number, minWeight: number, maxWeight: number, random: () => number) {
  const remaining = 1 - minWeight * assetCount;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const raw = Array.from({ length: assetCount }, () => -Math.log(Math.max(0.0000001, random())));
    const normalized = normalizeWeights(raw).map((weight) => minWeight + weight * remaining);
    if (normalized.every((weight) => weight <= maxWeight + 1e-9)) return normalized;
  }
  return enforceConstraints(Array.from({ length: assetCount }, () => 1 / assetCount), minWeight, maxWeight);
}

function enforceConstraints(weights: number[], minWeight: number, maxWeight: number) {
  let constrained = normalizeWeights(weights).map((weight) => clamp(weight, minWeight, maxWeight));

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const total = constrained.reduce((acc, value) => acc + value, 0);
    const delta = 1 - total;
    if (Math.abs(delta) < 1e-10) break;

    const adjustableIndexes = constrained
      .map((weight, index) => ({ weight, index }))
      .filter(({ weight }) => (delta > 0 ? weight < maxWeight : weight > minWeight))
      .map(({ index }) => index);

    if (!adjustableIndexes.length) break;
    const step = delta / adjustableIndexes.length;
    constrained = constrained.map((weight, index) => {
      if (!adjustableIndexes.includes(index)) return weight;
      return clamp(weight + step, minWeight, maxWeight);
    });
  }

  return constrained;
}

function inverseVolatilityWeights(covariance: number[][]) {
  const inverseVol = covariance.map((row, index) => 1 / Math.max(Math.sqrt(Math.max(row[index] ?? 0, 0)), 0.000001));
  return normalizeWeights(inverseVol);
}

function evaluateCandidate(weights: number[], annualReturns: number[], annualCovariance: number[][], riskFreeRate: number): Candidate {
  const expectedReturn = dot(weights, annualReturns);
  const volatility = Math.sqrt(portfolioVariance(weights, annualCovariance));
  const sharpeRatio = volatility > 0 ? (expectedReturn - riskFreeRate) / volatility : 0;
  const diversificationScore = 1 - weights.reduce((acc, weight) => acc + weight ** 2, 0);
  const maxDrawdownEstimate = Math.min(0.95, 1.7 * volatility);
  return { weights, expectedReturn, volatility, sharpeRatio, diversificationScore, maxDrawdownEstimate };
}

function chooseBestCandidate(candidates: Candidate[], objective: Objective, targetReturn?: number) {
  if (objective === 'min_variance') {
    return [...candidates].sort((a, b) => a.volatility - b.volatility)[0];
  }

  if (objective === 'target_return') {
    const target = targetReturn ?? 0.2;
    return [...candidates].sort((a, b) => {
      const aDistance = Math.max(0, target - a.expectedReturn);
      const bDistance = Math.max(0, target - b.expectedReturn);
      return aDistance - bDistance || a.volatility - b.volatility;
    })[0];
  }

  return [...candidates].sort((a, b) => b.sharpeRatio - a.sharpeRatio)[0];
}

function createAllocations({
  assets,
  holdings,
  weights,
  annualReturns,
  individualVolatility
}: {
  assets: MarketAsset[];
  holdings: HoldingInput[];
  weights: number[];
  annualReturns: number[];
  individualVolatility: number[];
}) {
  const holdingMap = new Map(holdings.map((holding) => [holding.id, Math.max(0, holding.value)]));
  const totalValue = holdings.reduce((acc, holding) => acc + Math.max(0, holding.value), 0);

  return assets.map((asset, index) => {
    const currentValue = holdingMap.get(asset.id) ?? 0;
    const currentWeight = totalValue > 0 ? currentValue / totalValue : 0;
    const targetValue = totalValue > 0 ? totalValue * weights[index] : 0;
    const deltaValue = targetValue - currentValue;
    const action = Math.abs(deltaValue) < Math.max(totalValue * 0.005, 1) ? 'hold' : deltaValue > 0 ? 'buy' : 'sell';

    return {
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      weight: weights[index],
      expectedReturn: annualReturns[index],
      volatility: individualVolatility[index],
      currentValue,
      currentWeight,
      targetValue,
      deltaValue,
      action
    } satisfies Allocation;
  });
}

function createFrontier(candidates: Candidate[]) {
  const sorted = [...candidates].sort((a, b) => a.volatility - b.volatility || b.expectedReturn - a.expectedReturn);
  const efficient: FrontierPoint[] = [];
  let bestReturn = Number.NEGATIVE_INFINITY;

  for (const candidate of sorted) {
    if (candidate.expectedReturn > bestReturn + 0.0025) {
      efficient.push({ ...stripWeights(candidate), weights: candidate.weights });
      bestReturn = candidate.expectedReturn;
    }
  }

  const maxPoints = 48;
  if (efficient.length <= maxPoints) return efficient;
  return efficient.filter((_, index) => index % Math.ceil(efficient.length / maxPoints) === 0).slice(0, maxPoints);
}

function dedupeCandidates(candidates: Candidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.weights.map((weight) => weight.toFixed(3)).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripWeights(candidate: Candidate): PortfolioMetrics {
  return {
    expectedReturn: candidate.expectedReturn,
    volatility: candidate.volatility,
    sharpeRatio: candidate.sharpeRatio,
    diversificationScore: candidate.diversificationScore,
    maxDrawdownEstimate: candidate.maxDrawdownEstimate
  };
}
