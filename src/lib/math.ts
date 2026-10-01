export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

export function mean(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

export function dot(a: number[], b: number[]) {
  return a.reduce((acc, value, index) => acc + value * (b[index] ?? 0), 0);
}

export function normalizeWeights(weights: number[]) {
  const total = sum(weights);
  if (!Number.isFinite(total) || total <= 0) {
    return weights.map(() => 1 / weights.length);
  }
  return weights.map((weight) => weight / total);
}

export function mulberry32(seed: number) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(variance, 0));
}

export function covarianceMatrix(rows: number[][]) {
  if (!rows.length) return [];
  const columns = rows[0]?.length ?? 0;
  const columnMeans = Array.from({ length: columns }, (_, col) => mean(rows.map((row) => row[col] ?? 0)));

  return Array.from({ length: columns }, (_, i) =>
    Array.from({ length: columns }, (_, j) => {
      if (rows.length < 2) return 0;
      const covariance = rows.reduce((acc, row) => {
        return acc + ((row[i] ?? 0) - columnMeans[i]) * ((row[j] ?? 0) - columnMeans[j]);
      }, 0);
      return covariance / (rows.length - 1);
    })
  );
}

export function portfolioVariance(weights: number[], covariance: number[][]) {
  let variance = 0;
  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) {
      variance += weights[i] * weights[j] * (covariance[i]?.[j] ?? 0);
    }
  }
  return Math.max(variance, 0);
}

export function formatPercentDecimal(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
