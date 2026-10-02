import unittest
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.services import coingecko as client
from app.api.market_overview import overview
from app.optimization.optimizer import optimize
from app.schemas.portfolio import OptimizeRequest


class CoinGeckoClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_markets_returns_validated_provider_data(self):
        payload = [{
            'id': 'bitcoin', 'symbol': 'btc', 'name': 'Bitcoin', 'current_price': 67_123.45,
            'market_cap_rank': 1, 'price_change_percentage_24h': 1.25,
        }]
        with patch.object(client, 'get_json', new=AsyncMock(return_value=payload)):
            result = await client.markets(['bitcoin'])
        self.assertEqual(result['source'], 'coingecko')
        self.assertEqual(result['assets'][0]['currentPrice'], 67_123.45)

    async def test_markets_reject_missing_requested_coins(self):
        with patch.object(client, 'get_json', new=AsyncMock(return_value=[])):
            with self.assertRaises(HTTPException) as caught:
                await client.markets(['bitcoin'])
        self.assertEqual(caught.exception.status_code, 502)

    async def test_markets_reject_zero_or_malformed_prices(self):
        payload = [{'id': 'bitcoin', 'symbol': 'btc', 'name': 'Bitcoin', 'current_price': 0}]
        with patch.object(client, 'get_json', new=AsyncMock(return_value=payload)):
            with self.assertRaises(HTTPException):
                await client.markets(['bitcoin'])

    async def test_markets_reject_missing_or_nonfinite_24h_change(self):
        payload = [{'id': 'bitcoin', 'symbol': 'btc', 'name': 'Bitcoin', 'current_price': 100, 'price_change_percentage_24h': float('nan')}]
        with patch.object(client, 'get_json', new=AsyncMock(return_value=payload)):
            with self.assertRaises(HTTPException):
                await client.markets(['bitcoin'])

    async def test_provider_failure_is_not_replaced_with_price_data(self):
        with patch.object(client, 'get_json', new=AsyncMock(side_effect=HTTPException(503, 'provider unavailable'))):
            with self.assertRaises(HTTPException) as caught:
                await client.markets(['bitcoin'])
        self.assertEqual(caught.exception.status_code, 503)

    async def test_history_rejects_duplicate_timestamps(self):
        timestamp = 1_750_000_000_000
        payload = {'prices': [[timestamp, 100.0], [timestamp, 101.0]]}
        with patch.object(client, 'get_json', new=AsyncMock(return_value=payload)):
            with self.assertRaises(HTTPException) as caught:
                await client.history('bitcoin', 2)
        self.assertIn('duplicate', caught.exception.detail)

    async def test_history_uses_latest_intraday_observation_per_utc_day(self):
        timestamp = 1_750_000_000_000
        next_day = timestamp + 86_400_000
        payload = {'prices': [[timestamp, 100.0], [timestamp + 3_600_000, 102.0], [next_day, 103.0]]}
        with patch.object(client, 'get_json', new=AsyncMock(return_value=payload)):
            result = await client.history('bitcoin', 2)
        self.assertEqual(len(result['series']['points']), 2)
        self.assertEqual(result['series']['points'][0]['price'], 102.0)

    async def test_exchange_rate_is_derived_from_coin_gecko_rates(self):
        payload = {'rates': {'usd': {'value': 100.0}, 'inr': {'value': 8_300.0}}}
        with patch.object(client, 'get_json', new=AsyncMock(return_value=payload)):
            result = await client.usd_to_inr_rate()
        self.assertEqual(result, {'usdToInr': 83.0, 'source': 'coingecko'})


class MarketOverviewTests(unittest.IsolatedAsyncioTestCase):
    async def test_market_provider_failure_propagates_without_demo_rows(self):
        with patch('app.api.market_overview.get_json', new=AsyncMock(side_effect=HTTPException(503, 'unavailable'))):
            with self.assertRaises(HTTPException) as caught:
                await overview()
        self.assertEqual(caught.exception.status_code, 503)


class OptimizerTests(unittest.TestCase):
    def test_optimizer_returns_bounded_weights_from_test_price_series(self):
        start = date(2025, 1, 1)
        assets = [
            {'id': 'bitcoin', 'symbol': 'BTC', 'name': 'Bitcoin'},
            {'id': 'ethereum', 'symbol': 'ETH', 'name': 'Ethereum'},
        ]
        series = []
        for asset_index, base in enumerate((40_000.0, 2_000.0)):
            points = []
            for day in range(90):
                # Deterministic test fixture only; production values come from CoinGecko.
                price = base * (1.001 + ((day % 7) - 3) * 0.0001) ** day
                points.append({'date': (start + timedelta(days=day)).isoformat(), 'price': price})
            series.append({'id': assets[asset_index]['id'], 'points': points})
        request = OptimizeRequest(assetIds=['bitcoin', 'ethereum'], samples=500, minWeight=0, maxWeight=1)
        result = optimize(assets, series, request)
        self.assertEqual(len(result['allocations']), 2)
        self.assertAlmostEqual(sum(item['weight'] for item in result['allocations']), 1.0, places=6)
        self.assertTrue(all(item['weight'] >= 0 for item in result['allocations']))


if __name__ == '__main__':
    unittest.main()
