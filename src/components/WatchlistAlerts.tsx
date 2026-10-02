'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supportedAssets } from '@/lib/assets';
import { formatCurrency, type CurrencyCode } from '@/lib/currency';
import { apiFetch } from '@/lib/api';

type AuthUser = { id: string; name: string; email: string; createdAt: string };

type WatchCoin = {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
  marketCapRank?: number;
};

type WatchAlert = {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  direction: 'above' | 'below';
  targetPrice: number;
  currentPrice: number;
  enabled: boolean;
  triggered: boolean;
  createdAt: string;
};

type WatchlistPayload = {
  generatedAt: string;
  source: string;
  coins: WatchCoin[];
  alerts: WatchAlert[];
};

export default function WatchlistAlerts({ user, currency, onAuthRequest }: { user: AuthUser | null; currency: CurrencyCode; onAuthRequest: (mode: 'login' | 'signup') => void }) {
  const [payload, setPayload] = useState<WatchlistPayload | null>(null);
  const [payloadOwnerId, setPayloadOwnerId] = useState<string | null>(null);
  const [coinAssetId, setCoinAssetId] = useState('bitcoin');
  const [alertForm, setAlertForm] = useState({ assetId: 'bitcoin', direction: 'above', targetPrice: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [browserEnabled, setBrowserEnabled] = useState(false);

  const currentPayload = user?.id === payloadOwnerId ? payload : null;

  useEffect(() => {
    if (user) void loadWatchlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const triggeredAlerts = useMemo(() => currentPayload?.alerts.filter((alert) => alert.triggered) ?? [], [currentPayload]);

  function updatePayload(value: WatchlistPayload) {
    setPayload(value);
    setPayloadOwnerId(user?.id ?? null);
  }

  useEffect(() => {
    if (!browserEnabled || typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
    triggeredAlerts.forEach((alert) => {
      new Notification(`${alert.symbol} price alert triggered`, {
        body: `${alert.symbol} is ${formatCurrency(alert.currentPrice, currency)} (${alert.direction} ${formatCurrency(alert.targetPrice, currency)})`
      });
    });
  }, [triggeredAlerts, browserEnabled, currency]);

  async function loadWatchlist() {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/watchlist');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to load watchlist.');
      updatePayload(data as WatchlistPayload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load watchlist.');
    } finally {
      setLoading(false);
    }
  }

  async function addCoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: coinAssetId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to add coin.');
      updatePayload(data as WatchlistPayload);
      setNotice('Coin added to watchlist.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add coin.');
    } finally {
      setSaving(false);
    }
  }

  async function removeCoin(assetId: string) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`/api/watchlist?assetId=${encodeURIComponent(assetId)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to remove coin.');
      updatePayload(data as WatchlistPayload);
      setNotice('Coin removed from watchlist.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove coin.');
    } finally {
      setSaving(false);
    }
  }

  async function addAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch('/api/watchlist/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to add alert.');
      updatePayload(data as WatchlistPayload);
      setNotice('Price alert added.');
      setAlertForm((current) => ({ ...current, targetPrice: '' }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add alert.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAlert(alertId: string) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`/api/watchlist/alerts?alertId=${encodeURIComponent(alertId)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to delete alert.');
      updatePayload(data as WatchlistPayload);
      setNotice('Alert deleted.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete alert.');
    } finally {
      setSaving(false);
    }
  }

  async function enableBrowserNotifications() {
    if (!('Notification' in window)) {
      setNotice('Browser notifications are not supported in this browser.');
      return;
    }
    const permission = await Notification.requestPermission();
    setBrowserEnabled(permission === 'granted');
    setNotice(permission === 'granted' ? 'Browser notifications enabled for triggered alerts.' : 'Browser notifications were not enabled.');
  }

  return (
    <section className="shell watchlist-section" id="watchlist" aria-labelledby="watchlist-title">
      <div className="section-title">
        <div>
          <h2 id="watchlist-title">Watchlist & price alerts</h2>
          <p>Add favorite coins, track daily changes, set price alerts, and optionally trigger browser notifications.</p>
        </div>
        {currentPayload && <span className="pill">Alerts: {currentPayload.alerts.length} · Source: {currentPayload.source}</span>}
      </div>

      {!user && (
        <div className="panel auth-required">
          <span className="eyebrow">Login required</span>
          <h3>Login to create a personal watchlist.</h3>
          <p className="lede">Watchlist coins and alerts are saved to your account.</p>
          <div className="hero-actions">
            <button className="button" type="button" onClick={() => onAuthRequest('signup')}>Create account</button>
            <button className="button secondary" type="button" onClick={() => onAuthRequest('login')}>Login</button>
          </div>
        </div>
      )}

      {user && (
        <>
          {loading && <div className="panel loading-card">Loading watchlist…</div>}
          {error && <div className="notice error" role="alert">{error}</div>}
          {notice && <div className="notice" role="status">{notice}</div>}
          {triggeredAlerts.length > 0 && <div className="notice error" role="alert">{triggeredAlerts.length} price alert{triggeredAlerts.length > 1 ? 's are' : ' is'} triggered now.</div>}

          <div className="watchlist-forms">
            <form className="panel portfolio-form" onSubmit={addCoin}>
              <h3>Add favorite coin</h3>
              <label>
                Coin
                <select className="select" value={coinAssetId} onChange={(event) => setCoinAssetId(event.target.value)}>
                  {supportedAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}
                </select>
              </label>
              <button className="button full-width" type="submit" disabled={saving}>Add to watchlist</button>
            </form>

            <form className="panel portfolio-form" onSubmit={addAlert}>
              <h3>Create price alert</h3>
              <div className="form-grid">
                <label>
                  Coin
                  <select className="select" value={alertForm.assetId} onChange={(event) => setAlertForm((current) => ({ ...current, assetId: event.target.value }))}>
                    {supportedAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol}</option>)}
                  </select>
                </label>
                <label>
                  Direction
                  <select className="select" value={alertForm.direction} onChange={(event) => setAlertForm((current) => ({ ...current, direction: event.target.value }))}>
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                </label>
              </div>
              <label>
                Target price in USD
                <input className="input" type="number" min="0" step="any" required value={alertForm.targetPrice} onChange={(event) => setAlertForm((current) => ({ ...current, targetPrice: event.target.value }))} />
                <span>Displayed as {currency}; stored as USD.</span>
              </label>
              <button className="button full-width" type="submit" disabled={saving}>Add alert</button>
            </form>

            <div className="panel portfolio-form">
              <h3>Notifications</h3>
              <p className="help">Browser notifications work while this website is open. Email and Telegram alerts can be added later with a background worker.</p>
              <button className="button secondary full-width" type="button" onClick={enableBrowserNotifications}>Enable browser notifications</button>
              <button className="button secondary full-width" type="button" onClick={loadWatchlist}>Refresh prices</button>
            </div>
          </div>

          {currentPayload && (
            <>
              <div className="watchlist-grid">
                {currentPayload.coins.length ? currentPayload.coins.map((coin) => (
                  <article className="panel watch-coin" key={coin.id}>
                    <div>
                      <strong>{coin.symbol}</strong>
                      <span>{coin.name}</span>
                    </div>
                    <b>{formatCurrency(coin.currentPrice, currency)}</b>
                    <span className={coin.priceChange24h >= 0 ? 'change-positive' : 'change-negative'}>{formatPct(coin.priceChange24h)}</span>
                    <button className="nav-button danger" type="button" onClick={() => removeCoin(coin.id)}>Remove</button>
                  </article>
                )) : <div className="panel loading-card">No watchlist coins yet.</div>}
              </div>

              <div className="panel portfolio-table-card">
                <h3>Price alerts</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Coin</th><th>Condition</th><th>Current</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
                    <tbody>
                      {currentPayload.alerts.length ? currentPayload.alerts.map((alert) => (
                        <tr key={alert.id}>
                          <td><strong>{alert.symbol}</strong><br /><span className="help">{alert.name}</span></td>
                          <td>{alert.direction.toUpperCase()} {formatCurrency(alert.targetPrice, currency)}</td>
                          <td>{formatCurrency(alert.currentPrice, currency)}</td>
                          <td><span className={`badge ${alert.triggered ? 'sell' : 'hold'}`}>{alert.triggered ? 'TRIGGERED' : 'WAITING'}</span></td>
                          <td>{new Date(alert.createdAt).toLocaleDateString()}</td>
                          <td><button className="nav-button danger" type="button" onClick={() => deleteAlert(alert.id)}>Delete</button></td>
                        </tr>
                      )) : <tr><td colSpan={6}>No alerts yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function formatPct(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
