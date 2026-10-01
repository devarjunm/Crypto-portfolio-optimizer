from datetime import datetime,timezone
from fastapi import APIRouter
from ..assets import SUPPORTED
from ..services.coingecko import markets
router=APIRouter()
@router.get('/api/markets',description='Market prices for the optimizer supported assets.')
async def get_markets():return {**(await markets([a['id'] for a in SUPPORTED])),'generatedAt':datetime.now(timezone.utc).isoformat()}
