import { NextRequest, NextResponse } from 'next/server';
import { analyzeSentiment } from '@/lib/sentiment';

export const runtime = 'nodejs';

type NewsItem = {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  coinTags: string[];
  sentiment: ReturnType<typeof analyzeSentiment>;
};

const fallbackNews = [
  {
    title: 'Bitcoin traders watch liquidity as market attempts recovery',
    description: 'Analysts say Bitcoin remains volatile but institutional inflows and improving liquidity are supporting a cautious recovery.',
    url: 'https://www.coindesk.com/',
    source: 'Fallback News',
    publishedAt: new Date().toISOString()
  },
  {
    title: 'Ethereum upgrade narrative stays positive as staking demand grows',
    description: 'Ethereum sentiment is supported by staking growth, adoption, and developer activity, although macro risk remains.',
    url: 'https://cointelegraph.com/',
    source: 'Fallback News',
    publishedAt: new Date(Date.now() - 3600_000).toISOString()
  },
  {
    title: 'Altcoins face selloff after liquidation spike',
    description: 'Several smaller tokens declined as leverage reset and traders reduced risk exposure.',
    url: 'https://decrypt.co/',
    source: 'Fallback News',
    publishedAt: new Date(Date.now() - 7200_000).toISOString()
  }
];

const rssFeeds = [
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { source: 'Decrypt', url: 'https://decrypt.co/feed' }
];

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? '';
  let rawItems: Array<Omit<NewsItem, 'id' | 'coinTags' | 'sentiment'>> = [];
  let source: 'rss' | 'fallback' = 'rss';

  try {
    const feeds = await Promise.allSettled(rssFeeds.map(async (feed) => {
      const response = await fetch(feed.url, { next: { revalidate: 300 } });
      if (!response.ok) throw new Error(`${feed.source} failed`);
      const xml = await response.text();
      return parseRss(xml, feed.source);
    }));
    rawItems = feeds.flatMap((feed) => feed.status === 'fulfilled' ? feed.value : []).slice(0, 30);
    if (!rawItems.length) throw new Error('No RSS items');
  } catch {
    rawItems = fallbackNews;
    source = 'fallback';
  }

  const items = rawItems.map((item, index) => {
    const coinTags = detectCoinTags(`${item.title} ${item.description}`);
    return {
      ...item,
      id: `${item.source}-${index}-${Buffer.from(item.title).toString('base64url').slice(0, 12)}`,
      coinTags,
      sentiment: analyzeSentiment(`${item.title}. ${item.description}`)
    } satisfies NewsItem;
  }).filter((item) => {
    if (!query) return true;
    return `${item.title} ${item.description} ${item.coinTags.join(' ')}`.toLowerCase().includes(query);
  });

  const aggregate = aggregateSentiment(items);
  return NextResponse.json({ generatedAt: new Date().toISOString(), source, items: items.slice(0, 24), aggregate });
}

function parseRss(xml: string, source: string) {
  const itemMatches = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 12);
  return itemMatches.map((match) => {
    const block = match[0];
    return {
      title: decodeXml(extract(block, 'title') || 'Untitled crypto news'),
      description: stripHtml(decodeXml(extract(block, 'description') || extract(block, 'content:encoded') || '')),
      url: decodeXml(extract(block, 'link') || '#'),
      source,
      publishedAt: new Date(extract(block, 'pubDate') || Date.now()).toISOString()
    };
  });
}

function extract(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1]?.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim() ?? '';
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260);
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function detectCoinTags(text: string) {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  const map = [
    ['bitcoin', 'BTC'], ['btc', 'BTC'], ['ethereum', 'ETH'], ['ether', 'ETH'], ['eth', 'ETH'],
    ['solana', 'SOL'], ['xrp', 'XRP'], ['ripple', 'XRP'], ['cardano', 'ADA'], ['dogecoin', 'DOGE'],
    ['chainlink', 'LINK'], ['bnb', 'BNB']
  ];
  for (const [needle, tag] of map) {
    if (lower.includes(needle) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function aggregateSentiment(items: NewsItem[]) {
  if (!items.length) return { label: 'Neutral', score: 0, confidence: 50 };
  const score = items.reduce((total, item) => total + item.sentiment.score, 0) / items.length;
  const label = score > 12 ? 'Bullish' : score < -12 ? 'Bearish' : 'Neutral';
  const confidence = Math.round(items.reduce((total, item) => total + item.sentiment.confidence, 0) / items.length);
  return { label, score: Math.round(score), confidence };
}
