import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalSeries, fetchMarkets } from '@/lib/coingecko';
import { supportedAssets } from '@/lib/assets';
import { optimizePortfolio } from '@/lib/optimizer';
import type { OptimizerRequest, Objective } from '@/types/portfolio';

export const runtime = 'nodejs';

const SUPPORTED_OBJECTIVES: Objective[] = ['max_sharpe', 'min_variance', 'target_return'];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<OptimizerRequest>;
    const validated = validateRequest(body);

    const [{ assets, source: marketSource }, ...historyResults] = await Promise.all([
      fetchMarkets(validated.assetIds),
      ...validated.assetIds.map((id) => fetchHistoricalSeries(id, validated.days))
    ]);

    const historySource = historyResults.some((result) => result.source === 'synthetic-fallback')
      ? historyResults.every((result) => result.source === 'synthetic-fallback')
        ? 'synthetic-fallback'
        : 'mixed'
      : 'coingecko';

    const result = optimizePortfolio({
      assets,
      series: historyResults.map((result) => result.series),
      holdings: validated.holdings,
      objective: validated.objective,
      samples: validated.samples,
      riskFreeRate: validated.riskFreeRate,
      minWeight: validated.minWeight,
      maxWeight: validated.maxWeight,
      targetReturn: validated.targetReturn
    });

    const dataSource = marketSource === 'coingecko' && historySource === 'coingecko'
      ? 'coingecko'
      : marketSource === 'synthetic-fallback' && historySource === 'synthetic-fallback'
        ? 'synthetic-fallback'
        : 'mixed';

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      dataSource,
      assets,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected optimizer error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function validateRequest(body: Partial<OptimizerRequest>): Required<OptimizerRequest> {
  const supportedIds = new Set(supportedAssets.map((asset) => asset.id));
  const assetIds = Array.isArray(body.assetIds)
    ? [...new Set(body.assetIds.filter((id) => typeof id === 'string' && supportedIds.has(id)))]
    : [];

  if (assetIds.length < 2) {
    throw new Error('Please select at least two supported crypto assets.');
  }

  if (assetIds.length > 8) {
    throw new Error('Please select no more than eight assets for this optimizer version.');
  }

  const objective = SUPPORTED_OBJECTIVES.includes(body.objective as Objective) ? (body.objective as Objective) : 'max_sharpe';
  const holdings = Array.isArray(body.holdings)
    ? body.holdings
        .filter((holding) => holding && typeof holding.id === 'string' && assetIds.includes(holding.id))
        .map((holding) => ({ id: holding.id, value: sanitizeNumber(holding.value, 0, 0, 100_000_000) }))
    : [];

  return {
    assetIds,
    holdings,
    objective,
    days: Math.round(sanitizeNumber(body.days, 365, 120, 1825)),
    samples: Math.round(sanitizeNumber(body.samples, 8000, 500, 30000)),
    riskFreeRate: sanitizeNumber(body.riskFreeRate, 0.04, -0.05, 0.2),
    minWeight: sanitizeNumber(body.minWeight, 0, 0, 0.2),
    maxWeight: sanitizeNumber(body.maxWeight, 0.5, 0.05, 1),
    targetReturn: sanitizeNumber(body.targetReturn, 0.2, -0.5, 5)
  };
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
