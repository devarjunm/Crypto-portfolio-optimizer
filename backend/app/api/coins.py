from fastapi import APIRouter,Query,HTTPException
from ..services.coingecko import search,coin_details
router=APIRouter()
@router.get('/api/coins/search')
async def search_coins(q:str=Query(default='')):return await search(q)
@router.get('/api/coins/{asset_id}')
async def coin(asset_id:str):
    if not asset_id.strip():raise HTTPException(400,'Coin id is required.')
    return await coin_details(asset_id)
