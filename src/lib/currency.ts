export type CurrencyCode = 'USD' | 'INR';

let usdToInrRate: number | null = null;

export function setUsdToInrRate(rate: number | null) {
  usdToInrRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function convertUsd(valueUsd: number, currency: CurrencyCode) {
  return currency === 'INR' && usdToInrRate !== null ? valueUsd * usdToInrRate : valueUsd;
}

export function formatCurrency(valueUsd: number, currency: CurrencyCode = 'USD', compact = false, maximumFractionDigits?: number) {
  if (currency === 'INR' && usdToInrRate === null) return 'INR conversion unavailable';
  const converted = convertUsd(valueUsd, currency);
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: maximumFractionDigits ?? (compact ? 2 : 2)
  }).format(converted);
}

export function currencyLabel(currency: CurrencyCode) {
  return currency === 'INR' ? 'Indian Rupee (₹)' : 'US Dollar ($)';
}
