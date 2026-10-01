'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supportedAssets } from '@/lib/assets';
import MarketDashboard from '@/components/MarketDashboard';
import PortfolioManager from '@/components/PortfolioManager';
import NewsSentiment from '@/components/NewsSentiment';
import WatchlistAlerts from '@/components/WatchlistAlerts';
import { currencyLabel, formatCurrency, type CurrencyCode, USD_TO_INR } from '@/lib/currency';
import type { Allocation, FrontierPoint, MarketAsset, Objective, OptimizerResponse } from '@/types/portfolio';

const INITIAL_SELECTED = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple'];
const INITIAL_HOLDINGS: Record<string, string> = {
  bitcoin: '5000',
  ethereum: '3500',
  solana: '1800',
  binancecoin: '1200',
  ripple: '750'
};
const COLORS = ['#22d3ee', '#a78bfa', '#4ade80', '#fbbf24', '#fb7185', '#60a5fa', '#f472b6', '#34d399'];

interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export default function Home() {
  const [markets, setMarkets] = useState<MarketAsset[]>(supportedAssets);
  const [selected, setSelected] = useState<string[]>(INITIAL_SELECTED);
  const [holdings, setHoldings] = useState<Record<string, string>>(INITIAL_HOLDINGS);
  const [objective, setObjective] = useState<Objective>('max_sharpe');
  const [days, setDays] = useState(365);
  const [samples, setSamples] = useState(8000);
  const [riskFreeRate, setRiskFreeRate] = useState(4);
  const [minWeight, setMinWeight] = useState(0);
  const [maxWeight, setMaxWeight] = useState(50);
  const [targetReturn, setTargetReturn] = useState(25);
  const [result, setResult] = useState<OptimizerResponse | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [marketSource, setMarketSource] = useState('loading');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/markets')
      .then((response) => response.json())
      .then((data: { assets?: MarketAsset[]; source?: string }) => {
        if (!isMounted) return;
        if (data.assets?.length) setMarkets(data.assets);
        setMarketSource(data.source ?? 'coingecko');
      })
      .catch(() => {
        if (!isMounted) return;
        setMarketSource('offline demo');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/auth/me')
      .then((response) => response.json())
      .then((data: { user?: AuthUser | null }) => {
        if (isMounted) setUser(data.user ?? null);
      })
      .catch(() => {
        if (isMounted) setUser(null);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const savedCurrency = window.localStorage.getItem('displayCurrency');
    if (savedCurrency === 'USD' || savedCurrency === 'INR') setCurrency(savedCurrency);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleError = params.get('authError');
    if (googleError) {
      setAuthError(googleError);
      setAuthMode('login');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  function changeCurrency(value: CurrencyCode) {
    setCurrency(value);
    window.localStorage.setItem('displayCurrency', value);
  }

  const selectedMarkets = useMemo(
    () => markets.filter((asset) => selected.includes(asset.id)),
    [markets, selected]
  );

  const totalHoldingValue = useMemo(
    () => selected.reduce((total, id) => total + toNumber(holdings[id]), 0),
    [selected, holdings]
  );

  function toggleAsset(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((assetId) => assetId !== id);
      return [...current, id];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetIds: selected,
          holdings: selected.map((id) => ({ id, value: toNumber(holdings[id]) })),
          objective,
          days,
          samples,
          riskFreeRate: riskFreeRate / 100,
          minWeight: minWeight / 100,
          maxWeight: maxWeight / 100,
          targetReturn: targetReturn / 100
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to optimize portfolio');
      setResult(data as OptimizerResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to optimize portfolio');
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authMode) return;
    setAuthLoading(true);
    setAuthError('');

    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Authentication failed.');
      setUser(data.user as AuthUser);
      setAuthMode(null);
      setAuthForm({ name: '', email: '', password: '' });
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  return (
    <>
      <a className="skip-link" href="#optimizer">Skip to optimizer</a>
      <header className="shell nav" aria-label="Main navigation">
        <div className="brand" aria-label="Crypto Portfolio Optimizer home">
          <span className="logo" aria-hidden="true">△</span>
          <span>Crypto Optimizer</span>
        </div>
        <nav className="nav-links" aria-label="Page links">
          <a href="#market">Market</a>
          <a href="#news">News</a>
          <a href="#watchlist">Watchlist</a>
          <a href="#portfolio">Portfolio</a>
          <a href="#optimizer">Optimizer</a>
          <a href="#features">Features</a>
          <span className="pill" aria-live="polite">Data: {marketSource}</span>
          <label className="currency-switch">
            <span>Currency</span>
            <select value={currency} onChange={(event) => changeCurrency(event.target.value as CurrencyCode)} aria-label="Display currency">
              <option value="USD">USD $</option>
              <option value="INR">INR ₹</option>
            </select>
          </label>
          {user ? (
            <div className="user-chip">
              <span aria-label={`Signed in as ${user.name}`}>Hi, {user.name.split(' ')[0]}</span>
              <button className="nav-button" type="button" onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <>
              <button className="nav-button" type="button" onClick={() => { setAuthMode('login'); setAuthError(''); }}>Login</button>
              <button className="nav-button primary" type="button" onClick={() => { setAuthMode('signup'); setAuthError(''); }}>Sign up</button>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="shell hero" aria-labelledby="hero-title">
          <div>
            <span className="eyebrow">Live crypto data · MPT optimization · Rebalance actions</span>
            <h1 id="hero-title"><span className="gradient-text">Optimize</span> your crypto portfolio with confidence.</h1>
            <p className="lede">
              A production-ready Next.js portfolio optimizer that fetches market data, computes historical
              risk-return statistics, samples the efficient frontier, and recommends target allocations using
              Modern Portfolio Theory.
            </p>
            <div className="hero-actions">
              <a className="button" href="#optimizer">Start optimizing</a>
              <a className="button secondary" href="#features">See platform features</a>
            </div>
          </div>
          <aside className="panel hero-card" aria-label="Portfolio preview">
            <div className="hero-card-inner">
              <p className="data-note">Efficient frontier preview</p>
              <svg className="mini-chart" viewBox="0 0 520 220" role="img" aria-label="Stylized upward efficient frontier curve">
                <defs>
                  <linearGradient id="line" x1="0" x2="1">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                <path d="M26 184 C 105 150, 165 112, 230 96 S 355 66, 494 24" fill="none" stroke="url(#line)" strokeWidth="8" strokeLinecap="round" />
                <path d="M26 184 C 105 150, 165 112, 230 96 S 355 66, 494 24 L494 208 L26 208 Z" fill="rgba(34, 211, 238, 0.08)" />
                {[40, 90, 142, 198, 260, 326, 390, 462].map((x, index) => (
                  <circle key={x} cx={x} cy={178 - index * 19 + Math.sin(index) * 12} r="7" fill={COLORS[index % COLORS.length]} />
                ))}
              </svg>
              <div className="stat-grid">
                <div className="stat"><b>8k+</b><span>sampled portfolios</span></div>
                <div className="stat"><b>365d</b><span>default history</span></div>
                <div className="stat"><b>WCAG</b><span>accessible UI</span></div>
              </div>
            </div>
          </aside>
        </section>

        <MarketDashboard currency={currency} />

        <NewsSentiment />

        <WatchlistAlerts user={user} currency={currency} onAuthRequest={(mode) => { setAuthMode(mode); setAuthError(''); }} />

        <PortfolioManager user={user} currency={currency} onAuthRequest={(mode) => { setAuthMode(mode); setAuthError(''); }} />

        <section className="shell" id="optimizer" aria-labelledby="optimizer-title">
          <div className="section-title">
            <div>
              <h2 id="optimizer-title">Portfolio optimizer</h2>
              <p>
                Select crypto assets, enter current holding values, choose risk controls, then generate an optimized allocation.
                Display currency: {currencyLabel(currency)}. INR values use an estimated rate of $1 ≈ ₹{USD_TO_INR}.
              </p>
            </div>
            <span className="pill">Total holdings: {formatCurrency(totalHoldingValue, currency)}</span>
          </div>

          <div className="app-grid">
            <form className="panel controls" onSubmit={handleSubmit}>
              <fieldset className="fieldset">
                <legend>Assets and holdings</legend>
                <p className="help">Values are USD notional amounts. Leave a selected asset at 0 if you want a fresh target allocation.</p>
                {markets.map((asset) => {
                  const checked = selected.includes(asset.id);
                  return (
                    <div className="asset-row" key={asset.id}>
                      <input
                        id={`asset-${asset.id}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAsset(asset.id)}
                        aria-label={`Select ${asset.name}`}
                      />
                      <label className="coin-name" htmlFor={`asset-${asset.id}`}>
                        <strong>{asset.symbol} · {asset.name}</strong>
                        <span>
                          {asset.currentPrice > 0 ? formatCurrency(asset.currentPrice, currency, true) : `Rank #${asset.marketCapRank ?? '—'}`}
                          {typeof asset.priceChange24h === 'number' ? ` · 24h ${asset.priceChange24h.toFixed(2)}%` : ''}
                        </span>
                      </label>
                      <input
                        className="input"
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`${asset.name} holding value in USD`}
                        value={holdings[asset.id] ?? ''}
                        disabled={!checked}
                        onChange={(event) => setHoldings((current) => ({ ...current, [asset.id]: event.target.value }))}
                      />
                    </div>
                  );
                })}
              </fieldset>

              <fieldset className="fieldset">
                <legend>Optimization settings</legend>
                <div className="form-grid">
                  <label>
                    Objective
                    <select className="select" value={objective} onChange={(event) => setObjective(event.target.value as Objective)}>
                      <option value="max_sharpe">Max Sharpe ratio</option>
                      <option value="min_variance">Minimum variance</option>
                      <option value="target_return">Target return</option>
                    </select>
                  </label>

                  <label>
                    History window
                    <select className="select" value={days} onChange={(event) => setDays(Number(event.target.value))}>
                      <option value={180}>180 days</option>
                      <option value={365}>365 days</option>
                      <option value={730}>2 years</option>
                      <option value={1095}>3 years</option>
                    </select>
                  </label>

                  <label>
                    Risk-free rate
                    <input className="input" type="number" min="-5" max="20" step="0.25" value={riskFreeRate} onChange={(event) => setRiskFreeRate(Number(event.target.value))} />
                    <span>Annual %, used in Sharpe ratio</span>
                  </label>

                  <label>
                    Samples
                    <select className="select" value={samples} onChange={(event) => setSamples(Number(event.target.value))}>
                      <option value={3000}>Fast · 3,000</option>
                      <option value={8000}>Balanced · 8,000</option>
                      <option value={16000}>Deep · 16,000</option>
                    </select>
                  </label>
                </div>

                <label>
                  Minimum asset weight: {minWeight}%
                  <input type="range" min="0" max="20" step="1" value={minWeight} onChange={(event) => setMinWeight(Number(event.target.value))} />
                  <span>Set to 0% if an asset can be excluded.</span>
                </label>

                <label>
                  Maximum asset weight: {maxWeight}%
                  <input type="range" min="10" max="100" step="5" value={maxWeight} onChange={(event) => setMaxWeight(Number(event.target.value))} />
                  <span>Caps concentration risk in a single crypto.</span>
                </label>

                {objective === 'target_return' && (
                  <label>
                    Target annual return
                    <input className="input" type="number" min="-50" max="500" step="1" value={targetReturn} onChange={(event) => setTargetReturn(Number(event.target.value))} />
                    <span>Annual %, optimizer minimizes volatility if return target is feasible.</span>
                  </label>
                )}
              </fieldset>

              {!user && (
                <div className="notice">
                  Create an account or log in to personalize the dashboard. Optimization still works in demo mode.
                </div>
              )}

              <button className="button full-width" type="submit" disabled={isLoading}>
                {isLoading ? 'Optimizing…' : 'Generate optimized allocation'}
              </button>
              <p className="help">Not financial advice. Crypto assets are volatile and optimization is based on historical data.</p>
            </form>

            <section className="panel results" aria-live="polite" aria-busy={isLoading}>
              {!result && !error && (
                <EmptyState selectedCount={selected.length} />
              )}

              {error && <div className="notice error" role="alert">{error}</div>}

              {result && (
                <ResultView result={result} currency={currency} />
              )}
            </section>
          </div>
        </section>

        <section className="shell" id="features" aria-labelledby="features-title">
          <div className="section-title">
            <div>
              <h2 id="features-title">Production-ready foundation</h2>
              <p>Built as a secure, accessible, full-stack starter that can grow into accounts, saved portfolios, billing, and broker integrations.</p>
            </div>
          </div>
          <div className="feature-grid">
            <article className="panel feature">
              <h3>Live data API layer</h3>
              <p>Server routes fetch CoinGecko markets and historical charts with cache revalidation and synthetic fallback for local development.</p>
            </article>
            <article className="panel feature">
              <h3>MPT engine</h3>
              <p>Annualized log returns, covariance matrix, constrained Monte Carlo sampling, Sharpe ratio, efficient frontier, and rebalance deltas.</p>
            </article>
            <article className="panel feature">
              <h3>Accessible UX</h3>
              <p>Semantic forms, keyboard focus states, reduced-motion support, high-contrast panels, responsive layout, and live result announcements.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="shell footer">
        <p>© 2026 Crypto Portfolio Optimizer. Educational analytics only — no custody, execution, or investment advice.</p>
      </footer>

      {authMode && (
        <AuthDialog
          mode={authMode}
          form={authForm}
          error={authError}
          loading={authLoading}
          onChange={setAuthForm}
          onClose={() => setAuthMode(null)}
          onModeChange={(mode) => { setAuthMode(mode); setAuthError(''); }}
          onSubmit={handleAuthSubmit}
        />
      )}
    </>
  );
}

function AuthDialog({
  mode,
  form,
  error,
  loading,
  onChange,
  onClose,
  onModeChange,
  onSubmit
}: {
  mode: 'login' | 'signup';
  form: { name: string; email: string; password: string };
  error: string;
  loading: boolean;
  onChange: (form: { name: string; email: string; password: string }) => void;
  onClose: () => void;
  onModeChange: (mode: 'login' | 'signup') => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSignup = mode === 'signup';

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="panel auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close authentication dialog">×</button>
        <span className="eyebrow">Secure account</span>
        <h2 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
        <p className="help">
          {isSignup
            ? 'Sign up to personalize the optimizer experience. This local starter stores users in a file for development.'
            : 'Log in with the email and password you used during sign up.'}
        </p>

        {error && <div className="notice error" role="alert">{error}</div>}

        <a className="google-button" href="/api/auth/google">
          <span aria-hidden="true">G</span> Continue with Google
        </a>
        <div className="auth-divider"><span>or use email</span></div>

        <form onSubmit={onSubmit} className="auth-form">
          {isSignup && (
            <label>
              Full name
              <input
                className="input"
                value={form.name}
                autoComplete="name"
                minLength={2}
                required
                onChange={(event) => onChange({ ...form, name: event.target.value })}
              />
            </label>
          )}
          <label>
            Email
            <input
              className="input"
              type="email"
              value={form.email}
              autoComplete="email"
              required
              onChange={(event) => onChange({ ...form, email: event.target.value })}
            />
          </label>
          <label>
            Password
            <input
              className="input"
              type="password"
              value={form.password}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={8}
              required
              onChange={(event) => onChange({ ...form, password: event.target.value })}
            />
            <span>Minimum 8 characters.</span>
          </label>
          <button className="button full-width" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : isSignup ? 'Create account' : 'Login'}
          </button>
        </form>

        <p className="auth-switch">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" onClick={() => onModeChange(isSignup ? 'login' : 'signup')}>
            {isSignup ? 'Login' : 'Create one'}
          </button>
        </p>
      </section>
    </div>
  );
}

function EmptyState({ selectedCount }: { selectedCount: number }) {
  return (
    <div>
      <span className="eyebrow">Ready</span>
      <h2>Configure and run the optimizer.</h2>
      <p className="lede">
        You have selected {selectedCount} assets. The optimizer needs at least two assets and uses your selected history window
        to compute the covariance matrix, risk-return metrics, and the efficient frontier.
      </p>
      <div className="notice">
        Tip: start with Max Sharpe and a 50% max asset cap for a balanced first allocation.
      </div>
    </div>
  );
}

function ResultView({ result, currency }: { result: OptimizerResponse; currency: CurrencyCode }) {
  return (
    <div>
      <div className="section-title">
        <div>
          <h2>Optimized allocation</h2>
          <p>
            Generated {new Date(result.generatedAt).toLocaleString()} · Source: {result.dataSource}
          </p>
        </div>
      </div>

      {result.warnings.map((warning) => (
        <div className="notice" role="status" key={warning}>{warning}</div>
      ))}

      <div className="metrics">
        <Metric label="Expected return" value={formatPercent(result.metrics.expectedReturn)} tone="good" />
        <Metric label="Volatility" value={formatPercent(result.metrics.volatility)} />
        <Metric label="Sharpe ratio" value={result.metrics.sharpeRatio.toFixed(2)} tone="good" />
        <Metric label="Drawdown estimate" value={formatPercent(result.metrics.maxDrawdownEstimate)} tone="warn" />
      </div>

      <AllocationBar allocations={result.allocations} />
      <AllocationTable allocations={result.allocations} currency={currency} />
      <FrontierChart frontier={result.frontier} best={result.metrics} />
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong style={{ color: tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : 'var(--text)' }}>{value}</strong>
    </div>
  );
}

function AllocationBar({ allocations }: { allocations: Allocation[] }) {
  return (
    <div>
      <h3>Target weight split</h3>
      <div className="allocation-bar" aria-label="Target allocation bar">
        {allocations.map((allocation, index) => (
          <div
            className="allocation-segment"
            key={allocation.id}
            style={{ width: `${allocation.weight * 100}%`, background: COLORS[index % COLORS.length] }}
            title={`${allocation.symbol}: ${formatPercent(allocation.weight)}`}
          >
            {allocation.weight > 0.07 ? allocation.symbol : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function AllocationTable({ allocations, currency }: { allocations: Allocation[]; currency: CurrencyCode }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="help" style={{ captionSide: 'bottom', padding: '0.8rem' }}>
          Buy/sell deltas are USD notional values based on the holding inputs.
        </caption>
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col">Target</th>
            <th scope="col">Current</th>
            <th scope="col">Target value</th>
            <th scope="col">Rebalance</th>
            <th scope="col">Risk / Return</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => (
            <tr key={allocation.id}>
              <td><strong>{allocation.symbol}</strong><br /><span className="help">{allocation.name}</span></td>
              <td>{formatPercent(allocation.weight)}</td>
              <td>{formatPercent(allocation.currentWeight)}</td>
              <td>{formatCurrency(allocation.targetValue, currency)}</td>
              <td>
                <span className={`badge ${allocation.action}`}>{allocation.action.toUpperCase()}</span>{' '}
                {formatCurrency(Math.abs(allocation.deltaValue), currency)}
              </td>
              <td>
                <span className="help">Return {formatPercent(allocation.expectedReturn)}</span><br />
                <span className="help">Vol {formatPercent(allocation.volatility)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FrontierChart({ frontier, best }: { frontier: FrontierPoint[]; best: { expectedReturn: number; volatility: number } }) {
  if (!frontier.length) return null;

  const volValues = frontier.map((point) => point.volatility).concat(best.volatility);
  const returnValues = frontier.map((point) => point.expectedReturn).concat(best.expectedReturn);
  const minVol = Math.min(...volValues) * 0.92;
  const maxVol = Math.max(...volValues) * 1.08;
  const minReturn = Math.min(...returnValues) * 0.92;
  const maxReturn = Math.max(...returnValues) * 1.08;
  const width = 780;
  const height = 300;
  const padding = 42;
  const x = (volatility: number) => padding + ((volatility - minVol) / Math.max(maxVol - minVol, 0.0001)) * (width - padding * 2);
  const y = (expectedReturn: number) => height - padding - ((expectedReturn - minReturn) / Math.max(maxReturn - minReturn, 0.0001)) * (height - padding * 2);
  const path = frontier.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.volatility).toFixed(1)} ${y(point.expectedReturn).toFixed(1)}`).join(' ');

  return (
    <div>
      <h3>Efficient frontier</h3>
      <svg className="frontier" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Efficient frontier showing expected return versus volatility">
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="rgba(255,255,255,.24)" />
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} stroke="rgba(255,255,255,.24)" />
        <text x={width / 2} y={height - 8} textAnchor="middle" fill="#9eaccb" fontSize="13">Annualized volatility</text>
        <text x={18} y={height / 2} textAnchor="middle" fill="#9eaccb" fontSize="13" transform={`rotate(-90 18 ${height / 2})`}>Expected return</text>
        <path d={path} fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {frontier.map((point, index) => (
          <circle key={`${point.volatility}-${point.expectedReturn}-${index}`} cx={x(point.volatility)} cy={y(point.expectedReturn)} r="4" fill="#a78bfa" opacity="0.82" />
        ))}
        <circle cx={x(best.volatility)} cy={y(best.expectedReturn)} r="8" fill="#4ade80" stroke="#052e1a" strokeWidth="3" />
      </svg>
    </div>
  );
}

function toNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
