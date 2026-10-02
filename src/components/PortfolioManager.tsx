'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supportedAssets } from '@/lib/assets';
import { formatCurrency, type CurrencyCode } from '@/lib/currency';
import { apiFetch } from '@/lib/api';

type AuthUser = { id: string; name: string; email: string; createdAt: string };

type EnrichedHolding = {
  assetId: string;
  symbol: string;
  name: string;
  quantity: number;
  averageBuyPrice: number;
  currentPrice: number;
  priceChange24h: number;
  currentValue: number;
  costBasis: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  dailyGain: number;
  allocationWeight: number;
};

type StoredTransaction = {
  id: string;
  assetId: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  date: string;
  realizedGain: number;
  notes?: string;
};

type PortfolioSnapshot = {
  generatedAt: string;
  source: string;
  holdings: EnrichedHolding[];
  transactions: StoredTransaction[];
  summary: {
    totalValue: number;
    totalCostBasis: number;
    totalUnrealizedGain: number;
    totalRealizedGain: number;
    totalProfitLoss: number;
    totalProfitLossPct: number;
    dailyProfitLoss: number;
    dailyProfitLossPct: number;
    bestPerformer?: EnrichedHolding;
    worstPerformer?: EnrichedHolding;
  };
  analytics: {
    allocation: Array<{ assetId: string; symbol: string; name: string; value: number; weight: number }>;
    diversificationScore: number;
    riskScore: number;
    riskLevel: 'Low' | 'Medium' | 'High';
    aiSuggestions: Array<{ title: string; action: 'Buy' | 'Hold' | 'Reduce' | 'Avoid'; confidence: number; reason: string }>;
  };
  importResult?: { imported: number };
};

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });
const COLORS = ['#22d3ee', '#a78bfa', '#4ade80', '#fbbf24', '#fb7185', '#60a5fa', '#f472b6', '#34d399'];

export default function PortfolioManager({ user, currency, onAuthRequest }: { user: AuthUser | null; currency: CurrencyCode; onAuthRequest: (mode: 'login' | 'signup') => void }) {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [snapshotOwnerId, setSnapshotOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [holdingForm, setHoldingForm] = useState({ assetId: 'bitcoin', quantity: '', averageBuyPrice: '' });
  const [transactionForm, setTransactionForm] = useState({ assetId: 'bitcoin', type: 'buy', quantity: '', price: '', fee: '0', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [csv, setCsv] = useState('assetId,quantity,averageBuyPrice\n');

  const currentSnapshot = user?.id === snapshotOwnerId ? snapshot : null;

  const updateSnapshot = useCallback((value: PortfolioSnapshot) => {
    setSnapshot(value);
    setSnapshotOwnerId(user?.id ?? null);
  }, [user?.id]);

  const refreshPortfolio = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/portfolio');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to load portfolio.');
      updateSnapshot(data as PortfolioSnapshot);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load portfolio.');
    } finally {
      setLoading(false);
    }
  }, [updateSnapshot]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void refreshPortfolio();
    });
    return () => { active = false; };
  }, [user, refreshPortfolio]);

  async function submitHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const url = editingAssetId ? `/api/portfolio/holdings/${editingAssetId}` : '/api/portfolio/holdings';
      const response = await apiFetch(url, {
        method: editingAssetId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holdingForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to save holding.');
      updateSnapshot(data as PortfolioSnapshot);
      setNotice(editingAssetId ? 'Holding updated.' : 'Holding added.');
      setEditingAssetId(null);
      setHoldingForm({ assetId: 'bitcoin', quantity: '', averageBuyPrice: '' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save holding.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteHolding(assetId: string) {
    if (!confirm('Delete this holding? Transaction history will remain.')) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`/api/portfolio/holdings/${assetId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to delete holding.');
      updateSnapshot(data as PortfolioSnapshot);
      setNotice('Holding deleted.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete holding.');
    } finally {
      setSaving(false);
    }
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch('/api/portfolio/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transactionForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to add transaction.');
      updateSnapshot(data as PortfolioSnapshot);
      setNotice(`${transactionForm.type === 'buy' ? 'Buy' : 'Sell'} transaction added.`);
      setTransactionForm((current) => ({ ...current, quantity: '', price: '', fee: '0', notes: '' }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add transaction.');
    } finally {
      setSaving(false);
    }
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch('/api/portfolio/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to import CSV.');
      updateSnapshot(data as PortfolioSnapshot);
      setNotice(`Imported ${data.importResult?.imported ?? 0} holdings from CSV.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to import CSV.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(holding: EnrichedHolding) {
    setEditingAssetId(holding.assetId);
    setHoldingForm({
      assetId: holding.assetId,
      quantity: String(holding.quantity),
      averageBuyPrice: String(holding.averageBuyPrice)
    });
  }

  return (
    <section className="shell portfolio-section" id="portfolio" aria-labelledby="portfolio-title">
      <div className="section-title">
        <div>
          <h2 id="portfolio-title">Portfolio management</h2>
          <p>Add/edit/delete holdings, record buy/sell transactions, import CSV data, and track value, profit/loss, gains, allocation, and AI risk insights.</p>
        </div>
        {currentSnapshot && <span className="pill">Portfolio data: {currentSnapshot.source}</span>}
      </div>

      {!user && (
        <div className="panel auth-required">
          <span className="eyebrow">Account required</span>
          <h3>Login to manage your personal portfolio.</h3>
          <p className="lede">Your holdings and transactions are connected to your account, so sign up or login before adding portfolio data.</p>
          <div className="hero-actions">
            <button className="button" type="button" onClick={() => onAuthRequest('signup')}>Create account</button>
            <button className="button secondary" type="button" onClick={() => onAuthRequest('login')}>Login</button>
          </div>
        </div>
      )}

      {user && (
        <>
          {loading && <div className="panel loading-card">Loading portfolio…</div>}
          {error && <div className="notice error" role="alert">{error}</div>}
          {notice && <div className="notice" role="status">{notice}</div>}

          {currentSnapshot && <SummaryCards snapshot={currentSnapshot} currency={currency} />}

          <div className="portfolio-grid">
            <form className="panel portfolio-form" onSubmit={submitHolding}>
              <h3>{editingAssetId ? 'Edit holding' : 'Add cryptocurrency holding'}</h3>
              <label>
                Asset
                <select className="select" value={holdingForm.assetId} disabled={Boolean(editingAssetId)} onChange={(event) => setHoldingForm((current) => ({ ...current, assetId: event.target.value }))}>
                  {supportedAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}
                </select>
              </label>
              <label>
                Quantity
                <input className="input" type="number" min="0" step="any" required value={holdingForm.quantity} onChange={(event) => setHoldingForm((current) => ({ ...current, quantity: event.target.value }))} />
              </label>
              <label>
                Average buy price
                <input className="input" type="number" min="0" step="any" required value={holdingForm.averageBuyPrice} onChange={(event) => setHoldingForm((current) => ({ ...current, averageBuyPrice: event.target.value }))} />
              </label>
              <button className="button full-width" type="submit" disabled={saving}>{editingAssetId ? 'Save holding' : 'Add holding'}</button>
              {editingAssetId && <button className="button secondary full-width" type="button" onClick={() => { setEditingAssetId(null); setHoldingForm({ assetId: 'bitcoin', quantity: '', averageBuyPrice: '' }); }}>Cancel edit</button>}
            </form>

            <form className="panel portfolio-form" onSubmit={submitTransaction}>
              <h3>Buy/Sell transaction</h3>
              <div className="form-grid">
                <label>
                  Type
                  <select className="select" value={transactionForm.type} onChange={(event) => setTransactionForm((current) => ({ ...current, type: event.target.value }))}>
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </label>
                <label>
                  Asset
                  <select className="select" value={transactionForm.assetId} onChange={(event) => setTransactionForm((current) => ({ ...current, assetId: event.target.value }))}>
                    {supportedAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>Quantity<input className="input" type="number" min="0" step="any" required value={transactionForm.quantity} onChange={(event) => setTransactionForm((current) => ({ ...current, quantity: event.target.value }))} /></label>
                <label>Price<input className="input" type="number" min="0" step="any" required value={transactionForm.price} onChange={(event) => setTransactionForm((current) => ({ ...current, price: event.target.value }))} /></label>
              </div>
              <div className="form-grid">
                <label>Fee<input className="input" type="number" min="0" step="any" value={transactionForm.fee} onChange={(event) => setTransactionForm((current) => ({ ...current, fee: event.target.value }))} /></label>
                <label>Date<input className="input" type="date" value={transactionForm.date} onChange={(event) => setTransactionForm((current) => ({ ...current, date: event.target.value }))} /></label>
              </div>
              <label>Notes<input className="input" value={transactionForm.notes} onChange={(event) => setTransactionForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <button className="button full-width" type="submit" disabled={saving}>Add transaction</button>
            </form>

            <form className="panel portfolio-form" onSubmit={importCsv}>
              <h3>Import portfolio via CSV</h3>
              <p className="help">Headers supported: assetId or symbol, quantity, averageBuyPrice.</p>
              <textarea className="input csv-input" value={csv} onChange={(event) => setCsv(event.target.value)} aria-label="CSV portfolio import text" />
              <button className="button full-width" type="submit" disabled={saving}>Import CSV</button>
            </form>
          </div>

          {currentSnapshot && (
            <>
              <div className="portfolio-analytics-grid">
                <AllocationPie snapshot={currentSnapshot} />
                <RiskPanel snapshot={currentSnapshot} />
                <GrowthChart />
              </div>
              <HoldingsTable holdings={currentSnapshot.holdings} currency={currency} onEdit={startEdit} onDelete={deleteHolding} />
              <TransactionsTable transactions={currentSnapshot.transactions} currency={currency} />
            </>
          )}
        </>
      )}
    </section>
  );
}

function SummaryCards({ snapshot, currency }: { snapshot: PortfolioSnapshot; currency: CurrencyCode }) {
  const { summary } = snapshot;
  return (
    <div className="portfolio-summary">
      <SummaryCard label="Total Portfolio Value" value={formatCurrency(summary.totalValue, currency)} />
      <SummaryCard label="Today's Profit/Loss" value={formatCurrency(summary.dailyProfitLoss, currency)} tone={summary.dailyProfitLoss >= 0 ? 'good' : 'bad'} detail={formatPct(summary.dailyProfitLossPct)} />
      <SummaryCard label="Total Profit/Loss" value={formatCurrency(summary.totalProfitLoss, currency)} tone={summary.totalProfitLoss >= 0 ? 'good' : 'bad'} detail={formatPct(summary.totalProfitLossPct)} />
      <SummaryCard label="Unrealized Gains" value={formatCurrency(summary.totalUnrealizedGain, currency)} tone={summary.totalUnrealizedGain >= 0 ? 'good' : 'bad'} />
      <SummaryCard label="Realized Gains" value={formatCurrency(summary.totalRealizedGain, currency)} tone={summary.totalRealizedGain >= 0 ? 'good' : 'bad'} />
      <SummaryCard label="Best Coin" value={summary.bestPerformer?.symbol ?? '—'} detail={summary.bestPerformer ? formatPct(summary.bestPerformer.unrealizedGainPct) : undefined} />
      <SummaryCard label="Worst Coin" value={summary.worstPerformer?.symbol ?? '—'} detail={summary.worstPerformer ? formatPct(summary.worstPerformer.unrealizedGainPct) : undefined} />
      <SummaryCard label="Diversification" value={`${snapshot.analytics.diversificationScore.toFixed(0)}/100`} />
    </div>
  );
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'good' | 'bad' }) {
  return <div className="panel market-stat"><span>{label}</span><strong style={{ color: tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : undefined }}>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function AllocationPie({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const segments = snapshot.analytics.allocation;
  return (
    <article className="panel analytics-card">
      <h3>Asset allocation</h3>
      <svg className="pie-chart" viewBox="0 0 220 220" role="img" aria-label="Portfolio allocation pie chart">
        <circle cx="110" cy="110" r="72" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="42" />
        {segments.map((segment, index) => {
          const dash = segment.weight * 452.39;
          const gap = 452.39 - dash;
          const cumulativeWeight = segments.slice(0, index).reduce((total, item) => total + item.weight, 0);
          const offset = -cumulativeWeight * 452.39;
          return <circle key={segment.assetId} cx="110" cy="110" r="72" fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="42" strokeDasharray={`${dash} ${gap}`} strokeDashoffset={offset} transform="rotate(-90 110 110)" />;
        })}
        <text x="110" y="104" textAnchor="middle" fill="#f7f9ff" fontSize="20" fontWeight="900">{segments.length}</text>
        <text x="110" y="126" textAnchor="middle" fill="#9eaccb" fontSize="12">assets</text>
      </svg>
      <div className="allocation-legend">
        {segments.map((segment, index) => <span key={segment.assetId}><i style={{ background: COLORS[index % COLORS.length] }} />{segment.symbol} {formatPct(segment.weight * 100)}</span>)}
      </div>
    </article>
  );
}

function RiskPanel({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const risk = snapshot.analytics.riskScore;
  return (
    <article className="panel analytics-card">
      <h3>AI risk analysis</h3>
      <div className="risk-score"><strong>{risk} / 100</strong><span>{snapshot.analytics.riskLevel} Risk</span></div>
      <div className="risk-meter" aria-label={`Risk score ${risk} out of 100`}><span style={{ width: `${risk}%` }} /></div>
      <p className="help">Calculated from concentration, diversification, and portfolio profit/loss pressure.</p>
      <div className="ai-suggestions">
        {snapshot.analytics.aiSuggestions.map((suggestion) => (
          <div className="ai-card" key={suggestion.title}>
            <span className={`badge ${suggestion.action === 'Buy' ? 'buy' : suggestion.action === 'Reduce' || suggestion.action === 'Avoid' ? 'sell' : 'hold'}`}>{suggestion.action}</span>
            <strong>{suggestion.title}</strong>
            <small>Confidence {suggestion.confidence}%</small>
            <p>{suggestion.reason}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function GrowthChart() {
  return (
    <article className="panel analytics-card">
      <h3>Portfolio history</h3>
      <p className="help">Historical portfolio valuation is not available yet. Current value and gains use live CoinGecko prices.</p>
    </article>
  );
}

function HoldingsTable({ holdings, currency, onEdit, onDelete }: { holdings: EnrichedHolding[]; currency: CurrencyCode; onEdit: (holding: EnrichedHolding) => void; onDelete: (assetId: string) => void }) {
  return (
    <div className="panel portfolio-table-card">
      <h3>Holdings</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Asset</th><th>Quantity</th><th>Avg buy</th><th>Current price</th><th>Value</th><th>Unrealized P/L</th><th>Daily P/L</th><th>Actions</th></tr></thead>
          <tbody>
            {holdings.length ? holdings.map((holding) => (
              <tr key={holding.assetId}>
                <td><strong>{holding.symbol}</strong><br /><span className="help">{holding.name}</span></td>
                <td>{number.format(holding.quantity)}</td>
                <td>{formatCurrency(holding.averageBuyPrice, currency)}</td>
                <td>{formatCurrency(holding.currentPrice, currency)} <span className={holding.priceChange24h >= 0 ? 'change-positive' : 'change-negative'}>({formatPct(holding.priceChange24h)})</span></td>
                <td>{formatCurrency(holding.currentValue, currency)}</td>
                <td><span className={holding.unrealizedGain >= 0 ? 'change-positive' : 'change-negative'}>{formatCurrency(holding.unrealizedGain, currency)} ({formatPct(holding.unrealizedGainPct)})</span></td>
                <td><span className={holding.dailyGain >= 0 ? 'change-positive' : 'change-negative'}>{formatCurrency(holding.dailyGain, currency)}</span></td>
                <td><div className="table-actions"><button className="nav-button" type="button" onClick={() => onEdit(holding)}>Edit</button><button className="nav-button danger" type="button" onClick={() => onDelete(holding.assetId)}>Delete</button></div></td>
              </tr>
            )) : <tr><td colSpan={8}>No holdings yet. Add your first holding above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionsTable({ transactions, currency }: { transactions: StoredTransaction[]; currency: CurrencyCode }) {
  return (
    <div className="panel portfolio-table-card">
      <h3>Buy/Sell transaction history</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Asset</th><th>Quantity</th><th>Price</th><th>Fee</th><th>Realized gain</th><th>Notes</th></tr></thead>
          <tbody>
            {transactions.length ? transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{new Date(transaction.date).toLocaleDateString()}</td>
                <td><span className={`badge ${transaction.type === 'buy' ? 'buy' : 'sell'}`}>{transaction.type.toUpperCase()}</span></td>
                <td>{transaction.assetId.toUpperCase()}</td>
                <td>{number.format(transaction.quantity)}</td>
                <td>{formatCurrency(transaction.price, currency)}</td>
                <td>{formatCurrency(transaction.fee, currency)}</td>
                <td><span className={transaction.realizedGain >= 0 ? 'change-positive' : 'change-negative'}>{formatCurrency(transaction.realizedGain, currency)}</span></td>
                <td>{transaction.notes ?? '—'}</td>
              </tr>
            )) : <tr><td colSpan={8}>No transactions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPct(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
