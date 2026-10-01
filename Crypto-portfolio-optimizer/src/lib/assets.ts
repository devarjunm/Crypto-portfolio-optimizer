import type { MarketAsset } from '@/types/portfolio';

export const supportedAssets: MarketAsset[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', currentPrice: 0, marketCapRank: 1 },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', currentPrice: 0, marketCapRank: 2 },
  { id: 'solana', symbol: 'SOL', name: 'Solana', currentPrice: 0, marketCapRank: 5 },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB', currentPrice: 0, marketCapRank: 4 },
  { id: 'ripple', symbol: 'XRP', name: 'XRP', currentPrice: 0, marketCapRank: 6 },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', currentPrice: 0, marketCapRank: 9 },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', currentPrice: 0, marketCapRank: 8 },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', currentPrice: 0, marketCapRank: 15 }
];
