import asyncio
from datetime import datetime,timezone
from fastapi import APIRouter
from ..services.coingecko import get_json
from ..assets import SUPPORTED
router=APIRouter()
@router.get('/api/market/overview',description='Market overview, leading movers, trending assets and Fear & Greed.')
async def overview():
    fallback=[{'id':a['id'],'symbol':a['symbol'].lower(),'name':a['name'],'current_price':[64000,3400,145,590,.54,.42,.12,14.5][i],'market_cap':[1.25e12,420e9,68e9,91e9,31e9,15e9,18e9,8.5e9][i],'market_cap_rank':a['marketCapRank'],'total_volume':[28e9,16e9,3e9,1.2e9,1.1e9,430e6,900e6,520e6][i],'price_change_percentage_24h':[1.8,.9,6.4,-.6,2.1,-1.2,4.8,3.3][i],'price_change_percentage_7d_in_currency':[4.2,2.5,11.1,-1.8,3.2,-2.2,9.1,6.4][i],'price_change_percentage_30d_in_currency':[12.6,8.2,20.5,4.2,7.4,-5.1,16.8,10.9][i]} for i,a in enumerate(SUPPORTED)]
    source='coingecko'
    try:markets=await get_json('/coins/markets',{'vs_currency':'usd','order':'market_cap_desc','per_page':100,'page':1,'sparkline':'false','price_change_percentage':'24h,7d,30d'})
    except Exception:markets=fallback;source='synthetic-fallback'
    changes=[x for x in markets if isinstance(x.get('price_change_percentage_24h'),(int,float))];gainers=sorted(changes,key=lambda x:x.get('price_change_percentage_24h',0),reverse=True)[:8];losers=sorted(changes,key=lambda x:x.get('price_change_percentage_24h',0))[:8]
    try:trending=[x['item'] for x in (await get_json('/search/trending',ttl=300)).get('coins',[])][:8]
    except Exception:trending=[{'id':x['id'],'name':x['name'],'symbol':x['symbol'],'market_cap_rank':x.get('market_cap_rank'),'score':i} for i,x in enumerate(fallback[:6])]
    total=sum(x.get('market_cap') or 0 for x in markets);btc=next((x.get('market_cap') or 0 for x in markets if x['id']=='bitcoin'),0);global_data={'activeCryptocurrencies':len(markets),'totalMarketCapUsd':total,'totalVolumeUsd':sum(x.get('total_volume') or 0 for x in markets),'btcDominance':btc/max(total,1)*100}
    try:
        g=(await get_json('/global',ttl=300))['data'];global_data={'activeCryptocurrencies':g['active_cryptocurrencies'],'totalMarketCapUsd':g['total_market_cap']['usd'],'totalVolumeUsd':g['total_volume']['usd'],'btcDominance':g['market_cap_percentage']['btc']}
    except Exception:pass
    fg={'value':52,'classification':'Neutral','source':'fallback'}
    try:
        f=(await get_json('https://api.alternative.me/fng/',{'limit':1},3600,True))['data'][0];fg={'value':int(f['value']),'classification':f['value_classification'],'source':'alternative.me'}
    except Exception:pass
    return {'generatedAt':datetime.now(timezone.utc).isoformat(),'source':source,'global':global_data,'fearGreed':fg,'markets':markets[:30],'topGainers':gainers,'topLosers':losers,'trending':trending}
