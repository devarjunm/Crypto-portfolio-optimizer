'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { formatCurrency, type CurrencyCode } from '@/lib/currency';
import { apiFetch } from '@/lib/api';

type MarketCoin = {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price: number;
  market_cap?: number;
  market_cap_rank?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
};

type SearchCoin = {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number;
  thumb?: string;
  large?: string;
};

type TrendingCoin = {
  id?: string;
  name?: string;
  symbol?: string;
  small?: string;
  market_cap_rank?: number;
  score?: number;
};

type MarketOverview = {
  generatedAt: string;
  source: string;
  global: {
    activeCryptocurrencies: number;
    totalMarketCapUsd: number | null;
    totalVolumeUsd: number | null;
    btcDominance: number | null;
  };
  fearGreed: null | { value: number; classification: string; source: string };
  markets: MarketCoin[];
  topGainers: MarketCoin[];
  topLosers: MarketCoin[];
  trending: TrendingCoin[];
  warnings?: string[];
};



export default function MarketDashboard({ currency }: { currency: CurrencyCode }) {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchCoin[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/api/market/overview')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Live market data is temporarily unavailable. Please try again.');
        return data as MarketOverview;
      })
      .then((data) => {
        if (!active) return;
        setOverview(data);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load live market dashboard right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const response = await apiFetch(`/api/coins/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json() as { coins?: SearchCoin[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Unable to search CoinGecko right now.');
      setSearchResults(data.coins ?? []);
    } catch {
      setSearchResults([]);
      setError('Live coin search is temporarily unavailable. Please try again.');
    } finally {
      setSearching(false);
    }
  }

  const topVolume = useMemo(() => {
    return [...(overview?.markets ?? [])].sort((a, b) => (b.total_volume ?? 0) - (a.total_volume ?? 0)).slice(0, 5);
  }, [overview]);

  return (
    <section className="shell market-section" id="market" aria-labelledby="market-title">
      <div className="section-title">
        <div>
          <h2 id="market-title">Live market dashboard</h2>
          <p>
            Track CoinGecko crypto prices, market cap, volume, trending coins, top gainers and losers,
            BTC dominance, and search for any coin.
          </p>
        </div>
        <span className="pill" aria-live="polite">
          {overview ? `Updated ${new Date(overview.generatedAt).toLocaleTimeString()}` : 'Loading market data'}
        </span>
      </div>

      {error && <div className="notice error" role="alert">{error}</div>}
      {overview?.warnings?.map((warning) => <div className="notice" role="status" key={warning}>{warning}</div>)}

      <form className="market-search panel" onSubmit={handleSearch} role="search" aria-label="Search cryptocurrency">
        <label className="search-label">
          Search any coin
          <input
            className="input"
            value={query}
            placeholder="Search Bitcoin, Ethereum, Solana..."
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="button" type="submit" disabled={searching || query.trim().length < 2}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searchResults.length > 0 && (
        <div className="search-results panel" aria-label="Coin search results">
          {searchResults.map((coin) => (
            <a key={coin.id} href={`/coin/${coin.id}`} className="search-result-card">
              {coin.thumb || coin.large ? <img src={coin.thumb || coin.large} alt="" /> : <span className="coin-initials">{coin.symbol?.slice(0, 2)}</span>}
              <span><strong>{coin.name}</strong><small>{coin.symbol?.toUpperCase()} · Rank #{coin.market_cap_rank ?? '—'}</small></span>
            </a>
          ))}
        </div>
      )}

      {loading && <div className="panel loading-card">Loading live market data…</div>}

      {overview && (
        <>
          <div className="market-stats">
            <MarketStat label="Market Cap" value={overview.global.totalMarketCapUsd === null ? 'Unavailable' : formatCurrency(overview.global.totalMarketCapUsd, currency, true)} />
            <MarketStat label="24h Volume" value={overview.global.totalVolumeUsd === null ? 'Unavailable' : formatCurrency(overview.global.totalVolumeUsd, currency, true)} />
            <MarketStat label="BTC Dominance" value={overview.global.btcDominance === null ? 'Unavailable' : `${overview.global.btcDominance.toFixed(1)}%`} />
            <MarketStat label="Fear & Greed" value="Unavailable" detail="Not provided by CoinGecko" />
          </div>

          <div className="market-grid">
            <MarketList title="Top gainers" coins={overview.topGainers} positive />
            <MarketList title="Top losers" coins={overview.topLosers} />
            <TrendingList coins={overview.trending} />
            <VolumeList coins={topVolume} currency={currency} />
          </div>

          <div className="panel market-table-card">
            <div className="section-title compact">
              <div>
                <h3>Live cryptocurrency prices</h3>
                <p>Top coins by market capitalization. Click any coin for a details page.</p>
              </div>
              <span className="pill">Source: {overview.source}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Coin</th>
                    <th scope="col">Price</th>
                    <th scope="col">24h</th>
                    <th scope="col">7d</th>
                    <th scope="col">30d</th>
                    <th scope="col">Market cap</th>
                    <th scope="col">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.markets.map((coin) => (
                    <tr key={coin.id}>
                      <td>#{coin.market_cap_rank ?? '—'}</td>
                      <td>
                        <a className="coin-link" href={`/coin/${coin.id}`}>
                          {coin.image ? <img src={coin.image} alt="" /> : null}
                          <span><strong>{coin.name}</strong><small>{coin.symbol.toUpperCase()}</small></span>
                        </a>
                      </td>
                      <td>{formatPrice(coin.current_price, currency)}</td>
                      <td><Change value={coin.price_change_percentage_24h} /></td>
                      <td><Change value={coin.price_change_percentage_7d_in_currency} /></td>
                      <td><Change value={coin.price_change_percentage_30d_in_currency} /></td>
                      <td>{coin.market_cap ? formatCurrency(coin.market_cap, currency, true) : '—'}</td>
                      <td>{coin.total_volume ? formatCurrency(coin.total_volume, currency, true) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function MarketStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="panel market-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function MarketList({ title, coins, positive = false }: { title: string; coins: MarketCoin[]; positive?: boolean }) {
  return (
    <article className="panel market-list">
      <h3>{title}</h3>
      {coins.slice(0, 6).map((coin) => (
        <a href={`/coin/${coin.id}`} className="market-list-row" key={coin.id}>
          <span><strong>{coin.symbol.toUpperCase()}</strong><small>{coin.name}</small></span>
          <span className={positive ? 'change-positive' : 'change-negative'}>{formatChange(coin.price_change_percentage_24h)}</span>
        </a>
      ))}
    </article>
  );
}

function TrendingList({ coins }: { coins: TrendingCoin[] }) {
  return (
    <article className="panel market-list">
      <h3>Trending coins</h3>
      {coins.slice(0, 6).map((coin, index) => (
        <a href={`/coin/${coin.id ?? coin.name ?? index}`} className="market-list-row" key={`${coin.id}-${index}`}>
          <span><strong>{coin.symbol?.toUpperCase() ?? 'COIN'}</strong><small>{coin.name ?? 'Trending coin'}</small></span>
          <span className="rank-badge">#{coin.market_cap_rank ?? index + 1}</span>
        </a>
      ))}
    </article>
  );
}

function VolumeList({ coins, currency }: { coins: MarketCoin[]; currency: CurrencyCode }) {
  return (
    <article className="panel market-list">
      <h3>Highest volume</h3>
      {coins.map((coin) => (
        <a href={`/coin/${coin.id}`} className="market-list-row" key={coin.id}>
          <span><strong>{coin.symbol.toUpperCase()}</strong><small>{coin.name}</small></span>
          <span>{coin.total_volume ? formatCurrency(coin.total_volume, currency, true) : '—'}</span>
        </a>
      ))}
    </article>
  );
}

function Change({ value }: { value?: number }) {
  return <span className={(value ?? 0) >= 0 ? 'change-positive' : 'change-negative'}>{formatChange(value)}</span>;
}

function formatChange(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatPrice(value: number | undefined, currency: CurrencyCode) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return formatCurrency(value, currency, value >= 1000, value < 1 ? 5 : 2);
}
