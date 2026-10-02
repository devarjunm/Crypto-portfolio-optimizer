"""Centralized, validated CoinGecko Demo/Public API client."""

from __future__ import annotations

import logging
import math
import os
import re
import time
from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from ..assets import SUPPORTED

logger = logging.getLogger(__name__)
BASE = os.getenv("COINGECKO_BASE_URL", "https://api.coingecko.com/api/v3").rstrip("/")
_cache: dict[tuple, tuple[float, object]] = {}
_client: httpx.AsyncClient | None = None
LIVE_DATA_ERROR = "Live market data is temporarily unavailable. Please try again."


def _headers() -> dict[str, str]:
    key = os.getenv("COINGECKO_API_KEY", "").strip()
    # CoinGecko Demo API keys use x-cg-demo-api-key. Never place this key in the URL.
    return {"x-cg-demo-api-key": key} if key else {}


async def startup() -> None:
    global _client
    _client = httpx.AsyncClient(timeout=httpx.Timeout(20), headers=_headers())


async def shutdown() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def get_json(path: str, params: dict | None = None, ttl: int = 90):
    """GET and cache one CoinGecko endpoint response, with sanitized failures."""
    cache_key = (path, tuple(sorted((params or {}).items())))
    now = time.monotonic()
    cached = _cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    client = _client
    close_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=httpx.Timeout(20), headers=_headers())
    try:
        response = await client.get(f"{BASE}{path}", params=params)
        if response.is_error:
            logger.warning("CoinGecko returned HTTP %s for %s", response.status_code, path)
            status = 503 if response.status_code == 429 else 502
            raise HTTPException(status_code=status, detail=LIVE_DATA_ERROR)
        try:
            result = response.json()
        except ValueError as exc:
            logger.warning("CoinGecko returned malformed JSON for %s", path)
            raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR) from exc
        _cache[cache_key] = (now + ttl, result)
        return result
    except httpx.RequestError as exc:
        logger.warning("CoinGecko request failed for %s (%s)", path, type(exc).__name__)
        raise HTTPException(status_code=503, detail=LIVE_DATA_ERROR) from exc
    finally:
        if close_client:
            await client.aclose()


def _valid_number(value, *, positive: bool = False) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and (value > 0 if positive else True)


async def markets(ids: list[str] | None = None, currency: str = "usd", order: str = "market_cap_desc", per_page: int | None = None, page: int = 1):
    requested_ids = list(dict.fromkeys(ids if ids is not None else [asset["id"] for asset in SUPPORTED]))
    if not requested_ids:
        return {"assets": [], "source": "coingecko"}

    params = {
        "vs_currency": currency.lower(),
        "ids": ",".join(requested_ids),
        "order": order,
        "per_page": per_page or max(len(requested_ids), 1),
        "page": page,
        "sparkline": "false",
        "price_change_percentage": "24h",
    }
    data = await get_json("/coins/markets", params)
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)

    by_id = {}
    for coin in data:
        if not isinstance(coin, dict) or not isinstance(coin.get("id"), str):
            raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)
        price = coin.get("current_price")
        change_24h = coin.get("price_change_percentage_24h")
        if (not _valid_number(price, positive=True) or not _valid_number(change_24h)
                or not coin.get("name") or not coin.get("symbol")):
            logger.warning("CoinGecko returned an invalid market row for id %s", coin["id"])
            raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)
        by_id[coin["id"]] = coin

    missing = [asset_id for asset_id in requested_ids if asset_id not in by_id]
    if missing:
        logger.warning("CoinGecko omitted requested market IDs: %s", ",".join(missing))
        raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)

    assets = []
    for asset_id in requested_ids:
        coin = by_id[asset_id]
        assets.append({
            "id": coin["id"],
            "symbol": coin["symbol"].upper(),
            "name": coin["name"],
            "image": coin.get("image"),
            "currentPrice": coin["current_price"],
            "marketCapRank": coin.get("market_cap_rank"),
            "priceChange24h": change_24h,
        })
    return {"assets": assets, "source": "coingecko"}


async def history(asset_id: str, days: int = 365):
    if not re.fullmatch(r"[a-z0-9-]+", asset_id) or not 1 <= days <= 1825:
        raise HTTPException(status_code=400, detail="Invalid coin ID or history range.")
    data = await get_json(f"/coins/{quote(asset_id, safe='-')}/market_chart", {"vs_currency": "usd", "days": days, "interval": "daily"}, 1800)
    raw_prices = data.get("prices") if isinstance(data, dict) else None
    if not isinstance(raw_prices, list):
        raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)

    points_by_date: dict[str, tuple[float, float]] = {}
    timestamps = set()
    dates = set()
    for row in raw_prices:
        if (not isinstance(row, list) or len(row) != 2 or not _valid_number(row[0])
                or row[0] < 0 or row[0] > time.time() * 1000 + 86_400_000
                or not _valid_number(row[1], positive=True)):
            raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)
        timestamp, price = row
        if timestamp in timestamps:
            raise HTTPException(status_code=502, detail="CoinGecko returned duplicate history timestamps.")
        timestamps.add(timestamp)
        try:
            date = datetime.fromtimestamp(timestamp / 1000, timezone.utc).date().isoformat()
        except (OverflowError, OSError, ValueError) as exc:
            raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR) from exc
        # CoinGecko may return intraday observations for recent ranges even when
        # interval=daily is requested. Keep the latest real observation per UTC day.
        if date not in points_by_date or timestamp > points_by_date[date][0]:
            points_by_date[date] = (timestamp, float(price))

    points = [{"date": date, "price": item[1]} for date, item in sorted(points_by_date.items())]
    minimum = max(2, min(60, math.ceil(days * 0.6)))
    if len(points) < minimum:
        raise HTTPException(status_code=502, detail="CoinGecko returned insufficient historical data.")
    return {"series": {"id": asset_id, "points": points}, "source": "coingecko"}


async def search(query: str):
    clean_query = query.strip()
    if len(clean_query) < 2:
        return {"coins": [], "source": "coingecko"}
    data = await get_json("/search", {"query": clean_query}, 300)
    coins = data.get("coins") if isinstance(data, dict) else None
    if not isinstance(coins, list):
        raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)
    if any(not isinstance(coin, dict) or not all(isinstance(coin.get(field), str) and coin[field] for field in ('id', 'name', 'symbol')) for coin in coins[:12]):
        raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)
    return {"coins": coins[:12], "source": "coingecko"}


async def usd_to_inr_rate():
    response = await get_json('/exchange_rates', ttl=3600)
    rates = response.get('rates') if isinstance(response, dict) else None
    usd = rates.get('usd', {}).get('value') if isinstance(rates, dict) else None
    inr = rates.get('inr', {}).get('value') if isinstance(rates, dict) else None
    if not _valid_number(usd, positive=True) or not _valid_number(inr, positive=True):
        raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)
    return {'usdToInr': inr / usd, 'source': 'coingecko'}


async def coin_details(asset_id: str):
    if not re.fullmatch(r"[a-z0-9-]+", asset_id):
        raise HTTPException(status_code=400, detail="Invalid coin ID.")
    safe_id = quote(asset_id, safe="-")
    details = await get_json(
        f"/coins/{safe_id}",
        {"localization": "false", "tickers": "false", "market_data": "true", "community_data": "false", "developer_data": "false", "sparkline": "false"},
        180,
    )
    market_data = details.get("market_data") if isinstance(details, dict) else None
    current_price = market_data.get("current_price", {}).get("usd") if isinstance(market_data, dict) else None
    if not isinstance(details, dict) or not details.get("id") or not details.get("name") or not details.get("symbol") or not _valid_number(current_price, positive=True):
        raise HTTPException(status_code=502, detail=LIVE_DATA_ERROR)
    historical = await history(asset_id, 30)
    return {"details": details, "history": historical["series"]["points"], "source": "coingecko"}
