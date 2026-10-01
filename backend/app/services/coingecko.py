import os, asyncio, time
from datetime import datetime, timezone, timedelta
import httpx
from ..assets import SUPPORTED, ASSET_MAP

BASE = os.getenv('COINGECKO_BASE_URL', 'https://api.coingecko.com/api/v3').rstrip('/')
_cache = {}
_client = None

def _headers():
    key = os.getenv('COINGECKO_API_KEY')
    return {'x-cg-demo-api-key': key} if key else {}

async def startup():
    global _client
    _client = httpx.AsyncClient(timeout=20, headers=_headers())

async def shutdown():
    if _client:
        await _client.aclose()

async def get_json(path, params=None, ttl=90, external=False):
    key = (path, tuple(sorted((params or {}).items())))
    cached = _cache.get(key)
    now = time.monotonic()
    if cached and cached[0] > now: return cached[1]
    client = _client or httpx.AsyncClient(timeout=20, headers=_headers())
    close = _client is None
    try:
        url = path if external else f'{BASE}{path}'
        response = await client.get(url, params=params)
        response.raise_for_status()
        result = response.json()
        _cache[key] = (now + ttl, result)
        return result
    finally:
        if close: await client.aclose()

def fallback_asset(asset_id, index=0):
    return dict(ASSET_MAP.get(asset_id, {'id':asset_id,'symbol':asset_id[:6].upper(),'name':asset_id.replace('-',' ').title(),'currentPrice':0}))

async def markets(ids=None, currency='usd', order='market_cap_desc', per_page=None, page=1):
    ids = ids or [a['id'] for a in SUPPORTED]
    params = {'vs_currency':currency,'ids':','.join(ids),'order':order,'per_page':per_page or max(len(ids),1),'page':page,'sparkline':'false','price_change_percentage':'24h'}
    try:
        data = await get_json('/coins/markets', params)
        mapped = {coin['id']:coin for coin in data}
        return {'assets':[({'id':c['id'],'symbol':c['symbol'].upper(),'name':c['name'],'image':c.get('image'),'currentPrice':c.get('current_price',0),'marketCapRank':c.get('market_cap_rank'),'priceChange24h':c.get('price_change_percentage_24h')} if c['id'] in mapped else fallback_asset(c['id'])) for c in [{'id':i} for i in ids]],'source':'coingecko'}
    except (httpx.HTTPError, ValueError, KeyError):
        bases={'bitcoin':64000,'ethereum':3400,'solana':145,'binancecoin':590,'ripple':.54,'cardano':.42,'dogecoin':.12,'chainlink':14.5}
        return {'assets':[dict(fallback_asset(i),currentPrice=bases.get(i,10+j*7)) for j,i in enumerate(ids)],'source':'synthetic-fallback'}

def synthetic_history(asset_id, days=365):
    import math
    idx=next((i for i,a in enumerate(SUPPORTED) if a['id']==asset_id),-1)
    base={'bitcoin':64000,'ethereum':3400,'solana':145,'binancecoin':590,'ripple':.54,'cardano':.42,'dogecoin':.12,'chainlink':14.5}.get(asset_id,10+max(idx,0)*7)
    beta=.75 if asset_id=='bitcoin' else 1 if asset_id=='ethereum' else 1.25+max(idx,0)*.04
    drift=.00055+max(idx,0)*.00004; vol=.025*beta
    today=datetime.now(timezone.utc).date(); price=base/math.exp(drift*days*.25); points=[]
    for day in range(days,-1,-1):
        h=2166136261
        for ch in f'{asset_id}:{day}': h=((h ^ ord(ch))*16777619)&0xffffffff
        noise=(h/4294967295-.5)*2
        cyc=math.sin(day/18+beta)*.006+math.cos(day/47)*.004
        price=max(.000001,price*math.exp(drift+cyc+noise*vol))
        points.append({'date':(today-timedelta(days=day)).isoformat(),'price':price})
    return {'id':asset_id,'points':points}

async def history(asset_id, days=365):
    try:
        data=await get_json(f'/coins/{asset_id}/market_chart',{'vs_currency':'usd','days':days,'interval':'daily'},1800)
        bydate={datetime.fromtimestamp(ts/1000,timezone.utc).date().isoformat():price for ts,price in data.get('prices',[]) if price and price>0}
        points=[{'date':d,'price':p} for d,p in sorted(bydate.items())]
        if len(points)<60: raise ValueError('Insufficient historical prices')
        return {'series':{'id':asset_id,'points':points},'source':'coingecko'}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return {'series':synthetic_history(asset_id,days),'source':'synthetic-fallback'}

async def search(query):
    if len(query.strip())<2:return {'coins':[]}
    try:
        data=await get_json('/search',{'query':query.strip()},300)
        return {'coins':data.get('coins',[])[:12],'source':'coingecko'}
    except httpx.HTTPError:
        q=query.lower()
        return {'coins':[{'id':a['id'],'name':a['name'],'symbol':a['symbol'],'market_cap_rank':a.get('marketCapRank')} for a in SUPPORTED if q in a['id'] or q in a['name'].lower() or q in a['symbol'].lower()],'source':'synthetic-fallback'}

async def coin_details(asset_id):
    details, hist=await asyncio.gather(get_json(f'/coins/{asset_id}',{'localization':'false','tickers':'false','market_data':'true','community_data':'false','developer_data':'false','sparkline':'false'},180),history(asset_id,30),return_exceptions=True)
    if not isinstance(details,Exception):
        if isinstance(hist,Exception): hist={'series':synthetic_history(asset_id,30),'source':'synthetic-fallback'}
        return {'details':details,'history':hist['series']['points'],'source':'coingecko' if hist['source']=='coingecko' else 'mixed'}
    a=fallback_asset(asset_id); points=synthetic_history(asset_id,30)['points']; prices=[p['price'] for p in points]
    return {'source':'synthetic-fallback','history':points,'details':{'id':asset_id,'symbol':a['symbol'].lower(),'name':a['name'],'market_cap_rank':a.get('marketCapRank'),'market_data':{'current_price':{'usd':prices[-1]},'market_cap':{'usd':0},'total_volume':{'usd':0},'circulating_supply':0,'max_supply':None,'ath':{'usd':max(prices)},'atl':{'usd':min(prices)},'price_change_percentage_24h':0,'price_change_percentage_7d':0,'price_change_percentage_30d':0}}}
