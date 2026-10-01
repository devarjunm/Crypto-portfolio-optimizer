'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type NewsItem = {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  coinTags: string[];
  sentiment: { score: number; label: 'Bullish' | 'Neutral' | 'Bearish'; confidence: number };
};

type NewsPayload = {
  generatedAt: string;
  source: string;
  aggregate: { label: string; score: number; confidence: number };
  items: NewsItem[];
};

export default function NewsSentiment() {
  const [payload, setPayload] = useState<NewsPayload | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadNews('');
  }, []);

  async function loadNews(search: string) {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`/api/news${search ? `?q=${encodeURIComponent(search)}` : ''}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to load news.');
      setPayload(data as NewsPayload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load news.');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadNews(query.trim());
  }

  return (
    <section className="shell news-section" id="news" aria-labelledby="news-title">
      <div className="section-title">
        <div>
          <h2 id="news-title">News & sentiment</h2>
          <p>Latest crypto headlines with rule-based AI sentiment. Filter by coin names like Bitcoin, Ethereum, SOL, XRP, or DOGE.</p>
        </div>
        {payload && <span className={`sentiment-pill ${payload.aggregate.label.toLowerCase()}`}>{payload.aggregate.label} · {payload.aggregate.confidence}%</span>}
      </div>

      <form className="market-search panel" onSubmit={submit} role="search" aria-label="Search crypto news">
        <label className="search-label">
          Filter news by coin or keyword
          <input className="input" value={query} placeholder="bitcoin, ethereum, ETF, hack..." onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button className="button" type="submit" disabled={loading}>{loading ? 'Loading…' : 'Search news'}</button>
      </form>

      {error && <div className="notice error" role="alert">{error}</div>}
      {loading && <div className="panel loading-card">Loading crypto news and sentiment…</div>}

      {payload && !loading && (
        <>
          <div className="news-overview">
            <div className="panel market-stat">
              <span>Overall sentiment</span>
              <strong>{payload.aggregate.label}</strong>
              <small>Score {payload.aggregate.score} · Confidence {payload.aggregate.confidence}%</small>
            </div>
            <div className="panel market-stat">
              <span>Headlines analyzed</span>
              <strong>{payload.items.length}</strong>
              <small>Source: {payload.source}</small>
            </div>
            <div className="panel market-stat">
              <span>Updated</span>
              <strong>{new Date(payload.generatedAt).toLocaleTimeString()}</strong>
              <small>Refresh page or search to update</small>
            </div>
          </div>

          <div className="news-grid">
            {payload.items.map((item) => (
              <article className="panel news-card" key={item.id}>
                <div className="news-card-top">
                  <span className={`sentiment-pill ${item.sentiment.label.toLowerCase()}`}>{item.sentiment.label} {item.sentiment.confidence}%</span>
                  <small>{item.source}</small>
                </div>
                <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3>
                <p>{item.description || 'No description available.'}</p>
                <div className="news-tags">
                  {item.coinTags.length ? item.coinTags.map((tag) => <span key={tag}>{tag}</span>) : <span>GENERAL</span>}
                  <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleString()}</time>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
