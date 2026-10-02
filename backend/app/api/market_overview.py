import logging
import math
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ..services.coingecko import get_json, LIVE_DATA_ERROR

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get('/api/market/overview', description='Market overview, market movers, and trending assets from CoinGecko.')
async def overview():
    markets = await get_json('/coins/markets', {
        'vs_currency': 'usd',
        'order': 'market_cap_desc',
        'per_page': 100,
        'page': 1,
        'sparkline': 'false',
        'price_change_percentage': '24h,7d,30d',
    }, 90)
    if not isinstance(markets, list) or not markets:
        raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)
    for coin in markets:
        if (not isinstance(coin, dict) or not coin.get('id') or not coin.get('name')
                or not coin.get('symbol') or not isinstance(coin.get('current_price'), (int, float))
                or isinstance(coin.get('current_price'), bool) or not math.isfinite(coin['current_price'])
                or coin['current_price'] <= 0):
            raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)

    changes = [coin for coin in markets if isinstance(coin.get('price_change_percentage_24h'), (int, float))]
    gainers = sorted(changes, key=lambda coin: coin['price_change_percentage_24h'], reverse=True)[:8]
    losers = sorted(changes, key=lambda coin: coin['price_change_percentage_24h'])[:8]
    warnings = []

    try:
        trending_response = await get_json('/search/trending', ttl=300)
        trending = [item['item'] for item in trending_response.get('coins', []) if isinstance(item, dict) and isinstance(item.get('item'), dict)][:8]
    except HTTPException:
        logger.warning('CoinGecko trending endpoint unavailable')
        trending = []
        warnings.append('Trending coins are temporarily unavailable.')

    try:
        response = await get_json('/global', ttl=300)
        global_data = response['data']
        totals = global_data['total_market_cap']
        volumes = global_data['total_volume']
        dominance = global_data['market_cap_percentage']
        values = (totals['usd'], volumes['usd'], dominance['btc'], global_data['active_cryptocurrencies'])
        if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in values):
            raise ValueError('Invalid global market values')
        global_summary = {
            'activeCryptocurrencies': int(values[3]),
            'totalMarketCapUsd': float(values[0]),
            'totalVolumeUsd': float(values[1]),
            'btcDominance': float(values[2]),
        }
    except (HTTPException, KeyError, TypeError, ValueError):
        logger.warning('CoinGecko global endpoint unavailable or malformed')
        global_summary = {
            'activeCryptocurrencies': None,
            'totalMarketCapUsd': None,
            'totalVolumeUsd': None,
            'btcDominance': None,
        }
        warnings.append('Global market statistics are temporarily unavailable.')

    return {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'source': 'coingecko',
        'global': global_summary,
        # Fear & Greed is not CoinGecko data; do not invent a value or mix providers.
        'fearGreed': None,
        'markets': markets[:30],
        'topGainers': gainers,
        'topLosers': losers,
        'trending': trending,
        'warnings': warnings,
    }
