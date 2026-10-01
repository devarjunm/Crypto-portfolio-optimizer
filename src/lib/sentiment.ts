export type SentimentLabel = 'Bullish' | 'Neutral' | 'Bearish';

const positiveWords = [
  'surge', 'rally', 'gain', 'gains', 'bull', 'bullish', 'breakout', 'record', 'high', 'approval', 'adoption',
  'partnership', 'upgrade', 'accumulate', 'buy', 'positive', 'inflow', 'strong', 'growth', 'recover', 'recovery'
];

const negativeWords = [
  'crash', 'drop', 'drops', 'plunge', 'bear', 'bearish', 'hack', 'lawsuit', 'ban', 'outflow', 'weak', 'loss',
  'losses', 'selloff', 'liquidation', 'risk', 'fraud', 'scam', 'decline', 'falls', 'fear', 'warning'
];

export function analyzeSentiment(text: string): { score: number; label: SentimentLabel; confidence: number } {
  const lower = text.toLowerCase();
  const positive = positiveWords.reduce((total, word) => total + countWord(lower, word), 0);
  const negative = negativeWords.reduce((total, word) => total + countWord(lower, word), 0);
  const raw = positive - negative;
  const score = Math.max(-100, Math.min(100, raw * 18));
  const label: SentimentLabel = score > 12 ? 'Bullish' : score < -12 ? 'Bearish' : 'Neutral';
  const confidence = Math.max(50, Math.min(92, 55 + Math.abs(score) * 0.38 + (positive + negative) * 2));
  return { score, label, confidence: Math.round(confidence) };
}

function countWord(text: string, word: string) {
  const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi');
  return text.match(regex)?.length ?? 0;
}
