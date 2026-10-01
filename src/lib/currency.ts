export type CurrencyCode = 'USD' | 'INR';

// Fallback display conversion. For production, replace with a live FX API or a database-cached rate.
export const USD_TO_INR = 83.5;

export function convertUsd(valueUsd: number, currency: CurrencyCode) {
  return currency === 'INR' ? valueUsd * USD_TO_INR : valueUsd;
}

export function formatCurrency(valueUsd: number, currency: CurrencyCode = 'USD', compact = false, maximumFractionDigits?: number) {
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
