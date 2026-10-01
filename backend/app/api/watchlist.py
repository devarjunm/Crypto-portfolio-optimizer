import secrets
from datetime import datetime,timezone
from fastapi import APIRouter,Request,HTTPException
from pydantic import BaseModel
from .auth import _user
from ..services.storage import read,write
from ..services.coingecko import markets
from ..assets import SUPPORTED
router=APIRouter()
def aid(value):
    v=value.strip().lower();a=next((x for x in SUPPORTED if x['id']==v or x['symbol'].lower()==v),None)
    if not a:raise HTTPException(400,'Unsupported watchlist coin.')
    return a['id']
async def current(request):
    u=await _user(request)
    if not u:raise HTTPException(401,'Please login to use watchlist.')
    return u
async def raw(uid):return (await read('watchlists.json',{})).get(uid,{'coins':['bitcoin','ethereum'],'alerts':[]})
async def snapshot(uid):
    w=await raw(uid);ids=list(dict.fromkeys(w['coins']+[a['assetId'] for a in w['alerts']]));m=await markets(ids) if ids else {'assets':[],'source':'coingecko'};am={x['id']:x for x in m['assets']};coins=[]
    for i in w['coins']:
        a=am.get(i,{});coins.append({'id':i,'symbol':a.get('symbol',i.upper()),'name':a.get('name',i),'currentPrice':a.get('currentPrice',0),'priceChange24h':a.get('priceChange24h',0),'marketCapRank':a.get('marketCapRank')})
    alerts=[]
    for x in w['alerts']:
        a=am.get(x['assetId'],{});price=a.get('currentPrice',0);alerts.append({**x,'symbol':a.get('symbol',x['assetId'].upper()),'name':a.get('name',x['assetId']),'currentPrice':price,'triggered':x['enabled'] and price>0 and (price>=x['targetPrice'] if x['direction']=='above' else price<=x['targetPrice'])})
    return {'generatedAt':datetime.now(timezone.utc).isoformat(),'source':m['source'],'coins':coins,'alerts':alerts}
class CoinBody(BaseModel):assetId:str
class AlertBody(BaseModel):assetId:str;direction:str='above';targetPrice:float
@router.get('/api/watchlist')
async def get_watch(request:Request):u=await current(request);return await snapshot(u['id'])
@router.post('/api/watchlist')
async def add_watch(request:Request,b:CoinBody):
    u=await current(request);w=await raw(u['id']);i=aid(b.assetId)
    if i not in w['coins']:w['coins'].append(i)
    s=await read('watchlists.json',{});s[u['id']]=w;await write('watchlists.json',s);return await snapshot(u['id'])
@router.delete('/api/watchlist')
async def remove_watch(request:Request,assetId:str=''):
    u=await current(request);w=await raw(u['id']);i=aid(assetId);w['coins']=[x for x in w['coins'] if x!=i];w['alerts']=[x for x in w['alerts'] if x['assetId']!=i];s=await read('watchlists.json',{});s[u['id']]=w;await write('watchlists.json',s);return await snapshot(u['id'])
@router.post('/api/watchlist/alerts')
async def add_alert(request:Request,b:AlertBody):
    u=await current(request);i=aid(b.assetId)
    if b.direction not in ('above','below') or b.targetPrice<=0 or b.targetPrice>1e9:raise HTTPException(400,'Alert target price must be positive.')
    w=await raw(u['id']);w['coins']=list(dict.fromkeys(w['coins']+[i]));w['alerts'].insert(0,{'id':secrets.token_hex(10),'assetId':i,'direction':b.direction,'targetPrice':b.targetPrice,'enabled':True,'createdAt':datetime.now(timezone.utc).isoformat()});s=await read('watchlists.json',{});s[u['id']]=w;await write('watchlists.json',s);return await snapshot(u['id'])
@router.delete('/api/watchlist/alerts')
async def delete_alert(request:Request,alertId:str=''):
    u=await current(request);w=await raw(u['id']);w['alerts']=[x for x in w['alerts'] if x['id']!=alertId];s=await read('watchlists.json',{});s[u['id']]=w;await write('watchlists.json',s);return await snapshot(u['id'])
