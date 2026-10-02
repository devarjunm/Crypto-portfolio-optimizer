from datetime import datetime,timezone
from fastapi import APIRouter
from ..assets import SUPPORTED
from ..services.coingecko import markets,usd_to_inr_rate
router=APIRouter()
@router.get('/api/markets',description='Market prices for the optimizer supported assets.')
async def get_markets():return {**(await markets([a['id'] for a in SUPPORTED])),'generatedAt':datetime.now(timezone.utc).isoformat()}

@router.get('/api/market/fx',description='USD to INR exchange rate derived from CoinGecko BTC-to-currency rates.')
async def get_fx_rate():return await usd_to_inr_rate()
