import math, numpy as np
from .math import aligned_log_returns, covariance_matrix, portfolio_variance

def _rng(seed):
    state=seed & 0xffffffff
    while True:
        state=(state+0x6d2b79f5)&0xffffffff; t=state
        t=((t^(t>>15))*(t|1))&0xffffffff; t^=(t+(((t^(t>>7))*(t|61))&0xffffffff))&0xffffffff
        yield ((t^(t>>14))&0xffffffff)/4294967296

def optimize(assets, series, request):
    n=len(assets)
    if n<2: raise ValueError('Select at least two assets to optimize a diversified portfolio.')
    low=max(0,min(.5,request.min_weight)); high=max(low,min(1,request.max_weight))
    if low*n>1: raise ValueError('Minimum weight is infeasible for the number of assets selected.')
    if high*n<1: raise ValueError('Maximum weight is infeasible for the number of assets selected.')
    aligned=aligned_log_returns(series)
    if len(aligned)<30: raise ValueError('Not enough overlapping price history to calculate reliable returns.')
    values=aligned.to_numpy() if hasattr(aligned,'to_numpy') else np.asarray(aligned)
    returns=np.mean(values,axis=0)*365; cov=covariance_matrix(values)*365
    vol=np.sqrt(np.maximum(np.diag(cov),0)); rng=_rng(42+n*17+round(high*1000)); candidates=[]
    def constrain(w):
        w=np.asarray(w,dtype=float); w=w/w.sum() if w.sum()>0 else np.ones(n)/n; w=np.clip(w,low,high)
        for _ in range(100):
            delta=1-w.sum()
            if abs(delta)<1e-10:break
            ids=np.where(w<high if delta>0 else w>low)[0]
            if not len(ids):break
            w[ids]=np.clip(w[ids]+delta/len(ids),low,high)
        return w
    def add(w):
        w=constrain(w); ret=float(w@returns); volatility=math.sqrt(portfolio_variance(w,cov)); sh=(ret-request.risk_free_rate)/volatility if volatility>0 else 0
        metrics={'expectedReturn':ret,'volatility':volatility,'sharpeRatio':sh,'diversificationScore':1-float(w@w),'maxDrawdownEstimate':min(.95,1.7*volatility)}
        candidates.append({'weights':w,'metrics':metrics})
    add(np.ones(n)/n); add(1/np.maximum(vol,.000001))
    remaining=1-low*n
    for _ in range(request.samples):
        weights=None
        for _ in range(500):
            raw=np.array([-math.log(max(.0000001,next(rng))) for _ in range(n)]); raw=raw/raw.sum(); cand=low+raw*remaining
            if np.all(cand<=high+1e-9):weights=cand;break
        add(weights if weights is not None else np.ones(n)/n)
    unique={}
    for c in candidates:unique.setdefault(tuple(np.round(c['weights'],3)),c)
    candidates=list(unique.values()); warnings=[]
    feasible=[c for c in candidates if c['metrics']['expectedReturn']>=request.target_return] if request.objective=='target_return' else candidates
    if request.objective=='target_return' and not feasible:warnings.append('No sampled portfolio reached the target return. Showing the closest high-return portfolio instead.')
    pool=feasible or candidates
    if request.objective=='min_variance':best=min(pool,key=lambda c:c['metrics']['volatility'])
    elif request.objective=='target_return':best=min(pool,key=lambda c:(max(0,request.target_return-c['metrics']['expectedReturn']),c['metrics']['volatility']))
    else:best=max(pool,key=lambda c:c['metrics']['sharpeRatio'])
    holdings={h.id:max(0,h.value) for h in request.holdings}; total=sum(max(0,h.value) for h in request.holdings); allocations=[]
    for i,a in enumerate(assets):
        current=holdings.get(a['id'],0); target=total*best['weights'][i] if total else 0; delta=target-current
        allocations.append({'id':a['id'],'symbol':a['symbol'],'name':a['name'],'weight':float(best['weights'][i]),'expectedReturn':float(returns[i]),'volatility':float(vol[i]),'currentValue':current,'currentWeight':current/total if total else 0,'targetValue':target,'deltaValue':delta,'action':'hold' if abs(delta)<max(total*.005,1) else 'buy' if delta>0 else 'sell'})
    ordered=sorted(candidates,key=lambda c:(c['metrics']['volatility'],-c['metrics']['expectedReturn'])); frontier=[]; best_ret=-float('inf')
    for c in ordered:
        if c['metrics']['expectedReturn']>best_ret+.0025:frontier.append({**c['metrics'],'weights':c['weights'].tolist()});best_ret=c['metrics']['expectedReturn']
    if len(frontier)>48:frontier=[p for i,p in enumerate(frontier) if i%math.ceil(len(frontier)/48)==0][:48]
    return {'allocations':allocations,'metrics':best['metrics'],'frontier':frontier,'warnings':warnings}
