# Crypto Portfolio Optimizer

A Next.js and TypeScript frontend backed by FastAPI. CoinGecko is the single provider for crypto prices, market statistics, coin search, and price history. Portfolio analytics and optimization run on the backend. This application is for educational analysis and is not financial advice.

## Architecture

```text
User → Next.js on Netlify → FastAPI → CoinGecko
                           FastAPI → portfolio storage and optimization
```

The browser calls the shared frontend API client. In production, a Next.js rewrite proxies `/api/*` to FastAPI using the Netlify build variable `API_PROXY_TARGET`. CoinGecko API credentials stay on the backend.

## Repository structure

```text
src/
  app/                  Next.js pages and routes
  components/           UI and browser state
  lib/api.ts             Shared API client
  lib/currency.ts        Formatting and live FX conversion
  types/                 Frontend API/domain types
backend/
  app/main.py            FastAPI application and middleware
  app/api/               API routers
  app/services/          CoinGecko client, storage, sentiment
  app/optimization/      Authoritative portfolio calculations
  app/schemas/           Pydantic request/response models
  requirements.txt
data/                    Local JSON stores (development only)
netlify.toml             Next.js build and API proxy configuration
```

## Windows PowerShell development

Run the backend in one terminal from the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"
# Put the generated value in backend/.env as AUTH_SECRET.
python -m uvicorn app.main:app --reload --port 8000
```

Run the frontend in a second terminal from the repository root:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`, API docs at `http://localhost:8000/docs`, and health at `http://localhost:8000/health`.

## Environment variables

### Frontend (`.env.local`, Netlify)

| Variable | Development | Netlify production |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | `https://cryptooptimizer.netlify.app` |
| `API_PROXY_TARGET` | Not needed; frontend calls local FastAPI directly. | Render backend origin, e.g. `https://cryptooptimizer.onrender.com`. |

`NEXT_PUBLIC_API_URL` is the public Netlify site origin so browser requests use the same origin. `API_PROXY_TARGET` is read by `next.config.mjs` at build time to forward `/api/*` to the backend. Both are public origin values, not secrets. Netlify build uses the root `package.json`, `npm run build`, and `.next` publish directory.

### Backend (`backend/.env`, Render)

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENT` | Use `production` on Render. |
| `COINGECKO_API_KEY` | Optional CoinGecko Demo key; stored only on the backend. |
| `COINGECKO_BASE_URL` | Defaults to `https://api.coingecko.com/api/v3`. |
| `FRONTEND_URL` | Exact HTTPS Netlify site URL. |
| `CORS_ORIGINS` | Comma-separated HTTPS frontend origins; set to the Netlify URL. |
| `COOKIE_SECURE` | `true` in production. |
| `AUTH_SECRET` | Unique random secret, at least 32 characters. |
| `DATA_DIR` | Writable persistent directory for JSON stores; e.g. `/var/data` with a Render disk. |
| `GOOGLE_CLIENT_ID` | Optional Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Optional Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Optional OAuth callback, e.g. `https://cryptooptimizer.netlify.app/api/auth/google/callback`. Register the same URL in Google Cloud. |

Never put backend secrets in Netlify variables or commit `.env` files. The frontend does not need the CoinGecko key.

## CoinGecko data flow

All crypto market requests go through `backend/app/services/coingecko.py`:

- `GET /coins/markets` supplies current market rows and prices.
- `GET /coins/{id}/market_chart` supplies daily USD price history.
- `GET /search` supplies coin search results.
- `GET /coins/{id}` supplies coin detail data.
- `GET /global` supplies global market statistics.
- `GET /search/trending` supplies trending coins.
- `GET /exchange_rates` supplies BTC-denominated fiat rates used to calculate the live USD/INR conversion.

The client uses CoinGecko's API v3 host and sends `COINGECKO_API_KEY` as the `x-cg-demo-api-key` request header when present. Responses are cached briefly and validated for missing IDs, malformed values, non-positive prices, invalid/duplicate history points, and inadequate history. A provider failure returns an API error and a visible UI error; it never substitutes made-up prices or price histories.

The app uses CoinGecko IDs (not symbols) for the supported optimizer assets: Bitcoin, Ethereum, Solana, BNB, XRP, Cardano, Dogecoin, and Chainlink. USD is the calculation currency; INR display uses the live conversion returned by CoinGecko. If that conversion is unavailable, the UI says so rather than applying a stale fixed rate.

## API endpoints

- `GET /health` — service health.
- `GET /api/markets` — current prices for the optimizer asset set.
- `GET /api/market/overview` — live market table, gainers/losers, global stats, and CoinGecko trending data.
- `GET /api/market/fx` — live USD-to-INR conversion from CoinGecko rates.
- `GET /api/market/history/{coin_id}?days=365` — validated daily history.
- `GET /api/coins/search?q=bitcoin` — CoinGecko search.
- `GET /api/coins/{coin_id}` — CoinGecko details and 30-day chart data.
- `POST /api/optimize` — constrained portfolio optimization using CoinGecko historical prices.
- `GET/POST/PUT/DELETE /api/portfolio/...` — authenticated holdings, transactions, and CSV import.
- `GET/POST/DELETE /api/watchlist...` — authenticated watchlist and alerts.
- `GET /api/news` — live RSS headlines with rule-based sentiment; returns an error if no feed is available.
- `POST /api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `GET /api/auth/me`, and Google OAuth routes.

Errors use JSON such as `{ "error": "Live market data is temporarily unavailable. Please try again." }`.

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
```

Backend unit tests:

```powershell
cd backend
python -m unittest discover -s tests -v
```

With the backend running, test `http://localhost:8000/health`, then `http://localhost:8000/api/markets` and `http://localhost:8000/api/market/history/bitcoin?days=30`. The market response identifies `source: coingecko`.

## Deployment

### FastAPI on Render

Create a Render **Web Service** from this GitHub repository, branch `main`, with **Root Directory** `backend`.

- Build command: `pip install -r requirements.txt`
- Start command: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Set the backend variables in Render, including production `AUTH_SECRET`, `ENVIRONMENT=production`, `FRONTEND_URL`, `CORS_ORIGINS`, and `COOKIE_SECURE=true`.
- Attach a persistent disk mounted at `/var/data` and set `DATA_DIR=/var/data`, or replace the JSON store with a managed database before relying on user data. The default Render filesystem is not durable across service replacement.
- Verify `<render-service-url>/health` and `/docs`.

### Next.js on Netlify

Import the repository root (leave **Base directory** blank; do not select a nested app). Netlify should detect Next.js. Use `npm run build` and `.next` if setting these manually. Add `NEXT_PUBLIC_API_URL` with the canonical Netlify site origin and `API_PROXY_TARGET` with the Render backend origin to the Netlify site's environment variables. Next.js rewrites `/api/*` to that backend at build time. Push config changes to trigger a fresh deploy, then test login and live market requests in the browser.

`NEXT_PUBLIC_API_URL` must match the actual Netlify site's canonical URL. Configure backend secrets only on Render.

## Troubleshooting

- `Live market data is temporarily unavailable`: check the Render service logs, CoinGecko status/plan limits, backend key, and `/api/markets` response. The UI deliberately shows an error instead of invented data.
- API calls return a Netlify 404: confirm Netlify **Base directory** is blank/repository root and `API_PROXY_TARGET` is set in the Netlify build environment.
- API calls return a proxy error: check `API_PROXY_TARGET` and confirm the Render service `/health` is available.
- Login cookie does not persist: check HTTPS, `COOKIE_SECURE=true`, `FRONTEND_URL`, and CORS origin settings.
- Google login fails: configure both Google credentials and the exact proxied callback URI on Render and in Google Cloud.
- User/portfolio data disappears after deploy: configure a persistent disk/`DATA_DIR` or use a database. JSON file storage is a small single-process starter, not a multi-instance database.
