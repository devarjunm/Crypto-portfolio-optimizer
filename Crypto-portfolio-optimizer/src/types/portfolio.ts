export type Objective = 'max_sharpe' | 'min_variance' | 'target_return';

export type AssetId = string;

export interface HoldingInput {
  id: AssetId;
  value: number;
}

export interface OptimizerRequest {
  assetIds: AssetId[];
  holdings?: HoldingInput[];
  objective?: Objective;
  days?: number;
  samples?: number;
  riskFreeRate?: number;
  minWeight?: number;
  maxWeight?: number;
  targetReturn?: number;
}

export interface MarketAsset {
  id: AssetId;
  symbol: string;
  name: string;
  image?: string;
  currentPrice: number;
  marketCapRank?: number;
  priceChange24h?: number;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface HistoricalSeries {
  id: AssetId;
  points: PricePoint[];
}

export interface Allocation {
  id: AssetId;
  symbol: string;
  name: string;
  weight: number;
  expectedReturn: number;
  volatility: number;
  currentValue: number;
  currentWeight: number;
  targetValue: number;
  deltaValue: number;
  action: 'buy' | 'sell' | 'hold';
}

export interface PortfolioMetrics {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  diversificationScore: number;
  maxDrawdownEstimate: number;
}

export interface FrontierPoint extends PortfolioMetrics {
  weights: number[];
}

export interface OptimizerResponse {
  generatedAt: string;
  dataSource: 'coingecko' | 'synthetic-fallback' | 'mixed';
  assets: MarketAsset[];
  allocations: Allocation[];
  metrics: PortfolioMetrics;
  frontier: FrontierPoint[];
  warnings: string[];
}
