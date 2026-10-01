# Full Feature Roadmap

This project can grow into the complete crypto portfolio platform described in the feature list. Recommended phases:

## Completed / Started

### Core optimizer
- Modern Portfolio Theory optimizer
- Efficient frontier
- Rebalance actions
- Accessible responsive UI

### Authentication starter
- Local sign up/login/logout
- Password hashing
- HTTP-only signed session cookie

### Portfolio Management
- Add cryptocurrency holdings
- Edit holdings
- Delete holdings
- Buy/sell transaction history
- Import portfolio via CSV
- Track average buy price
- Current portfolio value
- Total profit/loss
- Daily profit/loss
- Unrealized and realized gains

### Google Login
- Google OAuth start route
- Google OAuth callback route
- Creates/logs in users through existing session system
- Requires Google Cloud OAuth credentials

### News & Sentiment
- Latest crypto headlines
- Filter by coin/keyword
- Rule-based AI sentiment: Bullish, Neutral, Bearish
- Aggregate market sentiment score

### Watchlist & Alerts
- Add/remove favorite coins
- Track daily changes
- Create price-above/price-below alerts
- Triggered alert status
- Browser notifications while app is open

### Portfolio Analytics Starter
- Asset allocation pie chart
- Estimated portfolio growth chart
- Diversification score
- Risk score and risk meter
- Best/worst performing coin
- Rule-based AI portfolio suggestions

### Live Market Dashboard
- Live cryptocurrency prices
- Top gainers
- Top losers
- Trending coins
- Market cap
- Trading volume
- BTC dominance
- Fear & Greed Index
- Search for any coin
- Coin details page
- 30-day price chart

## Next Phase: Production Auth + Database

Recommended stack from your choices:

- NextAuth/Auth.js
- MongoDB Atlas
- Google Login
- Email/password provider
- Forgot password
- Email verification
- Profile management

Required environment variables will include:

```env
AUTH_SECRET=...
MONGODB_URI=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
EMAIL_SERVER_HOST=...
EMAIL_SERVER_USER=...
EMAIL_SERVER_PASSWORD=...
EMAIL_FROM=...
```

## Portfolio Management Phase

Completed as a local-auth/MongoDB-ready starter. Next production upgrades:

- Move storage from local JSON to MongoDB Atlas
- Add multiple portfolios per user
- Add tax lots/FIFO/LIFO methods
- Add exchange import integrations

## Analytics Phase

- Asset allocation pie chart
- Portfolio growth chart
- Profit/loss chart
- Coin comparison
- Historical portfolio value
- Daily/weekly/monthly performance
- Risk metrics: volatility, Sharpe, Sortino, max drawdown, beta, correlation, risk score

## AI Phase

First version should be rule-based/statistical:

- AI-like allocation suggestions
- Risk explanations
- Recommendation engine: buy/hold/sell/avoid
- Simple trend prediction
- Chatbot answers from portfolio analytics

Later production ML can use:

- Python FastAPI ML service
- XGBoost/Prophet/LSTM workers
- Scheduled model retraining
- Model confidence and backtesting

## News, Alerts, Reports, Admin

- Crypto news feed
- AI sentiment analysis
- Watchlist
- Price alerts
- Email/browser/Telegram notifications
- PDF/CSV reports
- Tax-ready transaction history
- Admin panel
- Error logs and system analytics

## Bonus Features

- Multi-language support
- Multi-currency support
- Portfolio sharing link
- QR code sharing
- Crypto glossary
- Learning center
- Backtesting
- Paper trading
- DCA calculator
- Staking rewards calculator
- Rebalancing simulator
