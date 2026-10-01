'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatCurrency, type CurrencyCode, USD_TO_INR } from '@/lib/currency';

type PricePoint = { date: string; price: number };

type CoinDetails = {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank?: number;
  image?: { large?: string; small?: string };
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    total_volume?: { usd?: number };
    circulating_supply?: number;
    max_supply?: number | null;
    ath?: { usd?: number };
    atl?: { usd?: number };
    price_change_percentage_24h?: number;
    price_change_percentage_7d?: number;
    price_change_percentage_30d?: number;
  };
};

type CoinPayload = {
  source: string;
  details: CoinDetails;
  history: PricePoint[];
};

const number = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export default function CoinDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [payload, setPayload] = useState<CoinPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');

  useEffect(() => {
    const savedCurrency = window.localStorage.getItem('displayCurrency');
    if (savedCurrency === 'USD' || savedCurrency === 'INR') setCurrency(savedCurrency);
  }, []);

  function changeCurrency(value: CurrencyCode) {
    setCurrency(value);
    window.localStorage.setItem('displayCurrency', value);
  }

  useEffect(() => {
    if (!id) return;
    let active = true;
    fetch(`/api/coins/${id}`)
      .then((response) => response.json())
      .then((data: CoinPayload) => {
        if (!active) return;
        setPayload(data);
        setError('');
      })
      .catch(() => {
        if (active) setError('Unable to load this coin right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const stats = payload?.details.market_data;
  const prediction = useMemo(() => createSimplePrediction(payload?.history ?? []), [payload]);

  return (
    <main className="shell coin-page">
      <div className="coin-topbar">
        <a className="button secondary" href="/">← Back to dashboard</a>
        <label className="currency-switch">
          <span>Currency</span>
          <select value={currency} onChange={(event) => changeCurrency(event.target.value as CurrencyCode)} aria-label="Display currency">
            <option value="USD">USD $</option>
            <option value="INR">INR ₹</option>
          </select>
        </label>
      </div>
      {loading && <div className="panel loading-card">Loading coin details…</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {payload && (
        <>
          <section className="panel coin-hero">
            <div>
              <span className="eyebrow">Rank #{payload.details.market_cap_rank ?? '—'} · Source: {payload.source}</span>
              <h1>{payload.details.name} <span className="gradient-text">{payload.details.symbol?.toUpperCase()}</span></h1>
              <p className="lede">Live coin details, 30-day history, core market metrics, and a rule-based trend estimate. INR uses estimated $1 ≈ ₹{USD_TO_INR}.</p>
            </div>
            {payload.details.image?.large ? <img src={payload.details.image.large} alt="" className="coin-hero-image" /> : null}
          </section>

          <section className="coin-stat-grid" aria-label="Coin market statistics">
            <CoinStat label="Current price" value={formatMoney(stats?.current_price?.usd, currency)} />
            <CoinStat label="Market cap" value={formatMoney(stats?.market_cap?.usd, currency)} />
            <CoinStat label="24h volume" value={formatMoney(stats?.total_volume?.usd, currency)} />
            <CoinStat label="Circulating supply" value={formatNumber(stats?.circulating_supply)} />
            <CoinStat label="Max supply" value={stats?.max_supply ? formatNumber(stats.max_supply) : '—'} />
            <CoinStat label="ATH" value={formatMoney(stats?.ath?.usd, currency)} />
            <CoinStat label="ATL" value={formatMoney(stats?.atl?.usd, currency)} />
            <CoinStat label="30d trend" value={prediction.trend} tone={prediction.trend === 'Bullish' ? 'good' : prediction.trend === 'Bearish' ? 'bad' : undefined} />
          </section>

          <section className="panel coin-chart-card">
            <div className="section-title compact">
              <div>
                <h2>30-day price chart</h2>
                <p>Historical price line generated from CoinGecko or fallback demo data.</p>
              </div>
            </div>
            <LineChart points={payload.history} currency={currency} />
          </section>

          <section className="coin-insight-grid">
            <article className="panel feature">
              <h3>Price changes</h3>
              <p>24h: <Change value={stats?.price_change_percentage_24h} /></p>
              <p>7d: <Change value={stats?.price_change_percentage_7d} /></p>
              <p>30d: <Change value={stats?.price_change_percentage_30d} /></p>
            </article>
            <article className="panel feature">
              <h3>Rule-based prediction</h3>
              <p><strong>{prediction.trend}</strong> · confidence {prediction.confidence}%</p>
              <p>{prediction.reason}</p>
            </article>
            <article className="panel feature">
              <h3>Next upgrades</h3>
              <p>This page is ready for news, sentiment, watchlist alerts, candlesticks, and AI prediction modules.</p>
            </article>
          </section>
        </>
      )}
    </main>
  );
}

function CoinStat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="panel market-stat">
      <span>{label}</span>
      <strong style={{ color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : undefined }}>{value}</strong>
    </div>
  );
}

function LineChart({ points, currency }: { points: PricePoint[]; currency: CurrencyCode }) {
  if (!points.length) return <div className="notice">No history available.</div>;
  const width = 880;
  const height = 300;
  const padding = 36;
  const min = Math.min(...points.map((point) => point.price));
  const max = Math.max(...points.map((point) => point.price));
  const x = (index: number) => padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const y = (price: number) => height - padding - ((price - min) / Math.max(max - min, 0.000001)) * (height - padding * 2);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point.price).toFixed(1)}`).join(' ');

  return (
    <svg className="frontier" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Thirty day price line chart">
      <path d={path} fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(points.at(-1)?.price ?? 0)} r="7" fill="#4ade80" />
      <text x={padding} y={height - 8} fill="#9eaccb" fontSize="13">{points[0]?.date}</text>
      <text x={width - padding} y={height - 8} textAnchor="end" fill="#9eaccb" fontSize="13">{points.at(-1)?.date}</text>
      <text x={padding} y={24} fill="#9eaccb" fontSize="13">High {formatMoney(max, currency)}</text>
      <text x={width - padding} y={24} textAnchor="end" fill="#9eaccb" fontSize="13">Low {formatMoney(min, currency)}</text>
    </svg>
  );
}

function Change({ value }: { value?: number }) {
  const positive = (value ?? 0) >= 0;
  return <span className={positive ? 'change-positive' : 'change-negative'}>{formatChange(value)}</span>;
}

function createSimplePrediction(points: PricePoint[]) {
  if (points.length < 2) return { trend: 'Neutral', confidence: 50, reason: 'Not enough history for a trend estimate.' };
  const first = points[0].price;
  const last = points.at(-1)?.price ?? first;
  const change = ((last - first) / Math.max(first, 0.000001)) * 100;
  const returns = points.slice(1).map((point, index) => Math.log(point.price / points[index].price));
  const avg = returns.reduce((total, value) => total + value, 0) / Math.max(returns.length, 1);
  const variance = returns.reduce((total, value) => total + (value - avg) ** 2, 0) / Math.max(returns.length - 1, 1);
  const volatility = Math.sqrt(Math.max(variance, 0)) * Math.sqrt(365) * 100;
  const trend = change > 4 ? 'Bullish' : change < -4 ? 'Bearish' : 'Neutral';
  const confidence = Math.max(42, Math.min(88, Math.round(65 + Math.abs(change) * 0.8 - volatility * 0.15)));
  return {
    trend,
    confidence,
    reason: `${change.toFixed(2)}% 30-day move with estimated annualized volatility near ${volatility.toFixed(1)}%. This is a simple statistical estimate, not financial advice.`
  };
}

function formatMoney(value: number | undefined, currency: CurrencyCode) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return formatCurrency(value, currency, value >= 1000, value < 1 ? 5 : 2);
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return number.format(value);
}

function formatChange(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
