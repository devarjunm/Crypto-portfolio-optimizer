import csv,io,secrets
from datetime import datetime,timezone
from fastapi import APIRouter,Request,HTTPException
from pydantic import BaseModel
from .auth import _user
from ..services.storage import read,write
from ..services.coingecko import markets
from ..assets import SUPPORTED
router=APIRouter()
def now():return datetime.now(timezone.utc).isoformat()
def asset_id(value):
    clean=value.strip().lower();found=next((a['id'] for a in SUPPORTED if a['id']==clean or a['symbol'].lower()==clean),None)
    if not found:raise HTTPException(400,'Unsupported asset. Choose one of the supported crypto assets.')
    return found
def number(value,name,positive=False):
    try:n=float(value)
    except (ValueError,TypeError):raise HTTPException(400,f'{name} must be a number.')
    if not __import__('math').isfinite(n) or (n<=0 if positive else n<0):raise HTTPException(400,f'{name} must be a positive number.' if positive else f'{name} must be zero or a positive number.')
    return n
async def auth(request,action):
    u=await _user(request)
    if not u:raise HTTPException(401,'Please login to '+action+'.')
    return u
async def portfolio(uid):
    store=await read('portfolios.json',{});return store.get(uid,{'holdings':[],'transactions':[]})
async def save(uid,p):
    store=await read('portfolios.json',{});store[uid]=p;await write('portfolios.json',store)
async def snapshot(uid):
    p=await portfolio(uid);ids=[h['assetId'] for h in p['holdings']];data=await markets(ids) if ids else {'assets':[],'source':'coingecko'};market={a['id']:a for a in data['assets']};details=[]
    for h in p['holdings']:
        a=market.get(h['assetId'],next(x for x in SUPPORTED if x['id']==h['assetId']));price=a.get('currentPrice') or h['averageBuyPrice'];value=h['quantity']*price;cost=h['quantity']*h['averageBuyPrice'];change=a.get('priceChange24h') or 0;prev=price/(1+change/100 or 1)
        details.append({**h,'symbol':a['symbol'],'name':a['name'],'currentPrice':price,'priceChange24h':change,'currentValue':value,'costBasis':cost,'unrealizedGain':value-cost,'unrealizedGainPct':(value-cost)/cost*100 if cost else 0,'dailyGain':h['quantity']*(price-prev),'allocationWeight':0})
    total=sum(h['currentValue'] for h in details)
    for h in details:h['allocationWeight']=h['currentValue']/total if total else 0
    cost=sum(h['costBasis'] for h in details);unreal=sum(h['unrealizedGain'] for h in details);real=sum(t['realizedGain'] for t in p['transactions']);daily=sum(h['dailyGain'] for h in details);profit=unreal+real;summary={'totalValue':total,'totalCostBasis':cost,'totalUnrealizedGain':unreal,'totalRealizedGain':real,'totalProfitLoss':profit,'totalProfitLossPct':profit/cost*100 if cost else 0,'dailyProfitLoss':daily,'dailyProfitLossPct':daily/total*100 if total else 0,'bestPerformer':max(details,key=lambda x:x['unrealizedGainPct']) if details else None,'worstPerformer':min(details,key=lambda x:x['unrealizedGainPct']) if details else None}
    alloc=[{'assetId':h['assetId'],'symbol':h['symbol'],'name':h['name'],'value':h['currentValue'],'weight':h['allocationWeight']} for h in details];hhi=sum(x['weight']**2 for x in alloc);div=max(0,min(100,(1-hhi)*125));maxw=max((x['weight'] for x in alloc),default=0);loss=min(20,abs(summary['totalProfitLossPct'])/2) if summary['totalProfitLossPct']<0 else 0;risk=round(max(0,min(100,25+maxw*55+(100-div)*.25+loss)))
    suggestions=[]
    if not details:suggestions=[{'title':'Start with a diversified core','action':'Buy','confidence':74,'reason':'Add holdings first. A balanced starter mix can include BTC, ETH, and selected large-cap assets.'}]
    else:
        top=max(details,key=lambda x:x['allocationWeight']);suggestions.append({'title':f'Reduce {top["symbol"]} concentration' if top['allocationWeight']>.6 else 'Core allocation looks balanced','action':'Reduce' if top['allocationWeight']>.6 else 'Hold','confidence':82 if top['allocationWeight']>.6 else 76,'reason':f'{top["symbol"]} is {top["allocationWeight"]*100:.1f}% of the portfolio. Lowering concentration can reduce drawdown risk.' if top['allocationWeight']>.6 else 'No single asset is above 60%, so concentration risk is controlled for a crypto portfolio.'})
        if div<45:
            candidate=next((x for x in ['ethereum','solana','chainlink','bitcoin'] if x not in {h['assetId'] for h in details}),None);suggestions.append({'title':f'Add {candidate.upper()} for diversification' if candidate else 'Add another uncorrelated asset','action':'Buy','confidence':71,'reason':f'Diversification score is {div:.0f}/100. Adding another quality asset can improve allocation balance.'})
        if risk>70:suggestions.append({'title':'Rebalance risk down','action':'Reduce','confidence':79,'reason':f'Risk score is {risk}/100. Consider trimming volatile concentrated positions or increasing BTC/ETH weight.'})
        loser=min(details,key=lambda x:x['unrealizedGainPct'])
        if loser['unrealizedGainPct'] < -25:suggestions.append({'title':f'Review {loser["symbol"]} thesis','action':'Hold','confidence':66,'reason':f'{loser["symbol"]} is down {abs(loser["unrealizedGainPct"]):.1f}%. Re-check fundamentals before averaging down.'})
    return {'generatedAt':now(),'source':data['source'],'holdings':details,'transactions':p['transactions'],'summary':summary,'analytics':{'allocation':alloc,'diversificationScore':div,'riskScore':risk,'riskLevel':'Low' if risk<40 else 'Medium' if risk<70 else 'High','aiSuggestions':suggestions[:4]}}
class Holding(BaseModel):assetId:str;quantity:float;averageBuyPrice:float
class Transaction(BaseModel):assetId:str;type:str='buy';quantity:float;price:float;fee:float=0;date:str|None=None;notes:str|None=None
class CsvBody(BaseModel):csv:str
@router.get('/api/portfolio')
async def get_portfolio(request:Request):u=await auth(request,'view your portfolio');return await snapshot(u['id'])
async def upsert(uid,body,forced=None):
    aid=asset_id(forced or body.assetId);qty=number(body.quantity,'Quantity',True);price=number(body.averageBuyPrice,'Average buy price');p=await portfolio(uid);h=next((h for h in p['holdings'] if h['assetId']==aid),None)
    if h:h.update(quantity=qty,averageBuyPrice=price,updatedAt=now())
    else:p['holdings'].append({'assetId':aid,'quantity':qty,'averageBuyPrice':price,'createdAt':now(),'updatedAt':now()})
    await save(uid,p)
@router.post('/api/portfolio/holdings')
async def add_holding(request:Request,body:Holding):u=await auth(request,'add holdings');await upsert(u['id'],body);return await snapshot(u['id'])
@router.put('/api/portfolio/holdings/{asset_id_value}')
async def edit_holding(asset_id_value:str,request:Request,body:Holding):u=await auth(request,'edit holdings');await upsert(u['id'],body,asset_id_value);return await snapshot(u['id'])
@router.delete('/api/portfolio/holdings/{asset_id_value}')
async def delete_holding(asset_id_value:str,request:Request):
    u=await auth(request,'delete holdings');p=await portfolio(u['id']);aid=asset_id(asset_id_value);p['holdings']=[h for h in p['holdings'] if h['assetId']!=aid];await save(u['id'],p);return await snapshot(u['id'])
@router.post('/api/portfolio/transactions')
async def add_transaction(request:Request,body:Transaction):
    u=await auth(request,'add transactions');aid=asset_id(body.assetId);kind='sell' if body.type=='sell' else 'buy';qty=number(body.quantity,'Quantity',True);price=number(body.price,'Price',True);fee=number(body.fee,'Fee');p=await portfolio(u['id']);h=next((x for x in p['holdings'] if x['assetId']==aid),None);gain=0
    if kind=='buy':
        if not h:h={'assetId':aid,'quantity':0,'averageBuyPrice':0,'createdAt':now(),'updatedAt':now()};p['holdings'].append(h)
        total=h['quantity']+qty;h['averageBuyPrice']=(h['quantity']*h['averageBuyPrice']+qty*price+fee)/total;h['quantity']=total;h['updatedAt']=now()
    else:
        if not h or h['quantity']<qty:raise HTTPException(400,'Not enough quantity available to sell.')
        gain=qty*(price-h['averageBuyPrice'])-fee;h['quantity']-=qty;h['updatedAt']=now()
        if h['quantity']<=1e-8:p['holdings'].remove(h)
    try:date=datetime.fromisoformat(body.date.replace('Z','+00:00')).isoformat() if body.date else now()
    except ValueError:raise HTTPException(400,'Invalid transaction date.')
    p['transactions'].insert(0,{'id':secrets.token_hex(12),'assetId':aid,'type':kind,'quantity':qty,'price':price,'fee':fee,'date':date,'realizedGain':gain,'notes':body.notes.strip() if body.notes else None,'createdAt':now()});await save(u['id'],p);return await snapshot(u['id'])
@router.post('/api/portfolio/import-csv')
async def import_csv(request:Request,body:CsvBody):
    u=await auth(request,'import portfolio CSV'); rows=list(csv.reader(io.StringIO(body.csv))); 
    if len(rows)<2:raise HTTPException(400,'CSV must include a header row and at least one holding row.')
    headers=[x.strip().lower().replace('_','').replace('-','').replace(' ','') for x in rows[0]]
    def ix(names):return next((i for i,h in enumerate(headers) if h in names),-1)
    ai=ix({'assetid','coin','symbol','asset'});qi=ix({'quantity','qty','amount'});pi=ix({'averagebuyprice','avgprice','avgbuyprice','price'})
    if min(ai,qi,pi)<0:raise HTTPException(400,'CSV headers must include assetId/symbol, quantity, and averageBuyPrice.')
    imported=0
    for row in rows[1:]:
        try:
            if max(ai,qi,pi)>=len(row):continue
            b=Holding(assetId=row[ai],quantity=float(row[qi]),averageBuyPrice=float(row[pi]));await upsert(u['id'],b);imported+=1
        except (ValueError,HTTPException):continue
    if not imported:raise HTTPException(400,'No valid holdings found in CSV.')
    return {**await snapshot(u['id']),'importResult':{'imported':imported}}
