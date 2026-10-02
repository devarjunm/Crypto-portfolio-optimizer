import asyncio,re,html,base64
from datetime import datetime,timezone
from fastapi import APIRouter, HTTPException
import httpx
from ..services.sentiment import analyze
router=APIRouter();FEEDS=[('CoinDesk','https://www.coindesk.com/arc/outboundfeeds/rss/'),('Cointelegraph','https://cointelegraph.com/rss'),('Decrypt','https://decrypt.co/feed')]
def parse(xml,source):
    out=[]
    for block in re.findall(r'<item[\s\S]*?</item>',xml,re.I)[:12]:
        def ext(tag):
            m=re.search(r'<'+re.escape(tag)+r'[^>]*>([\s\S]*?)</'+re.escape(tag)+r'>',block,re.I);return (m.group(1) if m else '').removeprefix('<![CDATA[').removesuffix(']]>').strip()
        title=html.unescape(ext('title'));desc=re.sub('<[^>]*>',' ',html.unescape(ext('description') or ext('content:encoded')));url=html.unescape(ext('link'))
        if not title or not url.startswith(('https://','http://')):continue
        try:published=datetime.strptime(ext('pubDate'),'%a, %d %b %Y %H:%M:%S %z').astimezone(timezone.utc).isoformat()
        except Exception:published=datetime.now(timezone.utc).isoformat()
        out.append({'title':title,'description':' '.join(desc.split())[:260],'url':url,'source':source,'publishedAt':published})
    return out
@router.get('/api/news')
async def news(q:str=''):
    async def fetch(client,name,url):
        r=await client.get(url);r.raise_for_status();return parse(r.text,name)
    try:
        async with httpx.AsyncClient(timeout=12,follow_redirects=True) as client:
            rs=await asyncio.gather(*(fetch(client,*f) for f in FEEDS),return_exceptions=True)
        raw=[i for r in rs if not isinstance(r,Exception) for i in r][:30]
        if not raw:raise ValueError()
        source='rss'
    except Exception as exc:raise HTTPException(503,'Live crypto news is temporarily unavailable. Please try again.') from exc
    if not raw:raise HTTPException(503,'Live crypto news is temporarily unavailable. Please try again.')
    mapping=[('bitcoin','BTC'),('btc','BTC'),('ethereum','ETH'),('ether','ETH'),('eth','ETH'),('solana','SOL'),('xrp','XRP'),('ripple','XRP'),('cardano','ADA'),('dogecoin','DOGE'),('chainlink','LINK'),('bnb','BNB')];items=[]
    for ix,item in enumerate(raw):
        text=item['title']+' '+item['description'];lower=text.lower();tags=list(dict.fromkeys(tag for word,tag in mapping if word in lower));item.update(id=f"{item['source']}-{ix}-{base64.urlsafe_b64encode(item['title'].encode()).decode()[:12]}",coinTags=tags,sentiment=analyze(item['title']+'. '+item['description']))
        if not q or q.lower() in (item['title']+' '+item['description']+' '+' '.join(tags)).lower():items.append(item)
    avg=sum(x['sentiment']['score'] for x in items)/len(items) if items else 0;label='Bullish' if avg>12 else 'Bearish' if avg< -12 else 'Neutral';confidence=round(sum(x['sentiment']['confidence'] for x in items)/len(items)) if items else 50
    return {'generatedAt':datetime.now(timezone.utc).isoformat(),'source':source,'items':items[:24],'aggregate':{'label':label,'score':round(avg),'confidence':confidence}}
