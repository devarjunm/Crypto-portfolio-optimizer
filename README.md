# Crypto Portfolio Optimizer

Next.js and React provide the existing responsive UI. The FastAPI service is the application backend for CoinGecko data, portfolio optimization, authentication, portfolio storage, news, and watchlists. Optimization is educational analytics, not investment advice.

## Run locally

Start the backend in one terminal (PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

Start the frontend in another terminal from the repository root:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The frontend is at http://localhost:3000, API docs at http://localhost:8000/docs, and health check at http://localhost:8000/health.

## Configuration

Frontend `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Backend `backend/.env` (copy from `backend/.env.example`):

```env
COINGECKO_API_KEY=
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
AUTH_SECRET=replace-with-a-long-random-secret
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
```

CoinGecko works without a key with lower rate limits. Google login needs a client ID and secret and the redirect URI registered at Google. For secure production cookies behind HTTPS, set `COOKIE_SECURE=true`. Never commit `.env` files.

The backend uses the same JSON stores under the project `data/` directory. To preserve existing account sessions, configure the backend with the same `AUTH_SECRET` that signed the old Next.js cookies before switching services.

## API routes

- `POST /api/optimize` computes constrained max-Sharpe, minimum-variance, and target-return allocations, portfolio metrics, and an efficient frontier from aligned daily log returns.
- `GET /api/markets`, `GET /api/market/overview`, `GET /api/coins/search?q=...`, `GET /api/coins/{id}` serve market and coin information.
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, and Google OAuth routes provide cookie-based sessions.
- `GET /api/portfolio`, holding CRUD, transactions, and CSV import provide the user's portfolio summary and analytics.
- `GET/POST/DELETE /api/watchlist`, `POST/DELETE /api/watchlist/alerts`, and `GET /api/news` power the watchlist, price alerts, and sentiment panels.

API errors use JSON `{ "error": "..." }` responses. Market/history APIs retain their existing synthetic fallback behavior when providers fail. Local account and portfolio JSON files are written beneath `data/` and excluded from Git; replace the small JSON storage service with PostgreSQL when needed.

The old Next.js `src/app/api/**` handlers were removed after verifying the frontend no longer calls them. FastAPI is the sole API implementation.
