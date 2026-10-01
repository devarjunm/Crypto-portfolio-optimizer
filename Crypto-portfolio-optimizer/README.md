# Crypto Portfolio Optimizer

A production-ready Next.js starter for a crypto portfolio optimization website. It uses live CoinGecko market/history data, computes Modern Portfolio Theory metrics, samples a constrained efficient frontier, and provides target allocations plus rebalance actions.

> Educational analytics only. This application does not provide investment advice, custody, or trade execution.

## What is included

- **Next.js App Router + TypeScript** frontend and API routes
- **Live crypto data** from CoinGecko with server-side cache revalidation
- **Live market dashboard** with prices, top gainers, top losers, trending coins, BTC dominance, volume, Fear & Greed Index, and coin search
- **Offline/synthetic fallback** so local demos still work if the API is rate-limited
- **MPT optimizer**
  - Daily log returns
  - Annualized expected returns
  - Covariance matrix
  - Portfolio volatility
  - Sharpe ratio
  - Diversification score
  - Efficient frontier sampling
  - Min/max asset constraints
  - Target allocation and buy/sell rebalance deltas
- **Accessible responsive UI** with semantic forms, keyboard focus, reduced motion support, and aria-live results
- **Signup/login starter** with hashed passwords and HTTP-only signed session cookies
- **Security headers** in `next.config.mjs`

## Project structure

```txt
src/
  app/
    api/auth/*                # signup, login, logout, current user APIs
    api/coins/*               # coin search and coin details APIs
    api/market/overview       # market dashboard API
    api/markets/route.ts       # live market data API
    api/optimize/route.ts      # optimizer API endpoint
    globals.css                # accessible responsive styling
    layout.tsx                 # metadata and root layout
    page.tsx                   # optimizer UI
  lib/
    assets.ts                  # supported crypto asset list
    coingecko.ts               # CoinGecko client + synthetic fallback
    math.ts                    # math helpers
    optimizer.ts               # MPT optimizer engine
  types/portfolio.ts           # shared TypeScript types
```

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Optional:

```env
COINGECKO_API_KEY=your_demo_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_SECRET=replace-with-a-long-random-secret
```

CoinGecko can work without a key, but free unauthenticated traffic is more rate-limited.

## Build for production

```bash
npm run build
npm run start
```

## Deploy

Recommended: Vercel.

1. Push this repository to GitHub.
2. Import the project in Vercel.
3. Add `COINGECKO_API_KEY` if available.
4. Deploy.




## Google Login setup

Google Login routes are included:

- `GET /api/auth/google`
- `GET /api/auth/google/callback`

To enable Google Login locally:

1. Go to Google Cloud Console.
2. Create an OAuth 2.0 Client ID for a Web application.
3. Add this authorized redirect URI:

```txt
http://localhost:3000/api/auth/google/callback
```

4. Add credentials to `.env.local`:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Without these variables, clicking Google Login shows a configuration message instead of logging in.

## News sentiment

The app includes `GET /api/news`, which fetches crypto RSS headlines when available and falls back to demo news if feeds are unavailable. Sentiment is rule-based and returns Bullish, Neutral, or Bearish with confidence.

## Watchlist and alerts

The app includes:

- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist?assetId=bitcoin`
- `POST /api/watchlist/alerts`
- `DELETE /api/watchlist/alerts?alertId=...`

Alerts are checked when the user opens or refreshes the page. Browser notifications work while the app tab is open. Production email/Telegram alerts require a background job or scheduled worker.

## Currency conversion

The UI includes a currency selector for:

- USD `$`
- INR `₹`

Market prices, portfolio values, P/L, optimizer values, and coin detail prices can be displayed in either currency. The current starter uses a fallback display rate:

```txt
1 USD ≈ 83.5 INR
```

For production, replace `USD_TO_INR` in `src/lib/currency.ts` with a live FX API or a server-cached exchange-rate provider.

## Authentication

The app now includes a built-in local signup/login starter:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Passwords are hashed with PBKDF2 and sessions are stored in HTTP-only signed cookies. In local development, users are saved to `data/users.json`, which is ignored by Git.

For real production, replace the file store with PostgreSQL/Supabase/Neon and set a strong `AUTH_SECRET` environment variable.

## API usage

### `GET /api/markets`

Returns supported assets with live USD price data.

### `GET /api/market/overview`

Returns live dashboard data: top coins, top gainers, top losers, trending coins, global market cap, 24h volume, BTC dominance, and Fear & Greed Index.

### `GET /api/coins/search?q=bitcoin`

Searches CoinGecko coins by text query.

### `GET /api/coins/[id]`

Returns coin details plus 30-day historical price data for the coin details page.


### `GET /api/portfolio`

Returns the logged-in user's holdings, transaction history, portfolio summary, allocation analytics, risk score, and AI suggestions.

### `POST /api/portfolio/holdings`

Adds a holding with `assetId`, `quantity`, and `averageBuyPrice`.

### `PUT /api/portfolio/holdings/[assetId]`

Edits an existing holding.

### `DELETE /api/portfolio/holdings/[assetId]`

Deletes a holding. Transaction history remains.

### `POST /api/portfolio/transactions`

Adds a buy/sell transaction and updates holding quantity, average buy price, and realized gains.

### `POST /api/portfolio/import-csv`

Imports holdings from CSV. Required headers: `assetId` or `symbol`, `quantity`, `averageBuyPrice`.

### `POST /api/optimize`

Example body:

```json
{
  "assetIds": ["bitcoin", "ethereum", "solana", "binancecoin"],
  "holdings": [
    { "id": "bitcoin", "value": 5000 },
    { "id": "ethereum", "value": 3500 },
    { "id": "solana", "value": 1800 },
    { "id": "binancecoin", "value": 1200 }
  ],
  "objective": "max_sharpe",
  "days": 365,
  "samples": 8000,
  "riskFreeRate": 0.04,
  "minWeight": 0,
  "maxWeight": 0.5,
  "targetReturn": 0.25
}
```

Objectives:

- `max_sharpe`
- `min_variance`
- `target_return`

## Production roadmap

To turn this starter into a commercial product, add:

1. **Authentication**: NextAuth/Auth.js, Clerk, or Supabase Auth.
2. **Database**: PostgreSQL + Prisma for saved portfolios and optimization history.
3. **User plans**: Stripe subscriptions, rate limits, and usage quotas.
4. **More data providers**: CoinGecko Pro, Kaiko, CryptoCompare, Binance historical klines.
5. **Optimization upgrades**: deterministic quadratic programming, Black-Litterman, CVaR, transaction costs, tax lots.
6. **Monitoring**: Sentry, OpenTelemetry, uptime checks, API latency dashboards.
7. **Compliance copy**: jurisdiction-specific risk disclaimers and terms of service.

## Notes on MPT and crypto

Modern Portfolio Theory assumes historical relationships are informative and that risk can be represented by variance/covariance. Crypto returns are non-normal, regime-dependent, and can experience liquidity shocks. Use the results as a scenario-analysis tool, not as automated investment advice.
